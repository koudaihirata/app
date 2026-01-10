export type CardCategory = 'attack' | 'defense' | 'heal' | 'special'
export type CardMeta = {
    id: number
    label: string
    detail: string
    category: CardCategory
    requiresTarget?: boolean
    allowSelfTarget?: boolean
    img: string
}

export const CARD_LIBRARY: Record<number, CardMeta> = {
    /* 攻撃カード */
    101: { id: 101, label: '木の剣', detail: '1ダメージを与える', category: 'attack', requiresTarget: true, allowSelfTarget: true, img: 'woodenSword' },
    102: { id: 102, label: '真剣', detail: '3ダメージを与える', category: 'attack', requiresTarget: true, allowSelfTarget: true, img: '' },
    /* 防御カード */
    201: { id: 201, label: 'ボロボロの盾', detail: '1ダメージ防ぐ', category: 'defense', img: '' },
    202: { id: 202, label: '量産型シールド', detail: '3ダメージ防ぐ', category: 'defense', img: '' },
    /* 回復カード */
    301: { id: 301, label: '癒しの薬草', detail: 'HPが1回復（HPが満タンの時最大体力が増える）', category: 'heal', requiresTarget: true, allowSelfTarget: true, img: '' },
}
