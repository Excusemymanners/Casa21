const jwt = require('jsonwebtoken')
const { withClient } = require('../_db')

function authUser(req) {
  const auth = req.headers.authorization || ''
  const m = auth.match(/^Bearer (.+)$/)
  if (!m) return null
  try { return jwt.verify(m[1], process.env.JWT_SECRET) } catch (e) { return null }
}

module.exports = async (req, res) => {
  const user = authUser(req)
  const method = req.method
  const parts = (req.path || '').split('/').filter(Boolean)
  const id = parts[0]
  const q = req.query || {}

  try {
    if (method === 'GET') {
      return await withClient(async (client) => {
        if (id) {
          const { rows } = await client.query('SELECT * FROM public.jobs WHERE id = $1', [id])
          if (!rows.length) return res.status(404).json({ error: 'Not found' })
          return res.json({ data: rows[0] })
        }

        let sql = 'SELECT * FROM public.jobs'
        const params = []
        const where = []
        if (q.eqField && q.eqValue != null) { params.push(q.eqValue); where.push(`${q.eqField} = $${params.length}`) }
        if (q.ltField && q.ltValue != null) { params.push(q.ltValue); where.push(`${q.ltField} < $${params.length}`) }
        if (q.neqField && q.neqValue != null) { params.push(q.neqValue); where.push(`${q.neqField} <> $${params.length}`) }
        if (q.inField && q.inValue != null) {
          const values = String(q.inValue).split(',').filter(Boolean)
          const ph = values.map((_, i) => `$${params.length + i + 1}`).join(', ')
          params.push(...values)
          where.push(`${q.inField} IN (${ph})`)
        }
        if (where.length) sql += ' WHERE ' + where.join(' AND ')
        if (q.orderField) sql += ` ORDER BY ${q.orderField} ${q.orderDir === 'asc' ? 'ASC' : 'DESC'}`
        const { rows } = await client.query(sql, params)
        return res.json({ data: rows })
      })
    }

    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    if (method === 'POST') {
      return await withClient(async (client) => {
        const body = Array.isArray(req.body) ? req.body[0] : req.body || {}
        const cols = Object.keys(body)
        const vals = Object.values(body)
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
        const sql = `INSERT INTO public.jobs (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`
        const { rows } = await client.query(sql, vals)
        return res.json({ data: rows })
      })
    }

    if ((method === 'PUT' || method === 'PATCH') && (id || (q.eqField && q.eqValue != null))) {
      return await withClient(async (client) => {
        const body = req.body || {}
        const cols = Object.keys(body)
        const vals = Object.values(body)
        const set = cols.map((c, i) => `${c} = $${i + 1}`).join(', ')
        const whereField = id ? 'id' : q.eqField
        const whereValue = id || q.eqValue
        const sql = `UPDATE public.jobs SET ${set} WHERE ${whereField} = $${cols.length + 1} RETURNING *`
        const { rows } = await client.query(sql, [...vals, whereValue])
        if (!rows.length) return res.status(404).json({ error: 'Not found' })
        return res.json({ data: rows })
      })
    }

    if (method === 'DELETE' && (id || (q.eqField && q.eqValue != null))) {
      return await withClient(async (client) => {
        const whereField = id ? 'id' : q.eqField
        const whereValue = id || q.eqValue
        const { rows } = await client.query(`DELETE FROM public.jobs WHERE ${whereField} = $1 RETURNING *`, [whereValue])
        return res.json({ data: rows })
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('jobs handler error', err)
    return res.status(500).json({ error: err.message })
  }
}
