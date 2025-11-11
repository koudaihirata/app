// src/ws/lobby.ts
import type { Client } from '../types'

export type LobbyDeps = {
    send: (ws: Client, obj: unknown) => void
    broadcast: (obj: unknown) => void
    getMembers: () => string[]
}

export function onLobbyConnect(deps: LobbyDeps, ws: Client, name: string, roomName: string) {
    deps.send(ws, { type: 'joined', roomId: roomName, at: Date.now(), members: deps.getMembers() })
    deps.broadcast({ type: 'members', members: deps.getMembers() })
    deps.broadcast({ type: 'system', text: `🔔 ${name} が「${roomName}」に入室しました`, at: Date.now() })
}

export function handleLobbyMessage(
    deps: LobbyDeps,
    ws: Client,
    name: string,
    parsed: any,                 // 受信メッセージ（JSON）
    promoteToGame: () => void    // フェーズ切替コールバック
) {
    if (parsed.type === 'chat') {
        deps.broadcast({ type: 'chat', from: name, text: String(parsed.text ?? ''), at: Date.now() })
        return
    }
    if (parsed.type === 'ping') {
        deps.send(ws, { type: 'pong', at: Date.now() })
        return
    }
    if (parsed.type === 'start') {
        // フロントにフェーズ変更を通知
        deps.broadcast({ type: 'phase_changed', phase: 'game' })
        promoteToGame()
        return
    }
    if (parsed.type === 'join') return

    deps.send(ws, { type: 'error', text: `未知のtype: ${parsed.type}` })
}

export function onLobbyDisconnect(deps: LobbyDeps, name: string) {
    deps.broadcast({ type: 'system', text: `👋 ${name} が退室しました`, at: Date.now() })
    deps.broadcast({ type: 'members', members: deps.getMembers() })
}
