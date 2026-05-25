const { loadEnv } = require('../load-env')
loadEnv()
const { Client } = require('pg')

(async () => {
  try {
    const client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    const res = await client.query("SELECT id,email,role,full_name,created_at FROM public.users WHERE email='admin'")
    console.log('admin rows:', res.rows)
    await client.end()
    process.exit(0)
  } catch (err) {
    console.error('check-admin failed:', err && err.message)
    process.exit(2)
  }
})()
