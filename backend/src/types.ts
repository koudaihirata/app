// src/types.ts
export interface Env {
    ROOM: DurableObjectNamespace
    GOOGLE_PLACES_API_KEY?: string
}

export type Client = WebSocket
export type Phase = 'lobby' | 'game'

/** クライアント → サーバー */
export type InboundWsMsg =
    | { type: 'join'; clientId?: string }
    | { type: 'chat'; text: string }
    | { type: 'ping' }
    | { type: 'start' }                 // ロビー→ゲームへ
    | { type: 'play'; cardId: number; target?: string }
    | { type: 'end_turn' }
    | { type: 'claim_host' }
    | { type: 'mulligan' }
    | { type: 'sync' }

/** サーバー → クライアント */
export type OutboundWsMsg =
    | { type: 'joined'; roomId: string; at: number; members?: string[]; hostClientId?: string }
    | { type: 'members'; members: string[]; hostClientId?: string }
    | { type: 'system'; text: string; at: number }
    | { type: 'chat'; from: string; text: string; at: number }
    | { type: 'pong'; at: number }
    | { type: 'phase_changed'; phase: Phase }
    | { type: 'game_started'; players: string[]; hp: Record<string,number>; round: number; turn: string; deckVer: number }
    | { type: 'state'; hp: Record<string,number>; round: number; turn: string; phase?: 'action' | 'defense'; defense?: { attacker: string; target: string; damage: number; cardId?: number; defenseCardId?: number } }
    | { type: 'defense_requested'; attacker: string; target: string; damage: number; cardId: number; defenseCardId?: number }
    | { type: 'played'; by: string; cardId: number; target?: string; delta: { hp: Record<string,number> }; next?: { round: number; turn: string }; defense?: { by: string; cardId?: number; blocked: number; cards?: number[] } }
    | { type: 'hand_update'; hand: number[] }
    | { type: 'game_over'; winner: string }
    | { type: 'error'; text: string; code?: string }


    /** JSON.parse の直後に使う安全ヘルパ */
export function asInbound(x: unknown): InboundWsMsg {
    return x as InboundWsMsg
}
export function asOutbound(x: unknown): OutboundWsMsg {
    return x as OutboundWsMsg
}
