// src/ws/game.ts
import type { Client } from '../types'

export type GameDeps = {
    send: (ws: Client, obj: unknown) => void
    broadcast: (obj: unknown) => void
    getPlayers: () => string[]
    sendTo: (player: string, obj: unknown) => void
}

export type TurnPhase = 'action' | 'defense'

export type PendingDefense = {
    attacker: string
    target: string
    cardId: number
    damage: number
    totalDamage: number
    blocked: number
    cardsUsed: number[]
}

export type GameState = {
    started: boolean
    players: string[]
    hp: Map<string, number>
    round: number
    turnIdx: number
    deck: Record<string, number[]>
    discard: Record<string, number[]>
    deckVer: number
    phase: TurnPhase
    pendingDefense?: PendingDefense
    hands: Map<string, number[]>
    lastActor?: string
}

const isAttackCard = (id: number) => Math.floor(id / 100) === 1
const isDefenseCard = (id: number) => Math.floor(id / 100) === 2
const isHealCard = (id: number) => Math.floor(id / 100) === 3

export class GameEngine {
    state: GameState = {
        started: false,
        players: [],
        hp: new Map(),
        round: 1,
        turnIdx: 0,
        deck: {},
        discard: {},
        deckVer: 1,
        phase: 'action',
        pendingDefense: undefined,
        hands: new Map(),
        lastActor: undefined
    }

    currentTurnName() { return this.state.players[this.state.turnIdx] ?? '' }
    alivePlayers() {
        return this.state.players.filter(p => (this.state.hp.get(p) ?? 0) > 0)
    }
    advanceTurnFrom(actor: string) {
        const idx = this.state.players.indexOf(actor)
        if (idx === -1 || this.state.players.length === 0) {
            this.state.turnIdx = 0
            return
        }
        this.state.turnIdx = (idx + 1) % this.state.players.length
        if (this.state.turnIdx === 0) this.state.round += 1
        this.state.lastActor = actor
    }
    removeDefeatedPlayers() {
        const alive = this.alivePlayers()
        const aliveSet = new Set(alive)
        if (aliveSet.size === this.state.players.length) return alive
        this.state.players = this.state.players.filter(p => aliveSet.has(p))
        if (this.state.turnIdx >= this.state.players.length) {
            this.state.turnIdx = 0
        }
        return alive
    }

    buildDeck() {
        const ids = [101,101,102,102,201,202,301,301]
        for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[ids[i], ids[j]] = [ids[j], ids[i]]
        }
        return ids
    }

    drawCards(player: string, count: number) {
        this.state.deck[player] = this.state.deck[player] ?? this.buildDeck()
        this.state.discard[player] = this.state.discard[player] ?? []
        const deck = this.state.deck[player]
        const discard = this.state.discard[player]
        const hand = this.state.hands.get(player) ?? []
        const drawn: number[] = []
        for (let i = 0; i < count; i++) {
            if (deck.length === 0) {
                if (discard.length === 0) break
                while (discard.length) deck.push(discard.pop()!)
                for (let k = deck.length - 1; k > 0; k--) {
                    const j = Math.floor(Math.random() * (k + 1))
                    ;[deck[k], deck[j]] = [deck[j], deck[k]]
                }
            }
            const card = deck.shift()
            if (typeof card === 'number') {
                drawn.push(card)
                hand.push(card)
            }
        }
        this.state.hands.set(player, hand)
        return drawn
    }

    removeCardFromHand(player: string, cardId: number) {
        const hand = this.state.hands.get(player) ?? []
        const idx = hand.indexOf(cardId)
        if (idx === -1) return false
        hand.splice(idx, 1)
        this.state.hands.set(player, hand)
        this.state.discard[player] = this.state.discard[player] ?? []
        this.state.discard[player].push(cardId)
        return true
    }

    private sendHand(deps: GameDeps, player: string) {
        const hand = [...(this.state.hands.get(player) ?? [])]
        deps.sendTo(player, { type: 'hand_update', hand })
    }

    sendHandSnapshot(deps: GameDeps, player: string) {
        this.sendHand(deps, player)
    }

    private sendError(deps: GameDeps, player: string, text: string) {
        deps.sendTo(player, { type: 'error', text })
    }

    private useCard(deps: GameDeps, player: string, cardId: number): boolean {
        if (!this.removeCardFromHand(player, cardId)) {
            this.sendError(deps, player, '指定したカードは手札にありません')
            return false
        }
        this.drawCards(player, 1)
        this.sendHand(deps, player)
        return true
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
        this.state.deck = {}
        this.state.discard = {}
        this.state.hands = new Map()
        for (const player of players) {
            this.state.deck[player] = this.buildDeck()
            this.state.discard[player] = []
            this.state.hands.set(player, [])
            this.drawCards(player, 3)
        }
        this.state.phase = 'action'
        this.state.pendingDefense = undefined
        deps.broadcast({
        type: 'game_started',
        players: this.state.players,
        hp: Object.fromEntries(this.state.hp),
        round: this.state.round,
        turn: this.currentTurnName(),
        deckVer: this.state.deckVer,
        })
        for (const player of players) {
            this.sendHandSnapshot(deps, player)
        }
    }

    handleMessage(deps: GameDeps, ws: Client, actor: string, parsed: any): 'game_over' | void {
        if (parsed.type === 'sync') {
            deps.send(ws, {
                type: 'state',
                hp: Object.fromEntries(this.state.hp),
                round: this.state.round,
                turn: this.currentTurnName(),
                phase: this.state.phase,
                defense: this.state.pendingDefense ? {
                    attacker: this.state.pendingDefense.attacker,
                    target: this.state.pendingDefense.target,
                    damage: this.state.pendingDefense.damage,
                    cardId: this.state.pendingDefense.cardId
                } : undefined
            })
            this.sendHandSnapshot(deps, actor)
            return
        }

        if (parsed.type === 'play') {
            if (this.state.phase === 'defense') {
                return this.handleDefensePlay(deps, ws, actor, parsed)
            }
            return this.handleActionPlay(deps, ws, actor, parsed)
        }

        if (parsed.type === 'end_turn') {
            if (this.state.phase === 'defense') {
                if (this.state.pendingDefense && this.state.pendingDefense.target === actor) {
                    return this.finishPendingDefense(deps)
                }
                return
            }
            if (!this.state.started) return
            if (actor !== this.currentTurnName()) return
            this.advanceTurnFrom(actor)
            deps.broadcast({
                type:'state',
                hp: Object.fromEntries(this.state.hp),
                round: this.state.round,
                turn: this.currentTurnName(),
                phase: this.state.phase,
                defense: this.state.pendingDefense ? {
                    attacker: this.state.pendingDefense.attacker,
                    target: this.state.pendingDefense.target,
                    damage: this.state.pendingDefense.damage,
                    cardId: this.state.pendingDefense.cardId
                } : undefined
            })
            return
        }

        if (parsed.type === 'mulligan') {
            if (!this.state.started) { deps.send(ws, { type:'error', text:'ゲーム未開始' }); return }
            if (this.state.phase !== 'action') { deps.send(ws, { type:'error', text:'防御ターンでは使用できません' }); return }
            if (actor !== this.currentTurnName()) { deps.send(ws, { type:'error', text:'あなたのターンではありません' }); return }
            this.handleMulligan(deps, actor)
            return
        }
    }
    

    private handleActionPlay(deps: GameDeps, ws: Client, actor: string, parsed: { cardId: number; target?: string }): 'game_over' | void {
        if (!this.state.started) { deps.send(ws, { type:'error', text:'ゲーム未開始' }); return }
        if (actor !== this.currentTurnName()) { deps.send(ws, { type:'error', text:'あなたのターンではありません' }); return }

        const { cardId, target } = parsed

        /* 攻撃カード */
        if (isAttackCard(cardId)) {
            const targetName = this.resolveTarget(actor, target)
            if (!targetName) { deps.send(ws, { type:'error', text:'攻撃可能なターゲットがいません' }); return }
            if (!this.useCard(deps, actor, cardId)) return

            let damage = 0
            switch (cardId) {
                case 101:
                    damage = 2
                    break;
                case 102:
                    damage = 3
                    break;
                default:
                    deps.send(ws, { type:'error', text:`未知の攻撃カード: ${cardId}` })
                    return
            }

            this.state.pendingDefense = { attacker: actor, target: targetName, cardId, damage, totalDamage: damage, blocked: 0, cardsUsed: [] }
            this.state.phase = 'defense'
            deps.broadcast({
                type: 'defense_requested',
                attacker: actor,
                target: targetName,
                damage,
                cardId
            })
            return
        }

        /* 回復カード */
        if (isHealCard(cardId)) {
            if (!this.useCard(deps, actor, cardId)) return

            let healValue = 0
            switch (cardId) {
                case 301:
                    healValue = 2
                    break;
            
                default:
                    deps.send(ws, { type:'error', text:`未知の回復カード: ${cardId}` })
                    return
            }

            const targetName = target ?? actor
            const cur = this.state.hp.get(targetName) ?? 0
            this.state.hp.set(targetName, cur + healValue)
            const nextInfo = this.advanceTurnInfo(actor)
            deps.broadcast({
                type:'played',
                by: actor,
                cardId,
                target: targetName,
                delta:{ hp: { [targetName]: healValue } },
                next: nextInfo
            })
            return
        }

        /* 防御カード */
        if (isDefenseCard(cardId)) {
            deps.send(ws, { type:'error', text:'防御カードは攻撃を受けたターンのみ使用できます' })
            return
        }

        deps.send(ws, { type:'error', text:`未知のカード: ${cardId}` })
    }

    private handleDefensePlay(deps: GameDeps, ws: Client, actor: string, parsed: { cardId: number }): 'game_over' | void {
        const pending = this.state.pendingDefense
        if (!pending) {
            this.state.phase = 'action'
            return
        }
        if (actor !== pending.target) {
            deps.send(ws, { type:'error', text:'現在の防御ターンではありません' })
            return
        }
        if (!isDefenseCard(parsed.cardId)) {
            deps.send(ws, { type:'error', text:'使用できるのは防御カードのみです' })
            return
        }
        if (!this.useCard(deps, actor, parsed.cardId)) return

        let defenseValue = 0
        switch (parsed.cardId) {
            case 201:
                defenseValue = 2
                break;
            case 202:
                defenseValue = 3
                break;
            default:
                deps.send(ws, { type:'error', text:`未知の防御カード: ${parsed.cardId}` })
                return
        }

        pending.damage = Math.max(0, pending.damage - defenseValue)
        pending.blocked += defenseValue
        pending.cardsUsed.push(parsed.cardId)

        if (pending.damage <= 0) {
            return this.finishPendingDefense(deps)
        }
        return
    }

    private finishPendingDefense(deps: GameDeps): 'game_over' | void {
        const pending = this.state.pendingDefense
        if (!pending) return
        const blocked = Math.min(pending.blocked, pending.totalDamage)
        const netDamage = Math.max(0, pending.totalDamage - blocked)
        const delta: Record<string, number> = {}
        if (netDamage > 0) {
            const cur = this.state.hp.get(pending.target) ?? 0
            this.state.hp.set(pending.target, Math.max(0, cur - netDamage))
            delta[pending.target] = -netDamage
        }
        this.state.pendingDefense = undefined
        this.state.phase = 'action'

        const alive = this.removeDefeatedPlayers()
        if (this.state.players.length === 0) {
            this.state.started = false
            return
        }

        this.advanceTurnFrom(pending.attacker)
        const nextInfo = { round: this.state.round, turn: this.currentTurnName() }

        deps.broadcast({
            type:'played',
            by: pending.attacker,
            cardId: pending.cardId,
            target: pending.target,
            delta:{ hp: delta },
            next: nextInfo,
            defense: {
                by: pending.target,
                blocked,
                cards: pending.cardsUsed
            }
        })

        if (alive.length === 1) {
            deps.broadcast({ type:'game_over', winner: alive[0] })
            this.state.started = false
            return 'game_over'
        }
    }

    private advanceTurnInfo(actor: string) {
        this.advanceTurnFrom(actor)
        return { round: this.state.round, turn: this.currentTurnName() }
    }

    private resolveTarget(actor: string, target?: string): string | null {
        const candidate = target ?? this.defaultTarget(actor)
        if (!candidate) return null
        const hp = this.state.hp.get(candidate) ?? 0
        if (hp <= 0) return null
        return candidate
    }

    private defaultTarget(actor: string): string | null {
        if (this.state.players.length <= 1) return null
        const idx = this.state.players.indexOf(actor)
        if (idx === -1) return null
        for (let i = 1; i < this.state.players.length + 1; i++) {
            const candidate = this.state.players[(idx + i) % this.state.players.length]
            if ((this.state.hp.get(candidate) ?? 0) > 0) {
                return candidate
            }
        }
        return null
    }

    private handleMulligan(deps: GameDeps, actor: string) {
        const hand = [...(this.state.hands.get(actor) ?? [])]
        if (hand.length !== 3) {
            this.sendError(deps, actor, '手札が3枚揃っていません')
            return
        }
        const allDefense = hand.every(card => isDefenseCard(card))
        if (!allDefense) {
            this.sendError(deps, actor, '防御カード3枚のときだけ引き直しできます')
            return
        }
        this.state.hands.set(actor, [])
        this.state.discard[actor] = this.state.discard[actor] ?? []
        this.state.discard[actor].push(...hand)
        this.drawCards(actor, hand.length)
        this.sendHand(deps, actor)

        deps.broadcast({
            type: 'system',
            text: `♻️ ${actor} が手札を引き直しました`,
            at: Date.now()
        })

        this.advanceTurnFrom(actor)
        deps.broadcast({
            type:'state',
            hp: Object.fromEntries(this.state.hp),
            round: this.state.round,
            turn: this.currentTurnName(),
            phase: this.state.phase
        })
    }
}
