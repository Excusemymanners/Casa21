const jwt = require('jsonwebtoken')
const { withClient } = require('../_db')

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
  const { id } = req.body || {}
  if (!id) return res.status(400).json({ error: 'Missing task id' })

  try {
    return await withClient(async (client) => {
      // Lock the row to avoid races
      const { rows: curRows } = await client.query('SELECT completers, value, status FROM public.tasks WHERE id = $1 FOR UPDATE', [id])
      if (!curRows || curRows.length === 0) return res.status(404).json({ error: 'Task not found' })
      const cur = curRows[0]
      const existing = Array.isArray(cur.completers) ? cur.completers.slice() : (cur.completers ? JSON.parse(cur.completers) : [])

      // Check if user already completed this task
      if (existing.find(c => c.id === user.sub)) return res.status(200).json({ ok: true, message: 'Already completed', data: { completers: existing } })
      if (existing.length >= 2) return res.status(400).json({ error: 'Already has two completers' })

      const now = new Date().toISOString()
      const newCompleter = { id: user.sub, email: user.email, completed_at: now }
      existing.push(newCompleter)

      // Compute amounts if value present
      const value = cur.value != null ? parseFloat(cur.value) : null
      if (value != null) {
        const share = parseFloat((value / existing.length).toFixed(2))
        existing.forEach(c => { c.amount = share })
      }

      const updatedAt = now
      const completedAt = existing.length > 0 ? existing[0].completed_at : now
      const first = existing[0]

      const sql = `UPDATE public.tasks SET completers = $1::jsonb, status = $2, completed_at = $3, completed_by = $4, completed_by_email = $5 WHERE id = $6 RETURNING *`
      const params = [JSON.stringify(existing), 'completed', completedAt, first ? first.id : null, first ? first.email : null, id]
      console.log('[tasks/complete] SQL:', sql, 'PARAMS:', params)
      const { rows } = await client.query(sql, params)
      const completedTask = rows[0]
      // Auto-complete job when all its tasks are completed
      if (completedTask && completedTask.job_id) {
        try {
          const { rows: rem } = await client.query(
            `SELECT COUNT(*) AS c FROM public.tasks WHERE job_id = $1 AND status <> 'completed'`,
            [completedTask.job_id]
          )
          if (parseInt(rem[0].c, 10) === 0) {
            await client.query(
              `UPDATE public.jobs SET status = 'completed', completed_at = NOW() WHERE id = $1 AND (status IS NULL OR status <> 'completed')`,
              [completedTask.job_id]
            )
          }
        } catch (autoErr) { console.warn('[tasks/complete] auto-complete job failed:', autoErr.message) }
      }
      return res.json({ data: completedTask })
    })
  } catch (err) {
    console.error('tasks/complete error', err)
    return res.status(500).json({ error: err.message, stack: err.stack })
  }
}
