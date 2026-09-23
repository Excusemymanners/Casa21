const { loadEnv } = require('../load-env')
loadEnv()
const express = require('express')
const path = require('path')
const bodyParser = require('body-parser')
const cron = require('node-cron')
const { sendDailyTasksEmails } = require('./daily-tasks-mailer')
const { sendDeadlineReminderEmails } = require('./deadline-reminder-mailer')

// Dynamically load API handlers from the repo's api/ folder
const fs = require('fs')
const apiRoot = path.join(__dirname, '..', 'api')

const app = express()
const PORT = process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : (process.env.PORT ? parseInt(process.env.PORT, 10) : 3001)

app.use(bodyParser.json())

function loadApiHandlers(dir, baseRoute = '/api') {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const ent of entries) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      loadApiHandlers(full, baseRoute + '/' + ent.name)
    } else if (ent.isFile() && ent.name.endsWith('.js') && !ent.name.startsWith('_')) {
      const routeName = ent.name === 'index.js' ? baseRoute : (baseRoute + '/' + ent.name.replace(/\.js$/, ''))
      try {
        const handler = require(full)
        // mount handler at the route and allow sub-paths
        app.use(routeName, (req, res) => handler(req, res))
        console.log('Mounted API handler', routeName)
      } catch (e) {
        console.warn('Failed loading API handler', full, e && e.message)
      }
    }
  }
}

if (fs.existsSync(apiRoot)) loadApiHandlers(apiRoot)

// Optional: health check
app.get('/api/health', (req, res) => res.json({ ok: true }))

function startServer() {
  if (process.env.VERCEL === '1' || process.env.DISABLE_SERVER === 'true') {
    console.log('Server not started: running in serverless environment or DISABLE_SERVER=true')
    return null
  }

  const server = app.listen(PORT, () => {
    console.log(`Local API server listening on http://localhost:${PORT}`)
  })

  // In development, ensure a default admin user exists by running the seed script.
  try {
    if ((process.env.NODE_ENV || 'development') !== 'production') {
      const { spawn } = require('child_process')
      const seed = spawn(process.execPath, [require('path').join(__dirname, '..', 'scripts', 'seed-user-to-users.js')], { stdio: 'inherit', env: process.env })
      seed.on('close', (code) => {
        if (code === 0) console.log('Default admin seed completed')
        else console.warn('Default admin seed exited with code', code)
      })
      seed.on('error', (err) => console.warn('Failed to run default admin seed:', err && err.message))
    }
  } catch (e) {
    console.warn('Error while attempting to seed default admin:', e && e.message)
  }

  server.on('error', (err) => {
    console.error('Local API server failed to start:', err && err.message)
  })

  // Daily task emails — 09:15 (timezone Europe/Bucharest)
  cron.schedule('15 9 * * *', () => sendDailyTasksEmails().catch(e => console.error('[cron 09:15]', e)), { timezone: 'Europe/Bucharest' })
  console.log('Daily task email scheduler started (09:15 Europe/Bucharest)')

  // Deadline reminder emails — 10:00, 12:00, 14:00, 16:00 (Europe/Bucharest)
  // Sends alerts when a task deadline is 1, 2, 3, or 5 days away
  cron.schedule('0 10 * * *', () => sendDeadlineReminderEmails().catch(e => console.error('[cron 10:00]', e)), { timezone: 'Europe/Bucharest' })
  cron.schedule('0 12 * * *', () => sendDeadlineReminderEmails().catch(e => console.error('[cron 12:00]', e)), { timezone: 'Europe/Bucharest' })
  cron.schedule('0 14 * * *', () => sendDeadlineReminderEmails().catch(e => console.error('[cron 14:00]', e)), { timezone: 'Europe/Bucharest' })
  cron.schedule('0 16 * * *', () => sendDeadlineReminderEmails().catch(e => console.error('[cron 16:00]', e)), { timezone: 'Europe/Bucharest' })
  console.log('Deadline reminder email scheduler started (10:00, 12:00, 14:00, 16:00 Europe/Bucharest)')

  return server
}

// Export the Express app for local testing or serverless adapters
if (require.main === module) {
  startServer()
}

module.exports = { app, startServer }
