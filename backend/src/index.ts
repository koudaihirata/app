// src/index.ts
import { Hono } from 'hono'
import type { Env } from './types'
export { Room } from './room'  // ← DO クラスをエクスポート（wrangler が拾う）

const app = new Hono<{ Bindings: Env }>()

// /ws?room=room-1&name=Kodai に接続すると、その roomId の DO にルーティング
app.get('/ws', async (c) => {
  const roomId = c.req.query('room') ?? 'room-1'
  const name = c.req.query('name') ?? 'Guest'
  // console.log('[index] incoming /ws', { roomId, name })

  const id = c.env.ROOM.idFromName(roomId)
  const stub = c.env.ROOM.get(id)

  // name をクエリに付けて DO へ転送（Upgrade は DO 側で処理）
  const url = new URL(c.req.url)
  url.searchParams.set('room', roomId)
  url.searchParams.set('name', name)

  return await stub.fetch(new Request(url.toString(), {
    method: c.req.method,
    headers: c.req.raw.headers,
  }))
})

app.get('/', (c) => {
  console.log('[index] GET /')
  return c.text('WS with Durable Objects.')
})

export default app
