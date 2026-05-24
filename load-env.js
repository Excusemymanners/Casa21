const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')

function loadEnv() {
  const rootDir = __dirname
  const envPath = path.join(rootDir, '.env')
  const envLocalPath = path.join(rootDir, '.env.local')
  const initialEnv = { ...process.env }

  if (fs.existsSync(envPath)) {
    const parsed = dotenv.parse(fs.readFileSync(envPath))
    for (const [key, value] of Object.entries(parsed)) {
      if (initialEnv[key] === undefined && process.env[key] === undefined) {
        process.env[key] = value
      }
    }
  }

  if (fs.existsSync(envLocalPath)) {
    const parsed = dotenv.parse(fs.readFileSync(envLocalPath))
    for (const [key, value] of Object.entries(parsed)) {
      if (initialEnv[key] === undefined) {
        process.env[key] = value
      }
    }
  }

  validateEnv()
}

function validateEnv() {
  const requiredVars = ['DATABASE_URL', 'JWT_SECRET']
  const missing = requiredVars.filter(v => !process.env[v])

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '))
    process.exit(1)
  }
}

module.exports = { loadEnv }

