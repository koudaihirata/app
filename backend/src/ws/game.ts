// src/ws/game.ts
import type { Client } from '../types'

export type GameDeps = {
    send: (ws: Client, obj: unknown) => void
    broadcast: (obj: unknown) => void
    getPlayers: () => string[]
}

export type GameState = {
    started: boolean
    players: string[]
    hp: Map<string, number>
    round: number
    turnIdx: number
    deck: number[]
    discard: number[]
    deckVer: number
}

export class GameEngine {
    state: GameState = {
        started: false,
        players: [],
        hp: new Map(),
        round: 1,
        turnIdx: 0,
        deck: [],
        discard: [],
        deckVer: 1
    }

    currentTurnName() { return this.state.players[this.state.turnIdx] ?? '' }

    buildDeck() {
        const ids = [1,1,2,2,3,3,4,4,5,5]
        for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[ids[i], ids[j]] = [ids[j], ids[i]]
        }
        return ids
    }

    ensureStarted(deps: GameDeps) {
        if (this.state.started) return
        const players = deps.getPlayers()
        if (players.length < 2) return
        this.state.started = true
        this.state.players = players
        this.state.hp = new Map(players.map(n => [n, 10]))
        this.state.round = 1
        this.state.turnIdx = 0
        this.state.deck = this.buildDeck()
        this.state.discard = []
        deps.broadcast({
        type: 'game_started',
        players: this.state.players,
        hp: Object.fromEntries(this.state.hp),
        round: this.state.round,
        turn: this.currentTurnName(),
        deckVer: this.state.deckVer,
        })
    }

    handleMessage(deps: GameDeps, ws: Client, actor: string, parsed: any) {
        if (parsed.type === 'sync') {
        deps.send(ws, {
            type: 'state',
            hp: Object.fromEntries(this.state.hp),
            round: this.state.round,
            turn: this.currentTurnName(),
        })
        return
    }

    if (parsed.type === 'play') {
        if (!this.state.started) { deps.send(ws, { type:'error', text:'ゲーム未開始' }); return }
        if (actor !== this.currentTurnName()) { deps.send(ws, { type:'error', text:'あなたのターンではありません' }); return }

        const { cardId, target }:{ cardId:number, target?:string } = parsed
        const delta: Record<string, number> = {}

        const nextOf = (n:string) => {
            const idx = this.state.players.indexOf(n)
            return this.state.players[(idx+1)%this.state.players.length]
        }

        if (cardId === 1) { const t = target ?? nextOf(actor); delta[t] = (delta[t] ?? 0) - 2 }
        else if (cardId === 2) { const t = target ?? nextOf(actor); delta[t] = (delta[t] ?? 0) - 3 }
        else if (cardId === 3) { /* 防御v1: 無効果でもOK */ }
        else if (cardId === 4) { /* 防御v1: 無効果でもOK */ }
        else if (cardId === 5) { delta[actor] = (delta[actor] ?? 0) + 2 }
        else { deps.send(ws, { type:'error', text:`未知のカード: ${cardId}` }); return }

        for (const [who, d] of Object.entries(delta)) {
            const cur = this.state.hp.get(who) ?? 0
            this.state.hp.set(who, Math.max(0, cur + d))
        }

        const alive = [...this.state.hp.entries()].filter(([_,hp]) => hp>0).map(([n])=>n)
        if (alive.length === 1) {
            deps.broadcast({ type:'played', by:actor, cardId, target, delta:{ hp: delta }})
            deps.broadcast({ type:'game_over', winner: alive[0] })
            this.state.started = false
            return
        }

        this.state.turnIdx = (this.state.turnIdx + 1) % this.state.players.length
        if (this.state.turnIdx === 0) this.state.round += 1

        deps.broadcast({
            type:'played',
            by: actor,
            cardId,
            target,
            delta:{ hp: delta },
            next:{ round: this.state.round, turn: this.currentTurnName() }
        })
        return
    }

    if (parsed.type === 'end_turn') {
        if (!this.state.started) return
        if (actor !== this.currentTurnName()) return
        this.state.turnIdx = (this.state.turnIdx + 1) % this.state.players.length
        if (this.state.turnIdx === 0) this.state.round += 1
        deps.broadcast({
            type:'state',
            hp: Object.fromEntries(this.state.hp),
            round: this.state.round,
            turn: this.currentTurnName(),
        })
        return
    }

    // その他
    }
}
