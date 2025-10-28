export interface Env {
  ROOM: DurableObjectNamespace
}

type Client = WebSocket

export class Room {
  private state: DurableObjectState
  private env: Env
  private clients: Set<Client> = new Set()

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const name = url.searchParams.get('name') ?? 'Guest'
    console.log('[DO] fetch start', { pathname: url.pathname, name })

    if (request.headers.get('Upgrade') !== 'websocket') {
      console.log('[DO] non-WS request')
      return new Response('Expected WebSocket', { status: 426 })
    }

    const pair = new WebSocketPair()
    // ★ 配列アクセスで明示
    const client = pair[0]
    const server = pair[1]
    server.accept()
    console.log('[DO] WS accepted', { name })

    // 参加処理
    this.clients.add(server)
    this.broadcast({ type: 'system', text: `🔔 ${name} が入室しました`, at: Date.now() })
    server.send(JSON.stringify({ type: 'joined', at: Date.now() }))

    server.addEventListener('message', (evt) => {
      console.log('[DO] message', { kind: typeof evt.data })
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
          console.log('[DO] chat', { from: name, text: msg.text })
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
      console.log('[DO] close', { name })
      this.clients.delete(server)
      this.broadcast({ type: 'system', text: `👋 ${name} が退室しました`, at: Date.now() })
    })

    return new Response(null, { status: 101, webSocket: client })
  }

  private broadcast(obj: unknown) {
    const s = JSON.stringify(obj)
    for (const ws of this.clients) {
      try { ws.send(s) } catch {}
    }
  }
}
