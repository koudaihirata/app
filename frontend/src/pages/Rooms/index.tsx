import styles from './styles.module.css'
import { useReducer, useRef } from 'react'
import { defaultState, Reducer } from './reducer';
import { appendLog, connected, disconnected, joined, setMembers, setName, setRoom } from './action';
import { baseURL } from '../../utils/baseURL';

type WsMsg =
  | { type: 'hello'; text: string }
  | { type: 'joined'; roomId: string; at: number }
  | { type: 'system'; text: string; at: number }
  | { type: 'chat'; from: string; text: string; at: number }
  | { type: 'members'; members: string[] }
  | { type: 'error'; text: string }
  | { type: 'pong'; at: number }

export default function Rooms() {
  const [state, dispatch] = useReducer(Reducer, defaultState)
  const wsRef = useRef<WebSocket | null>(null)

  // Cloudflare Workers の WebSocket エンドポイント
  const WS_BASE = `${baseURL}?room=${encodeURIComponent(state.roomId)}&name=${encodeURIComponent(state.name)}`
  // 開発中に wrangler dev を使う場合は下を使う：
  // const WS_BASE = `${location.protocol === 'https:' ? 'wss' : 'ws'}://127.0.0.1:8787/ws`

  // const append = (line: string) => setLogs(prev => [...prev, line])

  const connect = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return
    dispatch(appendLog('...connecting'))
    const ws = new WebSocket(WS_BASE)
    wsRef.current = ws

    ws.onopen = () => {
      dispatch(connected())
      dispatch(appendLog('🟢 connected'))
      // 接続直後に join を投げる
      const joinMsg = { type: 'join', roomId: state.roomId, name: state.name }
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
          dispatch(appendLog('❗ 未対応データ型を受信'))
          return
        }

        // 2) JSONとして解釈（失敗時は生で表示）
        try {
          const msg = JSON.parse(text) as WsMsg
          switch (msg.type) {
            case 'hello':
              dispatch(appendLog(`👋 ${msg.text}`))
              break
            case 'joined':
              dispatch(appendLog(`🚪 joined room: ${msg.roomId}`));
              dispatch(joined(msg.roomId));
              break
            case 'system':
              dispatch(appendLog(`🔔 ${msg.text}`))
              break
            case 'chat':
              dispatch(appendLog(`💬 ${msg.from}: ${msg.text}`))
              break
            case 'members':
              dispatch(setMembers(msg.members))
              dispatch(appendLog(`👥 members: ${msg.members.join(', ')}`))
            break
            case 'error':
              dispatch(appendLog(`❗ ${msg.text}`))
              break
            case 'pong':
              dispatch(appendLog(`🩺 pong (${new Date(msg.at).toLocaleTimeString()})`))
              break
            default:
              dispatch(appendLog('📦 未知タイプ: ' + text))
              break
          }
        } catch {
          // 3) 何が来ているか見えるように“生文字ログ”
          dispatch(appendLog('📦 raw: ' + text))
        }
      })()
    }

    ws.onclose = () => {
      dispatch(disconnected())
      dispatch(appendLog('🔴 closed'))
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      dispatch(appendLog(`❗ error: ${error instanceof Error ? error.message : 'Unknown error'}`))
    }
  }

  // const sendChat = () => {
  //   if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
  //   wsRef.current.send(JSON.stringify({ type: 'chat', text: state.input }))
  //   dispatch(setInput(''))
  // }

  // const sendPing = () => {
  //   if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
  //   wsRef.current.send(JSON.stringify({ type: 'ping' }))
  // }

  const disconnect = () => {
    wsRef.current?.close()
    dispatch(disconnected())
  }

  console.log(state);

  return (
    <>
      {!state.joined ? 
        <section className={styles.roomSection}>
          <h2 className={styles.roomTitle}>ロゴ</h2>
          <div className={styles.roomConnectArea}>
            <div className={styles.inputWrap}>
              <input placeholder="roomId" value={state.roomId} onChange={(e) => dispatch(setRoom(e.target.value))} disabled={state.connected}/>
              <input placeholder="name" value={state.name} onChange={(e) => dispatch(setName(e.target.value))} disabled={state.connected}/>
            </div>
            <button onClick={connect}>Connect & Join</button>
          </div>
          
          {/* チャット機能は後ででいいので一旦放置
          <div style={{ marginTop: 12, display: 'grid', gap: 8, gridTemplateColumns: '1fr auto auto' }}>
            <input placeholder="message..." value={state.input} onChange={(e) => dispatch(setInput(e.target.value))} disabled={!state.joined}/>
            <button onClick={sendChat} disabled={!joined || !state.input}>Send</button>
            <button onClick={sendPing} disabled={!connected}>Ping</button>
          </div> */}

          {/*  ログ機能も後ででいいので一旦放置
          <pre style={{ background: '#111', color: '#eee', padding: 12, marginTop: 12, height: 260, overflow: 'auto' }}>
            {state.logs.join('\n')}
          </pre> */}

          <p style={{ fontSize: 12, color: '#666' }}>
            状態: {state.connected ? '🟢 connected' : '🔴 disconnected'} / {state.joined ? `🚪 joined(${state.roomId})` : 'not joined'}
          </p>
        </section>
        :
        <div className={styles.membersSection}>
          <div className={styles.membersTitleWrap}>
            <button onClick={disconnect} className={styles.backBtn}>←</button>
            <p>{state.roomId}</p>
            <button className={styles.backBtn} style={{opacity: '0'}}>←</button>
          </div>
          <div className={styles.membersList}>
            {state.members.map((m, index) => (
              <div key={index}>{m}</div>
            ))}
          </div>
        </div>
      }
    </>
  )
}
