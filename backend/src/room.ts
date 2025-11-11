// src/room.ts
import type { Env, Client, Phase, WsMsg } from './types'
import { onLobbyConnect, onLobbyDisconnect, handleLobbyMessage } from './ws/lobby'
import { GameEngine } from './ws/game'

const MAX_MEMBERS = 6;
const CLOSE_ROOM_FULL = 4000; 

export class Room {
  private state: DurableObjectState
  private env: Env

  private phase: Phase = 'lobby'
  private clients: Set<Client> = new Set()
  private names: Map<Client, string> = new Map()

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

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const name = url.searchParams.get('name') ?? 'Guest'
    const roomName = url.searchParams.get('room') ?? '無題ルーム'

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }

    const pair = new WebSocketPair()
    // ★ 配列アクセスで明示
    const client = pair[0]
    const server = pair[1]
    server.accept()

    // 満員チェック：満員なら error を一発返して閉じる（参加登録はしない）
    if (this.clients.size >= MAX_MEMBERS) {
      server.send(JSON.stringify({
        type: 'error',
        code: 'ROOM_FULL',
        text: `部屋の人数制限(${MAX_MEMBERS}人)で入室できません`,
      }))
      server.close(CLOSE_ROOM_FULL, 'ROOM_FULL')
      return new Response(null, { status: 101, webSocket: client })
    }

    // 参加処理
    this.clients.add(server)
    this.names.set(server, name)

    // 日本語を英数に変換
    // const roomId = this.state.id ? this.state.id.toString() : 'unknown'
  
    if (this.phase === 'lobby') {
      onLobbyConnect(
        { send: (w,o)=>this.send(w,o), broadcast:(o)=>this.broadcast(o), getMembers:()=>this.members() },
        server, name, roomName
      )
    } else {
      // ゲームフェーズ：最新状態を渡す・必要ならensureStart
      this.game.ensureStarted({
        broadcast:(o)=>this.broadcast(o),
        send:(w,o)=>this.send(w,o), // 未使用
        getPlayers:()=>this.players()
      })
      // 参加者には現状通知
      this.send(server, { type:'phase_changed', phase:'game' })
      this.send(server, {
        type:'state',
        hp: Object.fromEntries(this.game.state.hp),
        round: this.game.state.round,
        turn: this.game.currentTurnName(),
      })
    }
  
    server.addEventListener('message', (evt) => {
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

        if (msg.type === 'chat') {
          this.broadcast({ type: 'chat', from: name, text: String(msg.text ?? ''), at: Date.now() })
        } else if (msg.type === 'ping') {
          server.send(JSON.stringify({ type: 'pong', at: Date.now() }))
        } else if (msg.type === 'join') {
          // 接続時点で joined を返しているので何もしない
        } else {
          server.send(JSON.stringify({ type: 'error', text: `未知のtype: ${msg.type}` }))
        }
      } catch (e) {
        console.log('[DO] parse error', e)
        server.send(JSON.stringify({ type: 'error', text: 'JSON を解析できませんでした' }))
      }
    })

    server.addEventListener('close', () => {
      this.clients.delete(server)
      this.names.delete(server)

      this.broadcast({
        type: 'system',
        text: `👋 ${name} が退室しました`,
        at: Date.now()
      })

      this.broadcast({
        type: 'members',
        members: this.currentMembers(),
      })
    })

    return new Response(null, { status: 101, webSocket: client })
  }

  // 今いるメンバーの名前配列を返す
  private currentMembers(): string[] {
    return Array.from(this.names.values())
  }
}
