const { Client } = require('pg')
const jwt = require('jsonwebtoken')

async function authUser(req) {
  const auth = req.headers.authorization || ''
  const m = auth.match(/^Bearer (.+)$/)
  if (!m) return null
  try {
    return jwt.verify(m[1], process.env.JWT_SECRET)
  } catch (e) {
    return null
  }
}

module.exports = async (req, res) => {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  try {
    await client.connect()
    const method = req.method
    const q = req.query || {}
    // Normalize path after /api/profiles
    const base = req.baseUrl || ''
    const rel = req.path || ''
    const parts = rel.split('/').filter(Boolean)
    const id = parts[0]

    if (method === 'GET' && !id) {
      let sql = 'SELECT id, email, full_name, role, created_at FROM public.profiles'
      const params = []
      const where = []
      if (q.eqField && q.eqValue != null) { params.push(q.eqValue); where.push(`${q.eqField} = $${params.length}`) }
      if (q.inField && q.inValue != null) {
        const values = String(q.inValue).split(',').filter(Boolean)
        const ph = values.map((_, i) => `$${params.length + i + 1}`).join(', ')
        params.push(...values)
        where.push(`${q.inField} IN (${ph})`)
      }
      if (where.length) sql += ' WHERE ' + where.join(' AND ')
      sql += ' ORDER BY created_at DESC'
      const { rows } = await client.query(sql, params)
      await client.end()
      return res.json({ profiles: rows })
    }

    if (method === 'GET' && id) {
      const { rows } = await client.query('SELECT id, email, full_name, role, created_at FROM public.profiles WHERE id = $1', [id])
      await client.end()
      if (!rows || rows.length === 0) return res.status(404).json({ error: 'Not found' })
      return res.json({ profile: rows[0] })
    }

    // Protected endpoints: require auth
    const user = await authUser(req)
    if (!user) {
      await client.end()
      return res.status(401).json({ error: 'Unauthorized' })
    }

    if (method === 'POST' && !id) {
      const { email, full_name, role } = req.body || {}
      if (!email) return res.status(400).json({ error: 'Missing email' })
      const sql = `INSERT INTO public.profiles (email, full_name, role) VALUES ($1,$2,$3) ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role RETURNING id, email, full_name, role`;
      const { rows } = await client.query(sql, [email, full_name || null, role || 'employee'])
      await client.end()
      return res.json({ profile: rows[0] })
    }

    if ((method === 'PUT' || method === 'PATCH') && (id || (q.eqField && q.eqValue != null))) {
      const { full_name, role, email } = req.body || {}
      const whereField = id ? 'id' : q.eqField
      const whereValue = id || q.eqValue
      const sql = `UPDATE public.profiles SET full_name = COALESCE($1, full_name), role = COALESCE($2, role), email = COALESCE($3, email) WHERE ${whereField} = $4 RETURNING id, email, full_name, role`;
      const { rows } = await client.query(sql, [full_name || null, role || null, email || null, whereValue])
      if (!rows || rows.length === 0) return res.status(404).json({ error: 'Not found' })
      const updated = rows[0]
      // If role has changed, also sync to public.users by email (best-effort)
      try {
        if (role) {
          await client.query('UPDATE public.users SET role = $1 WHERE email = $2 OR id = $3', [role, updated.email, updated.id])
        }
      } catch (e) {
        console.warn('Failed to sync role to users table', e && e.message)
      }
      await client.end()
      return res.json({ profile: rows[0] })
    }

    if (method === 'DELETE' && (id || (q.eqField && q.eqValue != null))) {
      // Only admin may delete
      if (user.role !== 'admin') { await client.end(); return res.status(403).json({ error: 'Forbidden' }) }
      const whereField = id ? 'id' : q.eqField
      const whereValue = id || q.eqValue
      await client.query(`DELETE FROM public.profiles WHERE ${whereField} = $1`, [whereValue])
      await client.end()
      return res.json({ ok: true })
    }

    await client.end()
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    try { await client.end() } catch (e) {}
    console.error('profiles handler error', err && err.message)
    return res.status(500).json({ error: err.message })
  }
}
