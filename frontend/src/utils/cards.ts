export type CardCategory = 'attack' | 'defense' | 'heal'
export type CardMeta = {
    id: number
    label: string
    detail: string
    category: CardCategory
    requiresTarget?: boolean
    allowSelfTarget?: boolean
}

export const CARD_LIBRARY: Record<number, CardMeta> = {
    /* 攻撃カード */
    101: { id: 101, label: '攻撃 2', detail: 'ターゲットへ2ダメージ', category: 'attack', requiresTarget: true, allowSelfTarget: true },
    102: { id: 102, label: '強攻撃 3', detail: 'ターゲットへ3ダメージ', category: 'attack', requiresTarget: true, allowSelfTarget: true },
    /* 防御カード */
    201: { id: 201, label: '防御 2', detail: '攻撃を2軽減', category: 'defense' },
    202: { id: 202, label: '防御 3', detail: '攻撃を3軽減', category: 'defense' },
    /* 回復カード */
    301: { id: 301, label: '回復 +2', detail: 'HPを2回復', category: 'heal', requiresTarget: true, allowSelfTarget: true },
}
