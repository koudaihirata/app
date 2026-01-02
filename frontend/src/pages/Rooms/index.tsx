// src/pages/Rooms/index.ts

import styles from './styles.module.css'
import { useEffect, useReducer, useRef } from 'react'
import { defaultState, Reducer } from './reducer';
import { appendLog, connected, disconnected, joined, setMembers, setName, setRoom } from './action';
import { baseURL } from '../../utils/baseURL';
import NormalBtn from '../../components/button/NormalBtn';
import { useLocation, useNavigate } from 'react-router-dom';
import { geoError, geoOptions } from '../../utils/geoFunc';

type WsMsg =
  | { type: 'hello'; text: string }
  | { type: 'joined'; roomId: string; at: number; members?: string[]; hostClientId?: string }
  | { type: 'system'; text: string; at: number }
  | { type: 'chat'; from: string; text: string; at: number }
  | { type: 'members'; members: string[]; hostClientId?: string }
  | { type: 'error'; text: string }
  | { type: 'pong'; at: number }
  // ▼ ここからゲーム系
  | { type: 'phase_changed'; phase: 'lobby' | 'game' }
  | { type: 'game_started'; players: string[]; hp: Record<string, number>; round: number; turn: string; deckVer?: number }
  | { type: 'state'; hp: Record<string, number>; round: number; turn: string }
  | { type: 'played'; by: string; cardId: number; target?: string; delta: { hp: Record<string, number> }; next?: { round: number; turn: string } }
  | { type: 'game_over'; winner: string };

export default function Rooms() {
  const location = useLocation()
  const navigate = useNavigate()

  type NavState = { joined?: boolean; roomId?: string; name?: string; members?: string[]; hostId?: string | null } | null
  const navStateRef = useRef<NavState>(location.state as NavState)

  const IDENTITY_STORAGE_KEY = 'rooms:lastIdentity'

  const createInitialState = () => {
    const base = { ...defaultState }
    try {
      const raw = sessionStorage.getItem(IDENTITY_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as { roomId?: string; name?: string }
        if (parsed.roomId) base.roomId = parsed.roomId
        if (parsed.name) base.name = parsed.name
      }
    } catch {
      // noop
    }
    const navState = navStateRef.current
    if (navState?.roomId) base.roomId = navState.roomId
    if (navState?.name) base.name = navState.name
    if (navState?.members) base.members = navState.members
    if (navState?.hostId) base.hostId = navState.hostId
    if (navState?.joined) base.joined = true
    return base
  }

  const [state, dispatch] = useReducer(Reducer, undefined, createInitialState)
  const wsRef = useRef<WebSocket | null>(null)
  const shouldReconnect = useRef(Boolean(navStateRef.current?.joined))
  const lastNavState = useRef<NavState>(navStateRef.current)
  const CLIENT_ID_STORAGE_KEY = 'rooms:clientId'

  const ensureClientId = () => {
    const fallback = () => `anon-${Date.now()}-${Math.random().toString(16).slice(2)}`
    try {
      const stored = sessionStorage.getItem(CLIENT_ID_STORAGE_KEY)
      if (stored) return stored
      const generated = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : fallback()
      sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, generated)
      return generated
    } catch {
      return fallback()
    }
  }

  const clientIdRef = useRef<string>(ensureClientId())

  // Cloudflare Workers の WebSocket エンドポイント
  const WS_BASE = `${baseURL}?room=${encodeURIComponent(state.roomId)}&name=${encodeURIComponent(state.name)}&cid=${encodeURIComponent(clientIdRef.current)}`
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
      const joinMsg = {
        type: 'join',
        roomId: state.roomId,
        name: state.name,
        clientId: clientIdRef.current
      }
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
              if (msg.members) {
                dispatch(setMembers(msg.members, msg.hostClientId))
              }
              break
            case 'system':
              dispatch(appendLog(`🔔 ${msg.text}`))
              break
            case 'chat':
              dispatch(appendLog(`💬 ${msg.from}: ${msg.text}`))
              break
            case 'members':
              dispatch(setMembers(msg.members, msg.hostClientId))
              dispatch(appendLog(`👥 members: ${msg.members.join(', ')}`))
              break
            case 'game_started':
              navigate(`/game?room=${encodeURIComponent(state.roomId)}&name=${encodeURIComponent(state.name)}`)
              break
            case 'phase_changed':
              dispatch(appendLog(`🎮 phase: ${msg.phase}`))
              if (msg.phase === 'game') {
                navigate(`/game?room=${encodeURIComponent(state.roomId)}&name=${encodeURIComponent(state.name)}`)
              }
              break
            case 'state':
              dispatch(appendLog(`📊 round ${msg.round}, turn: ${msg.turn}`))
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

  const claimHost = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'claim_host' }))
  }

  useEffect(() => {
    if (!shouldReconnect.current) return
    if (state.connected) {
      shouldReconnect.current = false
      return
    }
    shouldReconnect.current = false
    connect()
  }, [state.connected, state.roomId, state.name])

    useEffect(() => {
    const navState = location.state as NavState
    if (!navState || navState === lastNavState.current) return
    lastNavState.current = navState
    if (navState.roomId) dispatch(setRoom(navState.roomId))
    if (navState.name) dispatch(setName(navState.name))
    if (navState.members) {
      if (typeof navState.hostId !== 'undefined') {
        dispatch(setMembers(navState.members, navState.hostId))
      } else {
        dispatch(setMembers(navState.members))
      }
    }
    if (navState.joined) {
      dispatch(joined(navState.roomId ?? state.roomId))
      shouldReconnect.current = true
    }
  }, [location.state, state.roomId])

  useEffect(() => {
    try {
      sessionStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify({ roomId: state.roomId, name: state.name }))
    } catch (error) {
      console.warn('failed to persist identity', error)
    }
  }, [state.roomId, state.name])

  console.log(state);

  const isHost = Boolean(state.hostId && state.hostId === clientIdRef.current)
  const canStartGame = isHost && state.members.length > 1

  return (
    <>
      {!state.joined ? 
        <section className={styles.roomSection}>
          <div className={styles.roomConnectArea}>
            <h2 className={styles.roomTitle}>ロゴ</h2>
            <div className={styles.inputWrap}>
              <input placeholder="roomId" value={state.roomId} onChange={(e) => dispatch(setRoom(e.target.value))} disabled={state.connected}/>
              <input placeholder="name" value={state.name} onChange={(e) => dispatch(setName(e.target.value))} disabled={state.connected}/>
            </div>
          </div>
          <div className={styles.roomJoiningBtn}>
            <NormalBtn label='決定' bg='#717171' onClick={connect}/>

            <pre className={styles.systemLog}>
              { state.logs.slice().reverse().join('\n') }
            </pre>
          </div>
          
          {/* チャット機能は後ででいいので一旦放置
          <div style={{ marginTop: 12, display: 'grid', gap: 8, gridTemplateColumns: '1fr auto auto' }}>
            <input placeholder="message..." value={state.input} onChange={(e) => dispatch(setInput(e.target.value))} disabled={!state.joined}/>
            <button onClick={sendChat} disabled={!joined || !state.input}>Send</button>
            <button onClick={sendPing} disabled={!connected}>Ping</button>
          </div> */}
        </section>
        :
        <div className={styles.membersSection}>
          <div className={styles.membersListWrap}>
            <div className={styles.membersTitleWrap}>
              <p onClick={disconnect} className={styles.backBtn}>◀︎</p>
              <p>{state.roomId}</p>
              <button className={styles.backBtn} style={{opacity: '0'}}>←</button>
            </div>
            <div className={styles.membersList}>
              <p className={styles.players}>参加プレイヤー</p>
              <div className={styles.membersWrap}>
                {Array.from({length: 6}).map((_, index) => (
                  <div key={index} className={styles.member}  style={!state.members[index] ? {height: "56px"} : {}}>
                    <p>{state.members[index] || ''}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className={styles.gameStateBtn}>
            <NormalBtn
              label={isHost ? 'ゲームを開始する' : 'ホスト待機中'}
              bg={canStartGame ? '#717171' : '#c7c7c7ff'}
              onClick={() => {
                if (!isHost) {
                  dispatch(appendLog('❗ error: ゲーム開始はホストのみが実行できます'))
                  return
                }
                if (state.members.length > 1) {
                  navigator.geolocation.getCurrentPosition((pos) => {
                    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
                    wsRef.current.send(JSON.stringify({
                      type: 'start',
                      clientId: clientIdRef.current,
                      lat: pos.coords.latitude,
                      lng: pos.coords.longitude,
                    }))
                  }, geoError, geoOptions)
                } else {
                  dispatch(appendLog(`❗ error: ゲームを始めるには2人以上が必要です`))
                }
              }}
            />
            {!state.hostId && (
              <div className={styles.claimHostArea}>
                <NormalBtn
                  label='ホストになる'
                  bg='#4a90e2'
                  onClick={claimHost}
                />
                <p className={styles.claimHint}>ホスト不在時のみ利用できます</p>
              </div>
            )}

            <pre className={styles.systemLog}>
              { state.logs.slice().reverse().join('\n') }
            </pre>
          </div>
        </div>
      }
    </>
  )
}
