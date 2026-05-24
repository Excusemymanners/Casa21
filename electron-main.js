const fs = require('fs')
const path = require('path')
const { app, BrowserWindow, dialog } = require('electron')
const { spawnSync } = require('child_process')
const { loadEnv } = require('./load-env')

loadEnv()

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'electron-preload.js')
    }
  })

  const startUrl = process.env.ELECTRON_START_URL || null
  if (startUrl) {
    win.loadURL(startUrl)
  } else {
    win.loadFile(path.join(__dirname, 'build', 'index.html'))
  }
}

async function ensureDatabase() {
  try {
    const dockerCheck = spawnSync('docker', ['--version'])
    if (dockerCheck.error) throw dockerCheck.error

    const volumeName = 'overview-db-data'

    // Start or run container
    const hasContainer = spawnSync('docker', ['ps', '-a', '--format', '{{.Names}}'])
    const out = String(hasContainer.stdout || '')
    const containerStillExists = String(spawnSync('docker', ['ps', '-a', '--format', '{{.Names}}']).stdout || '').split('\n').includes('overview-db')
    if (containerStillExists) {
      spawnSync('docker', ['start', 'overview-db'])
    } else {
      spawnSync('docker', ['volume', 'create', volumeName])
      const runArgs = ['run', '--name', 'overview-db', '-e', 'POSTGRES_PASSWORD=pass', '-e', 'POSTGRES_DB=overview', '-p', '5432:5432', '-v', `${volumeName}:/var/lib/postgresql/data`, '-d', 'postgres:15']
      const r = spawnSync('docker', runArgs, { stdio: 'inherit' })
      if (r.error) throw r.error
    }
    // Wait for pg
    for (let i = 0; i < 30; i++) {
      const res = spawnSync('docker', ['exec', 'overview-db', 'pg_isready', '-U', 'postgres'])
      if (res.status === 0) break
      await new Promise(r => setTimeout(r, 1000))
    }
  } catch (err) {
    console.warn('Could not start Docker/Postgres:', err && err.message)
    dialog.showMessageBox({ type: 'warning', message: 'Docker not available or Postgres could not be started. Please install Docker or run Postgres manually and set DATABASE_URL in .env.local' })
  }
}

function runLocalSetupScripts() {
  const scripts = [
    path.join(__dirname, 'scripts', 'run-migrations.js'),
    path.join(__dirname, 'scripts', 'seed-add-user.js'),
    path.join(__dirname, 'scripts', 'seed-user-to-users.js')
  ]

  for (const script of scripts) {
    const result = spawnSync('node', [script], { stdio: 'inherit', env: process.env })
    if (result.status !== 0) {
      throw new Error(`Local setup script failed: ${path.basename(script)}`)
    }
  }
}

function startServerInElectron() {
  try {
    // start the Express API server explicitly so bind errors are visible in Electron logs
    const serverModule = require(path.join(__dirname, 'server', 'server.js'))
    if (serverModule && typeof serverModule.startServer === 'function') {
      serverModule.startServer()
    }
    console.log('Started backend server inside Electron')
  } catch (e) {
    console.warn('Failed to start backend inside Electron:', e && e.message)
  }
}

app.whenReady().then(async () => {
  await ensureDatabase()
  runLocalSetupScripts()
  startServerInElectron()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
