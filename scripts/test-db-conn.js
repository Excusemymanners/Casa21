// Simple DB connection test for local or remote Postgres
const { loadEnv } = require('../load-env')
loadEnv()
const { Client } = require('pg')

async function run() {
  const conn = process.env.DATABASE_URL
  if (!conn) {
    console.error('No DATABASE_URL in environment')
    process.exit(1)
  }

  const client = new Client({ connectionString: conn })
  try {
    await client.connect()
    const res = await client.query('SELECT now() as now')
    console.log('Connected OK. now =', res.rows[0].now)
    await client.end()
    process.exit(0)
  } catch (err) {
    console.error('DB connection failed:', err && err.message)
    try { await client.end() } catch (e) {}
    process.exit(2)
  }
}

run()
