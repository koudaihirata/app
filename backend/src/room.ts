// src/room.ts
import type { Env, Client, Phase } from './types'
import { onLobbyConnect, handleLobbyMessage } from './ws/lobby'
import { GameEngine } from './ws/game'

const MAX_MEMBERS = 6;
const CLOSE_ROOM_FULL = 4000; 

export class Room {
  private state: DurableObjectState
  private env: Env

  private phase: Phase = 'lobby'
  private clients: Set<Client> = new Set()
  private names: Map<Client, string> = new Map()
  private clientIds: Map<Client, string> = new Map()
  private preferredHostId: string | null = null
  private hostClientId: string | null = null

  private game = new GameEngine()

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
  }

  // 共通ユーティリティ
  private send(ws: Client, obj: unknown) { ws.send(JSON.stringify(obj)) }
  private broadcast(obj: unknown) {
    const s = JSON.stringify(obj)
    for (const ws of this.clients) { try { ws.send(s) } catch {} }
  }
  private members(): string[] { return Array.from(this.names.values()) }
  private players(): string[] { return this.members() }
  private broadcastMembers() {
    this.broadcast({
      type: 'members',
      members: this.currentMembers(),
      hostClientId: this.hostClientId ?? undefined,
    })
  }
  private ensureClientId(ws: Client, candidate?: string | null): boolean {
    if (!candidate) return false
    this.clientIds.set(ws, candidate)

    if (!this.preferredHostId) {
      this.preferredHostId = candidate
    }

    if (candidate === this.preferredHostId && this.hostClientId !== candidate) {
      this.hostClientId = candidate
      return true
    }

    return false
  }
  private forceSetHost(clientId: string) {
    this.preferredHostId = clientId
    this.hostClientId = clientId
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const name = url.searchParams.get('name') ?? 'Guest'
    const roomName = url.searchParams.get('room') ?? '無題ルーム'
    const clientIdFromQuery = url.searchParams.get('cid')

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }

    const pair = new WebSocketPair()
    // ★ 配列アクセスで明示
    const client = pair[0]
    const server = pair[1]
    server.accept()

    // 満員チェック（ロビーのみ）。ゲーム進行中は再接続を許可する。
    if (this.phase === 'lobby' && this.clients.size >= MAX_MEMBERS) {
      server.send(JSON.stringify({
        type: 'error',
        code: 'ROOM_FULL',
        text: `部屋の人数制限(${MAX_MEMBERS}人)で入室できません`,
      }))
      server.close(CLOSE_ROOM_FULL, 'ROOM_FULL')
      return new Response(null, { status: 101, webSocket: client })
    }

    // 同名クライアントがまだ残っていれば切断して掃除
    for (const [existingWs, existingName] of this.names.entries()) {
      if (existingName === name) {
        const removedId = this.clientIds.get(existingWs)
        try { existingWs.close(4101, 'DUPLICATE_NAME') } catch {}
        this.clients.delete(existingWs)
        this.names.delete(existingWs)
        this.clientIds.delete(existingWs)
        if (removedId && removedId === this.hostClientId) {
          this.hostClientId = null
        }
        if (removedId && removedId === this.preferredHostId) {
          this.preferredHostId = null
        }
        this.broadcastMembers()
      }
    }

    // 参加処理
    this.clients.add(server)
    this.names.set(server, name)
    const hostChanged = this.ensureClientId(server, clientIdFromQuery)
    if (hostChanged) this.broadcastMembers()

    // 日本語を英数に変換
    // const roomId = this.state.id ? this.state.id.toString() : 'unknown'

    const clientByName = (player: string): Client | undefined => {
      for (const [ws, storedName] of this.names.entries()) {
        if (storedName === player) return ws
      }
      return undefined
    }

    const gameDeps = {
      send: (w: Client, o: unknown) => this.send(w, o),
      broadcast: (o: unknown) => this.broadcast(o),
      getPlayers: () => this.players(),
      sendTo: (player: string, o: unknown) => {
        const target = clientByName(player)
        if (target) this.send(target, o)
      }
    }

    const lobbyDeps = {
      send: (w: Client, o: unknown) => this.send(w, o),
      broadcast: (o: any) => {
        if (o && typeof o === 'object' && (o as any).type === 'members') {
          const payload = {
            ...(o as Record<string, unknown>),
            hostClientId: this.hostClientId ?? undefined,
          }
          this.broadcast(payload)
          return
        }
        this.broadcast(o)
      },
      sendTo: (player: string, o: unknown) => {
        const target = clientByName(player)
        if (target) this.send(target, o)
      },
      getMembers: () => this.members(),
      getHostId: () => this.hostClientId,
      isHost: (clientId?: string) => !!clientId && clientId === this.hostClientId,
    }

    if (this.phase === 'lobby') {
      onLobbyConnect(
        lobbyDeps,
        server, name, roomName
      )
    } else {
      this.game.ensureStarted({
        broadcast: (o) => this.broadcast(o),
        send: (w, o) => this.send(w, o), // 未使用
        getPlayers: () => this.players(),
        sendTo: function (player: string, obj: unknown): void {
          throw new Error('Function not implemented.');
        }
      })
      // 参加者には現状通知
      this.send(server, { type:'phase_changed', phase:'game' })
      this.send(server, {
        type:'state',
        hp: Object.fromEntries(this.game.state.hp),
        round: this.game.state.round,
        turn: this.game.currentTurnName(),
      })
      this.game.sendHandSnapshot(gameDeps, name)
    }

    const promoteToGame = () => {
      if (this.phase === 'game') return
      this.phase = 'game'
      this.game.ensureStarted(gameDeps)
    }

    server.addEventListener('message', async (evt) => {
      try {
        let text = ''
        if (typeof evt.data === 'string') {
          text = evt.data
        } else if (evt.data instanceof ArrayBuffer) {
          text = new TextDecoder().decode(evt.data)
        } else if (evt.data && typeof (evt.data as any).byteLength === 'number') {
          // ArrayBufferView（例: Uint8Array など）
          const view = evt.data as unknown as ArrayBufferView
          text = new TextDecoder().decode(view.buffer)
        } else {
          server.send(JSON.stringify({ type: 'error', text: '未対応のフレーム形式' }))
          return
        }
        if (!text) return

        const msg = JSON.parse(text)

        if (msg && msg.type === 'join') {
          if (typeof msg.clientId === 'string') {
            const hostChanged = this.ensureClientId(server, msg.clientId)
            if (hostChanged) this.broadcastMembers()
          }
          return
        }

        if (msg && msg.type === 'claim_host') {
          const clientId = this.clientIds.get(server)
          if (!clientId) {
            server.send(JSON.stringify({ type: 'error', text: 'clientIdが確認できません' }))
            return
          }
          if (this.hostClientId && this.hostClientId !== clientId) {
            server.send(JSON.stringify({ type: 'error', text: '既にホストが設定されています' }))
            return
          }
          if (this.hostClientId === clientId) return
          this.forceSetHost(clientId)
          this.broadcastMembers()
          this.broadcast({ type: 'system', text: `👑 ${name} がホストになりました`, at: Date.now() })
          return
        }

        if (this.phase === 'lobby') {
          const clientId = this.clientIds.get(server)
          await handleLobbyMessage(lobbyDeps, server, name, clientId, this.env, msg, promoteToGame)
          return
        }

        if (msg.type === 'chat') {
          this.broadcast({ type: 'chat', from: name, text: String(msg.text ?? ''), at: Date.now() })
          return
        }

        if (msg.type === 'ping') {
          server.send(JSON.stringify({ type: 'pong', at: Date.now() }))
          return
        }

        const result = this.game.handleMessage(gameDeps, server, name, msg)
        if (result === 'game_over') {
          this.phase = 'lobby'
          this.broadcast({ type: 'phase_changed', phase: 'lobby' })
        }
      } catch (e) {
        console.log('[DO] parse error', e)
        server.send(JSON.stringify({ type: 'error', text: 'JSON を解析できませんでした' }))
      }
    })

    server.addEventListener('close', () => {
      const removedId = this.clientIds.get(server)
      this.clients.delete(server)
      this.names.delete(server)
      this.clientIds.delete(server)
      if (removedId && removedId === this.hostClientId) {
        this.hostClientId = null
      }
      if (removedId && removedId === this.preferredHostId) {
        this.preferredHostId = null
      }

      this.broadcast({
        type: 'system',
        text: `👋 ${name} が退室しました`,
        at: Date.now()
      })

      this.broadcastMembers()

      if (this.clients.size === 0) {
        this.phase = 'lobby'
        this.game = new GameEngine()
        // ホストの clientId は保持するが、アクティブな接続はいない
        this.hostClientId = null
        this.preferredHostId = null
        this.broadcast({
          type: 'system',
          text: '🔴 ルームは一旦リセットされました',
          at: Date.now()
        })
      }
    })

    return new Response(null, { status: 101, webSocket: client })
  }

  // 今いるメンバーの名前配列を返す
  private currentMembers(): string[] {
    return Array.from(this.names.values())
  }
}
