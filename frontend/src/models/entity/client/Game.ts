// export type GameVO = {

// }

export type CardVO = {
    id: number;
    name: string;
    type: number;
    effect: string;
}

export type Deck = CardVO[];

export type PlayerVO = {
    id: string;
    name: string;
    hand: CardVO[];
    deck: Deck;
}