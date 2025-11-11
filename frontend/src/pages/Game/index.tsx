import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { baseURL } from '../../utils/baseURL'

type S = {
    players: string[]
    hp: Record<string, number>
    round: number
    turn: string
}
const initS: S = { players:[], hp:{}, round:1, turn:'' }

export default function Game() {
    const [sp] = useSearchParams()
    const room = sp.get('room') ?? ''
    const name = sp.get('name') ?? ''
    const wsRef = useRef<WebSocket|null>(null)
    const [st, setSt] = useState<S>(initS)
    const isMyTurn = st.turn === name

    useEffect(() => {
        const ws = new WebSocket(`${baseURL}?room=${encodeURIComponent(room)}&name=${encodeURIComponent(name)}`)
        wsRef.current = ws
        ws.onopen = () => ws.send(JSON.stringify({ type:'sync' }))
        ws.onmessage = (e) => {
        const txt = typeof e.data === 'string' ? e.data : ''
        if (!txt) return
        try {
            const msg = JSON.parse(txt)
            if (msg.type === 'game_started') {
            setSt({ players: msg.players, hp: msg.hp, round: msg.round, turn: msg.turn })
            } else if (msg.type === 'state') {
            setSt({ ...st, hp: msg.hp, round: msg.round, turn: msg.turn })
            } else if (msg.type === 'played') {
            setSt(s => ({ ...s, hp: { ...s.hp, ...(msg.delta?.hp ?? {}) }, round: msg.next.round, turn: msg.next.turn }))
            } else if (msg.type === 'game_over') {
            alert(`勝者: ${msg.winner}`)
            }
        } catch (error) {
            console.log(error);
        }
        }
        return () => { try { ws.close() } catch(error) { console.log(error);
        } }
    }, [room, name])

    const play = (cardId: number, target?: string) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        wsRef.current.send(JSON.stringify({ type:'play', cardId, target }))
    }
    const endTurn = () => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        wsRef.current.send(JSON.stringify({ type:'end_turn' }))
    }

    return (
        <div style={{padding:16}}>
        <h2>Game</h2>
        <p>Round: {st.round} / Turn: {st.turn}</p>
        <ul>
            {st.players.map(p => <li key={p}>{p}: {st.hp[p] ?? 0} HP</li>)}
        </ul>

        <div style={{marginTop:12}}>
            <button disabled={!isMyTurn} onClick={() => play(1)}>攻撃(2) [id=1]</button>
            <button disabled={!isMyTurn} onClick={() => play(2)}>攻撃(3) [id=2]</button>
            <button disabled={!isMyTurn} onClick={() => play(5)}>回復(+2) [id=5]</button>
            <button disabled={!isMyTurn} onClick={endTurn}>ターン終了</button>
        </div>
        </div>
    )
}
