const jwt = require('jsonwebtoken')
const { Client } = require('pg')

module.exports = async (req, res) => {
  try {
    const auth = req.headers.authorization || ''
    const m = auth.match(/^Bearer (.+)$/)
    if (!m) return res.status(401).json({ error: 'Missing token' })
    const token = m[1]
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    const { rows } = await client.query('SELECT id, email, full_name, role FROM public.users WHERE id = $1', [payload.sub])
    await client.end()
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'User not found' })
    return res.status(200).json({ user: rows[0] })
  } catch (err) {
    console.error('me error', err)
    return res.status(401).json({ error: 'Invalid token' })
  }
}
