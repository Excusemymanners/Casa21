const bcrypt = require('bcryptjs')
const { Client } = require('pg')

function buildDisplayNameFromEmail(email) {
  const localPart = String(email || '').split('@')[0].trim()
  if (!localPart) return String(email || '').trim() || null

  const parts = localPart
    .split(/[._\-+]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)

  if (parts.length === 0) return localPart

  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function toNonNullName(email, fullName) {
  const name = String(fullName || '').trim()
  if (name) return name
  return buildDisplayNameFromEmail(email)
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  let client
  try {
    const { email, password } = req.body || {}
    if (!email || !password) return res.status(400).json({ error: 'Missing email or password' })
    const hash = await bcrypt.hash(password, 10)
    client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()

    const fullName = toNonNullName(email, req.body && req.body.full_name)
    const role = 'employee'

    await client.query('BEGIN')
    const userSql = `
      INSERT INTO public.users (email, password_hash, full_name, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email)
      DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role
      RETURNING id, email, full_name, role
    `
    const profileSql = `
      INSERT INTO public.profiles (email, full_name, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (email)
      DO UPDATE SET
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role
      RETURNING id, email, full_name, role
    `

    const { rows: userRows } = await client.query(userSql, [email, hash, fullName, role])
    await client.query(profileSql, [email, fullName, role])
    await client.query('COMMIT')
    return res.status(200).json({ user: userRows[0] })
  } catch (err) {
    try {
      if (client) {
        await client.query('ROLLBACK')
      }
    } catch (rollbackErr) {
      console.warn('register rollback failed', rollbackErr && rollbackErr.message)
    }
    console.error('register error', err)
    return res.status(500).json({ error: err.message || 'Register failed' })
  } finally {
    if (client) {
      try { await client.end() } catch (endErr) {}
    }
  }
}
