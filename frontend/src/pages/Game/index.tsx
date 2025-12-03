import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { baseURL } from '../../utils/baseURL'
import styles from './styles.module.css'
import { CARD_LIBRARY } from '../../utils/cards'

type S = {
    players: string[]
    hp: Record<string, number>
    round: number
    turn: string
}
const initS: S = { players:[], hp:{}, round:1, turn:'' }
const MAX_HP = 10
const CLIENT_ID_STORAGE_KEY = 'rooms:clientId'

type DefenseSnapshot = { attacker: string; target: string; damage: number; cardId?: number }
type GameStartedMsg = { type: 'game_started'; players?: string[]; hp?: Record<string, number>; round?: number; turn?: string }
type StateMsg = { type: 'state'; hp?: Record<string, number>; round?: number; turn?: string; phase?: 'action' | 'defense'; defense?: DefenseSnapshot }
type PlayedMsg = { type: 'played'; delta?: { hp?: Record<string, number> }; next?: { round?: number; turn?: string }; defense?: { by: string; cardId?: number; blocked: number } }
type GameOverMsg = { type: 'game_over'; winner?: string }
type PhaseChangedMsg = { type: 'phase_changed'; phase: 'lobby' | 'game' }
type DefenseRequestedMsg = { type: 'defense_requested'; attacker: string; target: string; damage: number; cardId: number }
type HandUpdateMsg = { type: 'hand_update'; hand: number[] }
type GameWsMsg = GameStartedMsg | StateMsg | PlayedMsg | GameOverMsg | PhaseChangedMsg | DefenseRequestedMsg | HandUpdateMsg

const isGameWsMsg = (msg: unknown): msg is GameWsMsg => {
    if (!msg || typeof msg !== 'object') return false
    const type = (msg as { type?: unknown }).type
    return type === 'game_started'
        || type === 'state'
        || type === 'played'
        || type === 'game_over'
        || type === 'phase_changed'
        || type === 'defense_requested'
        || type === 'hand_update'
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
    const [hand, setHand] = useState<number[]>([])
    const [phase, setPhase] = useState<'action' | 'defense'>('action')
    const [selectedCardIndex, setSelectedCardIndex] = useState<number|null>(null)
    const [defensePrompt, setDefensePrompt] = useState<DefenseSnapshot | null>(null)
    const isMyTurn = st.turn === name
    const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
    const clientIdRef = useRef<string>(resolveClientId())
    const isDefenseTurn = phase === 'defense' && defensePrompt?.target === name
    const canPlayAttackCard = phase === 'action' && isMyTurn
    const canSelectTarget = phase === 'action'
    // 手札引き直し関係
    // const allDefenseHand = hand.length === 3 && hand.every(cardId => CARD_LIBRARY[cardId]?.category === 'defense')
    // const canMulligan = canPlayAttackCard && allDefenseHand

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
            setDefensePrompt(null)
            setPhase('action')
            setHand([])
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
                        setHand([])
                        setPhase('action')
                        setDefensePrompt(null)
                        setSelectedTarget(null)
                        setSelectedCardIndex(null)
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
                        setPhase(typedMsg.phase ?? 'action')
                        setDefensePrompt(typedMsg.defense ?? null)
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
                        setPhase('action')
                        setDefensePrompt(null)
                        setSelectedTarget(null)
                        setSelectedCardIndex(null)
                        break
                    case 'game_over':
                        alert(`勝者: ${typedMsg.winner ?? '不明'}`)
                        setDefensePrompt(null)
                        returnToRooms()
                        break
                    case 'phase_changed':
                        if (typedMsg.phase === 'lobby') {
                            returnToRooms()
                        }
                        setDefensePrompt(null)
                        setPhase('action')
                        setSelectedCardIndex(null)
                        break
                    case 'defense_requested':
                        setDefensePrompt({
                            attacker: typedMsg.attacker,
                            target: typedMsg.target,
                            damage: typedMsg.damage,
                            cardId: typedMsg.cardId
                        })
                        setPhase('defense')
                        setSelectedTarget(null)
                        setSelectedCardIndex(null)
                        break
                    case 'hand_update':
                        console.log('hand_update', typedMsg.hand)
                        setHand(typedMsg.hand ?? [])
                        setSelectedCardIndex(null)
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

    useEffect(() => {
        if (!canPlayAttackCard) {
            setSelectedTarget(null)
            setSelectedCardIndex(null)
        }
    }, [canPlayAttackCard])

    const requiresTarget = (cardId: number) => CARD_LIBRARY[cardId]?.requiresTarget ?? false
    const isDefenseCard = (cardId: number) => CARD_LIBRARY[cardId]?.category === 'defense'

    const play = (cardId: number) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        if (phase === 'defense') {
            if (!isDefenseTurn) return
            if (!isDefenseCard(cardId)) return
        } else {
            if (!canPlayAttackCard) return
            if (isDefenseCard(cardId)) return
        }
        const payload: { type: 'play'; cardId: number; target?: string } = { type: 'play', cardId }
        if (phase === 'action' && requiresTarget(cardId)) {
            const meta = CARD_LIBRARY[cardId]
            let targetChoice = selectedTarget
            if (!targetChoice) {
                if (meta?.category === 'heal') {
                    targetChoice = name
                } else if (meta?.category === 'attack') {
                    targetChoice = defaultAttackTarget(name)
                } else if (meta?.allowSelfTarget) {
                    targetChoice = name
                }
            }
            if (!targetChoice) return
            payload.target = targetChoice
        }
        wsRef.current.send(JSON.stringify(payload))
    }

    const commitAction = () => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        const selectedCardId = selectedCardIndex !== null ? hand[selectedCardIndex] : null
        if (phase === 'defense') {
            if (!isDefenseTurn) return
            if (selectedCardId !== null) {
                if (!isDefenseCard(selectedCardId)) return
                play(selectedCardId)
                setSelectedCardIndex(null)
            } else {
                wsRef.current.send(JSON.stringify({ type:'end_turn' }))
            }
            return
        }
        // action phase
        if (!canPlayAttackCard) return
        if (selectedCardId !== null) {
            play(selectedCardId)
            if (requiresTarget(selectedCardId)) setSelectedTarget(null)
            setSelectedCardIndex(null)
        } else {
            wsRef.current.send(JSON.stringify({ type:'end_turn' }))
        }
    }
    // const endTurn = () => {
    //     if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    //     if (!canPlayAttackCard) return
    //     wsRef.current.send(JSON.stringify({ type:'end_turn' }))
    // }

    // const skipDefense = () => {
    //     if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    //     if (!isDefenseTurn) return
    //     wsRef.current.send(JSON.stringify({ type:'end_turn' }))
    // }

    // 手札引き直し
    // const mulligan = () => {
    //     if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    //     if (!canMulligan) return
    //     wsRef.current.send(JSON.stringify({ type:'mulligan' }))
    // }

    const hpPercent = (player: string) => {
        const value = st.hp[player] ?? 0
        return Math.max(0, Math.min(100, (value / MAX_HP) * 100))
    }

    const playersToDisplay = (() => {
        const ordered = st.players.length ? [...st.players] : [...Object.keys(st.hp)]
        const idx = ordered.indexOf(name)
        if (idx > 0) {
            ordered.splice(idx, 1)
            ordered.unshift(name)
        }
        return ordered
    })()
    const defenseTarget = defensePrompt?.target
    const selectedCardId = selectedCardIndex !== null ? hand[selectedCardIndex] : null
    const selectedCardMeta = selectedCardId !== null ? CARD_LIBRARY[selectedCardId] : undefined

    const defaultAttackTarget = (current: string) => {
        const order = st.players.length ? st.players : Object.keys(st.hp)
        const idx = order.indexOf(current)
        if (idx === -1 || order.length === 0) return null
        for (let i = 1; i <= order.length; i++) {
            const candidate = order[(idx + i) % order.length]
            if ((st.hp[candidate] ?? 0) > 0) {
                return candidate
            }
        }
        return null
    }

    // let turnInfoMessage = ''
    // if (phase === 'defense') {
    //     if (defensePrompt) {
    //         if (isDefenseTurn) {
    //             turnInfoMessage = `${defensePrompt.attacker} の攻撃(${defensePrompt.damage})を防御してください`
    //         } else {
    //             turnInfoMessage = `${defensePrompt.target} が防御処理中です`
    //         }
    //     } else {
    //         turnInfoMessage = '防御処理中…'
    //     }
    // } else if (canPlayAttackCard) {
    //     turnInfoMessage = selectedTarget
    //         ? `あなたのターン: ${selectedTarget} をターゲット中`
    //         : 'あなたのターンです。攻撃対象を選んでください'
    // } else {
    //     turnInfoMessage = `${st.turn || '---'} のターンです。`
    // }

    return (
        <div className={styles.page}>
            <div className={styles.resultArea}>
                <header className={styles.header}>
                    <p><span>Round {st.round}</span></p>
                </header>

                <section className={styles.playArea}>
                    {selectedCardMeta ? (
                        <div className={styles.selectedCardBar}>
                            <span className={styles.selectedCardName}>{selectedCardMeta.label}</span>
                            <span className={styles.selectedCardDetail}>{selectedCardMeta.detail}</span>
                        </div>
                    ):(
                        <div className={styles.selectedCardBar}>
                            <span className={styles.selectedCardDetail}>カードを選択してください</span>
                        </div>
                    )}
                </section>
            </div>

            <div className={styles.selectArea}>
                <section className={styles.playersBoard}>
                    {playersToDisplay.length === 0 && (
                        <p className={styles.placeholder}>プレイヤー情報を待機中...</p>
                    )}
                    {playersToDisplay.map(player => {
                        const hp = st.hp[player] ?? 0
                        if (player === name) {
                            const classes = [
                                styles.playerCard,
                                styles.myPlayerCard,
                                player === st.turn ? styles.cardIsTurn : '',
                                defenseTarget === player ? styles.cardIsTarget : '',
                                canSelectTarget && hp > 0 ? styles.cardSelectable : '',
                                selectedTarget === player ? styles.cardSelected : ''
                            ].join(' ').trim()
                            return (
                                <div
                                    key={player}
                                    className={classes}
                                    onClick={() => {
                                        if (!canSelectTarget) return
                                        if (hp <= 0) return
                                        setSelectedTarget(prev => prev === player ? null : player)
                                    }}
                                    role={canSelectTarget && hp > 0 ? 'button' : undefined}
                                    aria-pressed={canSelectTarget && selectedTarget === player}
                                >
                                    <div className={styles.playerHeader}>
                                        <p className={styles.playerName}>
                                            {player}
                                        </p>
                                        <div className={styles.hpRow}>
                                            {/* {player === st.turn && <span className={styles.turnBadge}>現在のターン</span>} */}
                                            <span className={styles.hpValue}>HP {hp}</span>
                                        </div>
                                    </div>
                                    <div className={styles.hpBarTrack}>
                                        <div className={styles.hpBar} style={{ width: `${hpPercent(player)}%` }} />
                                    </div>
                                </div>
                            )
                        }
                    })}
                    <div className={styles.enemyPlayersBoard}>
                        {playersToDisplay.map(player => {
                            const hp = st.hp[player] ?? 0
                            if (player !== name) {
                                const classes = [
                                    styles.playerCard,
                                    styles.enemyPlayerCard,
                                    player === st.turn ? styles.cardIsTurn : '',
                                    player === name ? styles.cardIsSelf : '',
                                    defenseTarget === player ? styles.cardIsTarget : '',
                                    canSelectTarget && hp > 0 ? styles.cardSelectable : '',
                                    selectedTarget === player ? styles.cardSelected : ''
                                ].join(' ').trim()
                                return (
                                    <div
                                        key={player}
                                        className={classes}
                                        onClick={() => {
                                            if (!canSelectTarget) return
                                            if (hp <= 0) return
                                            setSelectedTarget(prev => prev === player ? null : player)
                                        }}
                                        role={canSelectTarget && hp > 0 ? 'button' : undefined}
                                        aria-pressed={canSelectTarget && selectedTarget === player}
                                    >
                                        <div className={styles.playerHeader}>
                                            <p className={styles.playerName}>
                                                {player}
                                            </p>
                                            <div className={styles.hpRow}>
                                                {/* {player === st.turn && <span className={styles.turnBadge}>現在のターン</span>} */}
                                                <span className={styles.hpValue}>HP {hp}</span>
                                            </div>
                                        </div>
                                        <div className={styles.hpBarTrack}>
                                            <div className={styles.hpBar} style={{ width: `${hpPercent(player)}%` }} />
                                        </div>
                                    </div>
                                )
                            }
                        })}
                    </div>
                </section>
                <section className={styles.actions}>
                    <div className={styles.handCards}>
                        {hand.length === 0 && <span className={styles.emptyHand}>カードなし</span>}
                        {hand.map((cardId, idx) => {
                            const meta = CARD_LIBRARY[cardId]
                            if (!meta) return null
                            const usable = meta.category === 'defense'
                                ? isDefenseTurn
                                : canPlayAttackCard
                            return (
                                <button
                                    key={`${cardId}-${idx}`}
                                    className={`${styles.cardToken} ${selectedCardIndex === idx ? styles.cardTokenSelected : ''}`}
                                    disabled={!usable}
                                    onClick={() => {
                                        if (!usable) return
                                        setSelectedCardIndex(prev => prev === idx ? null : idx)
                                    }}
                                >
                                    <span className={styles.cardName}>{meta.label}</span>
                                    <span className={styles.cardDetail}>{meta.detail}</span>
                                </button>
                            )
                        })}
                    </div>
                    {/* <div className={styles.mulliganRow}>
                        <button className={styles.mulliganBtn} disabled={!canMulligan} onClick={mulligan}>
                            手札を引き直す
                        </button>
                        <span className={styles.mulliganHint}>防御カード3枚のときのみ使用可（ターン終了）</span>
                    </div> */}
                </section>
                <div className={styles.cardButtons}>
                    <button
                        className={styles.cardBtn}
                        disabled={phase === 'defense' ? !isDefenseTurn : !canPlayAttackCard}
                        onClick={commitAction}
                    >
                        {selectedCardIndex !== null ? '行動決定' : phase === 'defense' ? '防御しない' : 'ターンエンド'}
                    </button>
                </div>
            </div>
        </div>
    )
}
