const { loadEnv } = require('../load-env')
loadEnv()
const { execSync, spawn } = require('child_process')
const path = require('path')
const { Client } = require('pg')

let DB_NAME = process.env.POSTGRES_DB || 'overview'
let DB_USER = process.env.POSTGRES_USER || 'postgres'
let DB_PASS = process.env.POSTGRES_PASSWORD || 'postgres'
let DB_PORT = process.env.POSTGRES_PORT || '5432'
let DB_HOST = process.env.POSTGRES_HOST || 'localhost'
const CONTAINER_NAME = process.env.LOCAL_DB_CONTAINER || 'overview-db'
const DATA_DIR = path.join(__dirname, '..', 'pgdata')
const IMAGE = process.env.POSTGRES_IMAGE || 'postgres:15'

function dockerAvailable() {
  try {
    execSync('docker --version', { stdio: 'ignore' })
    return true
  } catch (e) {
    return false
  }
}

async function waitForDb(url, retries = 30, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const client = new Client({ connectionString: url })
      await client.connect()
      await client.end()
      return true
    } catch (e) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
  return false
}

async function main() {
  if (!dockerAvailable()) {
    console.error('Docker nu este instalat sau nu este în PATH. Instalează Docker sau setează `DATABASE_URL` manual în .env')
    process.exit(1)
  }

  try {
    // If DATABASE_URL provided, try to use it; if inaccessible, fallback to Docker
    let url = process.env.DATABASE_URL
    if (url) {
      console.log('Folosește `DATABASE_URL` din mediu. Verific conexiunea...')
      const reachable = await waitForDb(url, 5, 1000)
      if (!reachable) {
        if (!dockerAvailable()) {
          console.error('`DATABASE_URL` este setat dar inaccesibil și Docker nu e disponibil.')
          process.exit(1)
        }
        console.log('`DATABASE_URL` inaccesibil. Voi porni un container Docker local...')
        try {
          const parsed = new URL(url)
          DB_USER = parsed.username || DB_USER
          DB_PASS = parsed.password || DB_PASS
          DB_HOST = parsed.hostname || DB_HOST
          DB_PORT = parsed.port || DB_PORT
          DB_NAME = parsed.pathname && parsed.pathname.slice(1) ? parsed.pathname.slice(1) : DB_NAME
        } catch (e) {
          // ignore URL parse errors, use env/defaults
        }
        let exists = true
        try {
          execSync(`docker container inspect ${CONTAINER_NAME}`, { stdio: 'ignore' })
        } catch (e) {
          exists = false
        }
        if (exists) {
          console.log(`Pornesc containerul existent ${CONTAINER_NAME}...`)
          execSync(`docker start ${CONTAINER_NAME}`, { stdio: 'inherit' })
        } else {
          console.log(`Creez și pornesc containerul ${CONTAINER_NAME} (${IMAGE})...`)
          const cmd = [
            'run', '-d', `--name ${CONTAINER_NAME}`,
            '-e', `POSTGRES_PASSWORD=${DB_PASS}`,
            '-e', `POSTGRES_USER=${DB_USER}`,
            '-e', `POSTGRES_DB=${DB_NAME}`,
            '-p', `${DB_PORT}:5432`,
            '-v', `${DATA_DIR}:/var/lib/postgresql/data`,
            IMAGE
          ].join(' ')
          execSync(`docker ${cmd}`, { stdio: 'inherit' })
        }
        process.env.DATABASE_URL = `postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}`
        url = process.env.DATABASE_URL
      } else {
        console.log('Conexiune reușită la `DATABASE_URL`.')
      }
    } else {
      // Check if container exists
      let exists = true
      try {
        execSync(`docker container inspect ${CONTAINER_NAME}`, { stdio: 'ignore' })
      } catch (e) {
        exists = false
      }

      if (exists) {
        console.log(`Pornesc containerul existent ${CONTAINER_NAME}...`)
        execSync(`docker start ${CONTAINER_NAME}`, { stdio: 'inherit' })
      } else {
        console.log(`Creez și pornesc containerul ${CONTAINER_NAME} (${IMAGE})...`)
        const cmd = [
          'run', '-d', `--name ${CONTAINER_NAME}`,
          '-e', `POSTGRES_PASSWORD=${DB_PASS}`,
          '-e', `POSTGRES_USER=${DB_USER}`,
          '-e', `POSTGRES_DB=${DB_NAME}`,
          '-p', `${DB_PORT}:5432`,
          '-v', `${DATA_DIR}:/var/lib/postgresql/data`,
          IMAGE
        ].join(' ')
        execSync(`docker ${cmd}`, { stdio: 'inherit' })
      }

      // Set DATABASE_URL for local use
      process.env.DATABASE_URL = `postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}`
      url = process.env.DATABASE_URL
    }

    const urlToWait = process.env.DATABASE_URL
    console.log('Aștept baza de date la:', urlToWait)
    const ok = await waitForDb(urlToWait, 60, 1000)
    if (!ok) {
      console.error('Nu am reușit să mă conectez la baza de date în timp util.')
      process.exit(2)
    }

    console.log('Baza de date e gata. Rulez migrațiile...')
    try {
      execSync('node scripts/run-migrations.js', { stdio: 'inherit' })
    } catch (e) {
      console.error('Migrațiile au eșuat:', e && e.message)
      process.exit(3)
    }

    console.log('Migrațiile complete. Pornesc aplicația (react-scripts start)...')
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const p = spawn(npm, ['run', 'start'], { stdio: 'inherit' })
    p.on('exit', code => process.exit(code))
  } catch (err) {
    console.error('Eroare în start-local-db:', err && err.message)
    process.exit(4)
  }
}

main()
