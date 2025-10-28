export type RoomVO = {
    id: string;
    name: string;
    players: PlayerVO[];
    status: 'waiting' | 'playing' | 'finished';
    maxPlayers: number;
}

export type PlayerVO = {
    id: string;
    name: string;
    isHost: boolean;
    isReady: boolean;
}