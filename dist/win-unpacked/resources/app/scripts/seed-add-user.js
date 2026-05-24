const { loadEnv } = require('../load-env')
loadEnv()
const { Client } = require('pg')

async function run() {
  const conn = process.env.DATABASE_URL
  if (!conn) {
    console.error('No DATABASE_URL in environment')
    process.exit(1)
  }
  const email = process.env.SEED_USER_EMAIL || 'admin@example.com'
  const fullName = process.env.SEED_USER_FULL_NAME || 'Admin User'
  const role = process.env.SEED_USER_ROLE || 'admin'

  const client = new Client({ connectionString: conn })
  try {
    await client.connect()
    // Upsert by email (if profile exists, update role/full_name)
    const sql = `INSERT INTO public.profiles (email, full_name, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role
      RETURNING id`;
    const res = await client.query(sql, [email, fullName, role])
    console.log('Profile upserted, id=', res.rows[0].id)
    await client.end()
    process.exit(0)
  } catch (err) {
    console.error('Seeding user failed:', err && err.message)
    try { await client.end() } catch (e) {}
    process.exit(2)
  }
}

run()
