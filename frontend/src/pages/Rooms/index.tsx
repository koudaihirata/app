import { useRef, useState } from 'react'

type WsMsg =
  | { type: 'hello'; text: string }
  | { type: 'joined'; roomId: string; at: number }
  | { type: 'system'; text: string; at: number }
  | { type: 'chat'; from: string; text: string; at: number }
  | { type: 'error'; text: string }
  | { type: 'pong'; at: number }

export default function Rooms() {
  const [roomId, setRoomId] = useState('room-1')
  const [name, setName] = useState('Kodai')
  const [connected, setConnected] = useState(false)
  const [joined, setJoined] = useState(false)
  const [input, setInput] = useState('')
  const [logs, setLogs] = useState<string[]>([])
  const wsRef = useRef<WebSocket | null>(null)

  const WS_BASE = `wss://backend.hiratakoudai61.workers.dev/ws?room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(name)}` // ←本番
  // 開発中に wrangler dev を使う場合は下を使う：
  // const WS_BASE = `${location.protocol === 'https:' ? 'wss' : 'ws'}://127.0.0.1:8787/ws`

  const append = (line: string) => setLogs(prev => [...prev, line])

  const connect = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return
    const ws = new WebSocket(WS_BASE)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      append('🟢 connected')
      // 接続直後に join を投げる
      const joinMsg = { type: 'join', roomId, name }
      ws.send(JSON.stringify(joinMsg))
    }

    ws.onmessage = (e) => {
      (async () => {
        // 1) 受信データを「必ず string にする」
        let text: string = ''
        if (typeof e.data === 'string') {
          text = e.data
        } else if (e.data instanceof Blob) {
          text = await e.data.text()
        } else if (e.data instanceof ArrayBuffer) {
          text = new TextDecoder().decode(e.data)
        } else {
          append('❗ 未対応データ型を受信')
          return
        }

        // 2) JSONとして解釈（失敗時は生で表示）
        try {
          const msg = JSON.parse(text) as WsMsg
          switch (msg.type) {
            case 'hello':  append(`👋 ${msg.text}`); break
            case 'joined': append(`🚪 joined room: ${msg.roomId}`); setJoined(true); break
            case 'system': append(`🔔 ${msg.text}`); break
            case 'chat':   append(`💬 ${msg.from}: ${msg.text}`); break
            case 'error':  append(`❗ ${msg.text}`); break
            case 'pong':   append(`🩺 pong (${new Date(msg.at).toLocaleTimeString()})`); break
            default:       append('📦 未知タイプ: ' + text); break
          }
        } catch {
          // 3) 何が来ているか見えるように“生文字ログ”
          append('📦 raw: ' + text)
        }
      })()
    }

    ws.onclose = () => {
      setConnected(false)
      setJoined(false)
      append('🔴 closed')
    }

    ws.onerror = () => {
      append('❗ error')
    }
  }

  const sendChat = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'chat', text: input }))
    setInput('')
  }

  const sendPing = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'ping' }))
  }

  const disconnect = () => {
    wsRef.current?.close()
  }

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '0 auto' }}>
      <h2>Rooms Chat (WebSocket)</h2>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr auto' }}>
        <input placeholder="roomId" value={roomId} onChange={e => setRoomId(e.target.value)} disabled={connected}/>
        <input placeholder="name" value={name} onChange={e => setName(e.target.value)} disabled={connected}/>
        {!connected ? (
          <button onClick={connect}>Connect & Join</button>
        ) : (
          <button onClick={disconnect}>Disconnect</button>
        )}
      </div>

      <div style={{ marginTop: 12, display: 'grid', gap: 8, gridTemplateColumns: '1fr auto auto' }}>
        <input placeholder="message..." value={input} onChange={e => setInput(e.target.value)} disabled={!joined}/>
        <button onClick={sendChat} disabled={!joined || !input}>Send</button>
        <button onClick={sendPing} disabled={!connected}>Ping</button>
      </div>

      <pre style={{ background: '#111', color: '#eee', padding: 12, marginTop: 12, height: 260, overflow: 'auto' }}>
        {logs.join('\n')}
      </pre>

      <p style={{ fontSize: 12, color: '#666' }}>
        状態: {connected ? '🟢 connected' : '🔴 disconnected'} / {joined ? `🚪 joined(${roomId})` : 'not joined'}
      </p>
    </div>
  )
}
