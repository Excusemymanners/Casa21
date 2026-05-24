const { loadEnv } = require('../load-env')
loadEnv()
const fs = require('fs')
const path = require('path')
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
    const migrationsDir = path.join(__dirname, '..', 'migrations')
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
    for (const f of files) {
      const p = path.join(migrationsDir, f)
      const sql = fs.readFileSync(p, 'utf8')
      console.log('Running migration:', f)
      try {
        await client.query(sql)
        console.log('OK:', f)
      } catch (err) {
        console.error('Migration failed:', f, err && err.message)
        throw err
      }
    }
    await client.end()
    console.log('All migrations applied')
    process.exit(0)
  } catch (err) {
    console.error('Migrations failed', err && err.message)
    try { await client.end() } catch (e) {}
    process.exit(2)
  }
}

run()
