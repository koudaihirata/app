export type WebSocketMessage = {
    type: 'CREATE_ROOM' | 'JOIN_ROOM' | 'TOGGLE_READY';
    roomName?: string;
    playerName?: string;
    roomId?: string;
    isReady?: boolean;
}