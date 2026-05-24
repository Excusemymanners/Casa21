const os = require('os')

function getLocalIp() {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const localIp = getLocalIp()
    const port = process.env.PORT || 3000
    return res.status(200).json({
      local_ip: localIp,
      port: port,
      url: `http://${localIp}:${port}`
    })
  } catch (err) {
    console.error('system/info error', err)
    return res.status(500).json({ error: err.message })
  }
}
