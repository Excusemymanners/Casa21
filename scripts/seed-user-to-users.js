const { loadEnv } = require('../load-env')
loadEnv()
const bcrypt = require('bcryptjs')
const { Client } = require('pg')

async function run() {
  const conn = process.env.DATABASE_URL
  if (!conn) {
    console.error('No DATABASE_URL in environment')
    process.exit(1)
  }
  const email = process.env.SEED_USER_EMAIL || 'admin@example.com'
  const password = process.env.SEED_USER_PASSWORD || 'password123'
  const fullName = process.env.SEED_USER_FULL_NAME || 'Admin User'
  const role = process.env.SEED_USER_ROLE || 'admin'

  const hash = await bcrypt.hash(password, 10)
  const client = new Client({ connectionString: conn })
  try {
    await client.connect()
    const sql = `INSERT INTO public.users (email, password_hash, full_name, role) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name, role = EXCLUDED.role RETURNING id`;
    const { rows } = await client.query(sql, [email, hash, fullName, role])
    console.log('User upserted, id=', rows[0].id)
    await client.end()
    process.exit(0)
  } catch (err) {
    console.error('Seeding user failed:', err && err.message)
    try { await client.end() } catch (e) {}
    process.exit(2)
  }
}

run()
