import { Hono } from 'hono'
import type { Env } from './room'
export { Room } from './room'  // ← DO クラスをエクスポート（wrangler が拾う）

const app = new Hono<{ Bindings: Env }>()

// /ws?room=room-1&name=Kodai に接続すると、その roomId の DO にルーティング
app.get('/ws', async (c) => {
  const roomId = c.req.query('room') ?? 'room-1'
  const name = c.req.query('name') ?? 'Guest'
  console.log('[index] incoming /ws', { roomId, name })

  const id = c.env.ROOM.idFromName(roomId)        // roomIdごとに同じ DO にルーティング
  const stub = c.env.ROOM.get(id)

  // name をクエリに付けて DO へ転送（Upgrade は DO 側で処理）
  const url = new URL(c.req.url)
  url.searchParams.set('name', name)

  const forwarded = new Request(url.toString(), c.req.raw)
  const res = await stub.fetch(forwarded)
  console.log('[index] forwarded to DO', { status: res.status })
  return res
})

app.get('/', (c) => {
  console.log('[index] GET /')
  return c.text('WS with Durable Objects.')
})

export default app
