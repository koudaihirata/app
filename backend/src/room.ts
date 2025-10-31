export interface Env {
  ROOM: DurableObjectNamespace
}

type Client = WebSocket

export class Room {
  private state: DurableObjectState
  private env: Env
  private clients: Set<Client> = new Set()
  private names: Map<Client, string> = new Map()

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
  }

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

  // 参加処理
  this.clients.add(server)
  this.names.set(server, name)

    // 日本語を英数に変換
    // const roomId = this.state.id ? this.state.id.toString() : 'unknown'
  
  server.send(JSON.stringify({
    type: 'joined',
    roomId: roomName,
    at: Date.now(),
    members: this.currentMembers()
  }))
      // ② 全員に「メンバーが変わったよ」を配る
  this.broadcast({
    type: 'members',
    members: this.currentMembers(),
  })

  this.broadcast({
    type: 'system',
    text: `🔔 ${name} が「${roomName}」に入室しました`,
    at: Date.now()
  })
  
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

  private broadcast(obj: unknown) {
    const s = JSON.stringify(obj)
    for (const ws of this.clients) {
      try {
        ws.send(s)
      } catch {}
    }
  }
}
