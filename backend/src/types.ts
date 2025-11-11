// src/types.ts
export interface Env {
    ROOM: DurableObjectNamespace
}

export type Client = WebSocket

export type WsMsg =
    | { type: 'join' }
    | { type: 'chat'; text: string }
    | { type: 'ping' }
    | { type: 'start' }                 // ロビー→ゲームへ
    | { type: 'play'; cardId: number; target?: string }
    | { type: 'end_turn' }
    | { type: 'sync' }

export type Phase = 'lobby' | 'game'
