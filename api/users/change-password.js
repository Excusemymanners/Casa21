const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { Client } = require('pg')

async function authUser(req) {
  const auth = req.headers.authorization || ''
  const m = auth.match(/^Bearer (.+)$/)
  if (!m) return null
  try { return jwt.verify(m[1], process.env.JWT_SECRET) } catch (e) { return null }
}

module.exports = async (req, res) => {
  // Basic CORS support and preflight handling
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  // Diagnostic logging to help debug 405 cases
  try { console.log('change-password request method=', req.method, 'authorization=', Boolean(req.headers && req.headers.authorization)) } catch (e) {}

  // Accept POST and PUT for flexibility
  if (!['POST', 'PUT'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' })
  const user = await authUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })
  // Allow CEO and admin to change other users' passwords
  if (!['ceo', 'admin'].includes(user.role)) return res.status(403).json({ error: 'Forbidden' })

  const { email, id, new_password } = req.body || {}
  if (!new_password) return res.status(400).json({ error: 'Missing new_password' })
  if (!email && !id) return res.status(400).json({ error: 'Missing email or id to identify user' })

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  try {
    await client.connect()
    const hash = await bcrypt.hash(new_password, 10)
    let rows = []

    if (email) {
      const directByEmail = await client.query(
        'UPDATE public.users SET password_hash = $1 WHERE email = $2 RETURNING id, email',
        [hash, email]
      )
      rows = directByEmail.rows || []
    }

    if ((!rows || rows.length === 0) && id) {
      const directById = await client.query(
        'UPDATE public.users SET password_hash = $1 WHERE id = $2 RETURNING id, email',
        [hash, id]
      )
      rows = directById.rows || []
    }

    if ((!rows || rows.length === 0) && id) {
      const profileLookup = await client.query('SELECT email FROM public.profiles WHERE id = $1', [id])
      const profileEmail = profileLookup.rows && profileLookup.rows[0] && profileLookup.rows[0].email
      if (profileEmail) {
        const fallbackByEmail = await client.query(
          'UPDATE public.users SET password_hash = $1 WHERE email = $2 RETURNING id, email',
          [hash, profileEmail]
        )
        rows = fallbackByEmail.rows || []
      }
    }

    if (!rows || rows.length === 0) return res.status(404).json({ error: 'User not found' })
    return res.json({ ok: true, user: rows[0] })
  } catch (err) {
    console.error('change-password error', err && err.message)
    return res.status(500).json({ error: err.message || 'Failed to change password' })
  } finally {
    try { await client.end() } catch (e) {}
  }
}
