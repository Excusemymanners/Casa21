const { Client } = require('pg')

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  try {
    await client.connect()
    const { rows } = await client.query('SELECT id, email, full_name, role, created_at FROM public.users ORDER BY created_at DESC')
    await client.end()
    return res.status(200).json({ users: rows })
  } catch (err) {
    try { await client.end() } catch (e) {}
    console.error('users handler error', err && err.message)
    return res.status(500).json({ error: err.message || 'Failed to load users' })
  }
}
