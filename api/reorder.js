const jwt = require('jsonwebtoken')
const { withClient } = require('./_db')

function authUser(req) {
  const auth = req.headers.authorization || ''
  const m = auth.match(/^Bearer (.+)$/)
  if (!m) return null
  try { return jwt.verify(m[1], process.env.JWT_SECRET) } catch (e) { return null }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const user = authUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })
  if (!['admin', 'ceo'].includes(user.role)) return res.status(403).json({ error: 'Forbidden' })

  const { type, items } = req.body || {}
  if (!type || !Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: 'Missing type or items' })
  if (!['tasks', 'jobs'].includes(type))
    return res.status(400).json({ error: 'type must be tasks or jobs' })

  try {
    await withClient(async (client) => {
      for (const item of items) {
        await client.query(
          `UPDATE public.${type} SET sort_order = $1 WHERE id = $2`,
          [item.sort_order, item.id]
        )
      }
    })
    return res.json({ ok: true })
  } catch (err) {
    console.error('[reorder]', err)
    return res.status(500).json({ error: err.message })
  }
}
