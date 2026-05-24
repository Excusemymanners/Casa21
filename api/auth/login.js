const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { Client } = require('pg')

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { email, password } = req.body || {}
    if (!email || !password) return res.status(400).json({ error: 'Missing email or password' })

    const client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    const { rows } = await client.query('SELECT id, email, password_hash, role, full_name FROM public.users WHERE email = $1', [email])
    await client.end()
    if (!rows || rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' })
    const user = rows[0]
    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })

    const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' })
    return res.status(200).json({ access_token: token, token_type: 'bearer', user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role } })
  } catch (err) {
    console.error('login error', err)
    return res.status(500).json({ error: err.message || 'Login failed' })
  }
}
