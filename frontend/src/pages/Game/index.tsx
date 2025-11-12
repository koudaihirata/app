import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { baseURL } from '../../utils/baseURL'
import styles from './styles.module.css'

type S = {
    players: string[]
    hp: Record<string, number>
    round: number
    turn: string
}
const initS: S = { players:[], hp:{}, round:1, turn:'' }
const MAX_HP = 10
const CLIENT_ID_STORAGE_KEY = 'rooms:clientId'

type GameStartedMsg = { type: 'game_started'; players?: string[]; hp?: Record<string, number>; round?: number; turn?: string }
type StateMsg = { type: 'state'; hp?: Record<string, number>; round?: number; turn?: string }
type PlayedMsg = { type: 'played'; delta?: { hp?: Record<string, number> }; next?: { round?: number; turn?: string } }
type GameOverMsg = { type: 'game_over'; winner?: string }
type PhaseChangedMsg = { type: 'phase_changed'; phase: 'lobby' | 'game' }
type GameWsMsg = GameStartedMsg | StateMsg | PlayedMsg | GameOverMsg | PhaseChangedMsg

const isGameWsMsg = (msg: unknown): msg is GameWsMsg => {
    if (!msg || typeof msg !== 'object') return false
    const type = (msg as { type?: unknown }).type
    return type === 'game_started'
        || type === 'state'
        || type === 'played'
        || type === 'game_over'
        || type === 'phase_changed'
}

const mergePlayers = (current: string[], incoming: string[]) => {
    const ordered = current.length ? [...current] : []
    incoming.forEach(player => {
        if (!ordered.includes(player)) ordered.push(player)
    })
    return ordered.length ? ordered : incoming
}

const resolveClientId = () => {
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

export default function Game() {
    const [sp] = useSearchParams()
    const navigate = useNavigate()
    const room = sp.get('room') ?? ''
    const name = sp.get('name') ?? ''
    const wsRef = useRef<WebSocket|null>(null)
    const playersRef = useRef<string[]>(initS.players)
    const [st, setSt] = useState<S>(initS)
    const isMyTurn = st.turn === name
    const clientIdRef = useRef<string>(resolveClientId())

    useEffect(() => {
        playersRef.current = st.players
    }, [st.players])

    useEffect(() => {
        const ws = new WebSocket(`${baseURL}?room=${encodeURIComponent(room)}&name=${encodeURIComponent(name)}&cid=${encodeURIComponent(clientIdRef.current)}`)
        wsRef.current = ws
        let navigated = false

        const returnToRooms = () => {
            if (navigated) return
            navigated = true
            const navState = {
                joined: true,
                roomId: room,
                name,
                members: playersRef.current
            }
            try { ws.close() } catch (error) { console.log(error) }
            navigate('/rooms', {
                replace: true,
                state: navState
            })
        }

        ws.onopen = () => ws.send(JSON.stringify({ type:'sync' }))
        ws.onmessage = async (e) => {
            try {
                let text = ''
                if (typeof e.data === 'string') {
                    text = e.data
                } else if (e.data instanceof Blob) {
                    text = await e.data.text()
                } else if (e.data instanceof ArrayBuffer) {
                    text = new TextDecoder().decode(e.data)
                } else if (ArrayBuffer.isView(e.data)) {
                    const view = e.data as ArrayBufferView
                    text = new TextDecoder().decode(view.buffer)
                } else {
                    console.warn('未対応のフレーム形式を受信', e.data)
                    return
                }
                if (!text) return

                const msg = JSON.parse(text)
                if (!isGameWsMsg(msg)) {
                    console.warn('不明なメッセージ形式を受信しました', text)
                    return
                }
                const typedMsg = msg
                switch (typedMsg.type) {
                    case 'game_started':
                        setSt({
                            players: typedMsg.players ?? [],
                            hp: typedMsg.hp ?? {},
                            round: typedMsg.round ?? 1,
                            turn: typedMsg.turn ?? ''
                        })
                        break
                    case 'state':
                        setSt(prev => {
                            const hp = typedMsg.hp ?? {}
                            const players = mergePlayers(prev.players, Object.keys(hp))
                            return {
                                ...prev,
                                players,
                                hp,
                                round: typedMsg.round ?? prev.round,
                                turn: typedMsg.turn ?? prev.turn
                            }
                        })
                        break
                    case 'played':
                        setSt(prev => {
                            const delta: Record<string, number> = typedMsg.delta?.hp ?? {}
                            const nextHp = { ...prev.hp }
                            const deltaEntries = Object.entries(delta) as Array<[string, number]>
                            for (const [player, amount] of deltaEntries) {
                                const base = nextHp[player] ?? MAX_HP
                                nextHp[player] = Math.max(0, base + amount)
                            }
                            const players = mergePlayers(prev.players, Object.keys(nextHp))
                            return {
                                ...prev,
                                players,
                                hp: nextHp,
                                round: typedMsg.next?.round ?? prev.round,
                                turn: typedMsg.next?.turn ?? prev.turn
                            }
                        })
                        break
                    case 'game_over':
                        alert(`勝者: ${typedMsg.winner ?? '不明'}`)
                        returnToRooms()
                        break
                    case 'phase_changed':
                        if (typedMsg.phase === 'lobby') {
                            returnToRooms()
                        }
                        break
                    default:
                        console.warn('未処理のタイプを受信', typedMsg)
                }
            } catch (error) {
                console.log(error);
            }
        }
        return () => {
            try { ws.close() } catch(error) { console.log(error) }
        }
    }, [room, name, navigate])

    const play = (cardId: number, target?: string) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        wsRef.current.send(JSON.stringify({ type:'play', cardId, target }))
    }
    const endTurn = () => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        wsRef.current.send(JSON.stringify({ type:'end_turn' }))
    }

    const hpPercent = (player: string) => {
        const value = st.hp[player] ?? 0
        return Math.max(0, Math.min(100, (value / MAX_HP) * 100))
    }

    const playersToDisplay = st.players.length ? st.players : Object.keys(st.hp)

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <p className={styles.roomLabel}>Room: {room || 'unknown'}</p>
                    <p className={styles.selfLabel}>プレイヤー: {name || 'Guest'}</p>
                </div>
                <div className={styles.roundInfo}>
                    <span>Round {st.round}</span>
                    <span>|</span>
                    <span>Turn: {st.turn || '-'}</span>
                </div>
            </header>

            <section className={styles.playersBoard}>
                {playersToDisplay.length === 0 && (
                    <p className={styles.placeholder}>プレイヤー情報を待機中...</p>
                )}
                {playersToDisplay.map(player => {
                    const hp = st.hp[player] ?? 0
                    const classes = [
                        styles.playerCard,
                        player === st.turn ? styles.cardIsTurn : '',
                        player === name ? styles.cardIsSelf : ''
                    ].join(' ').trim()
                    return (
                        <div key={player} className={classes}>
                            <div className={styles.playerHeader}>
                                <p className={styles.playerName}>
                                    {player}
                                    {player === name ? ' (You)' : ''}
                                </p>
                                {player === st.turn && <span className={styles.turnBadge}>現在のターン</span>}
                            </div>
                            <div className={styles.hpRow}>
                                <span className={styles.hpLabel}>HP</span>
                                <span className={styles.hpValue}>{hp}</span>
                            </div>
                            <div className={styles.hpBarTrack}>
                                <div className={styles.hpBar} style={{ width: `${hpPercent(player)}%` }} />
                            </div>
                        </div>
                    )
                })}
            </section>

            <section className={styles.actions}>
                <div className={styles.turnInfo}>
                    {isMyTurn ? 'あなたのターンです。カードを選択してください。' : `${st.turn || '---'} のターンです。`}
                </div>
                <div className={styles.cardButtons}>
                    <button className={styles.cardBtn} disabled={!isMyTurn} onClick={() => play(1)}>
                        攻撃 2ダメージ (ID:1)
                    </button>
                    <button className={styles.cardBtn} disabled={!isMyTurn} onClick={() => play(2)}>
                        強攻撃 3ダメージ (ID:2)
                    </button>
                    <button className={styles.cardBtn} disabled={!isMyTurn} onClick={() => play(5)}>
                        回復 +2 (ID:5)
                    </button>
                    <button className={styles.cardBtn} disabled={!isMyTurn} onClick={endTurn}>
                        ターン終了
                    </button>
                </div>
            </section>
        </div>
    )
}
