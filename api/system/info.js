const os = require('os')

// Fallback when LAN_HOST is not set: prefer a real LAN adapter (192.168.x / 10.x),
// skipping virtual adapters (Hyper-V, WSL, VPN) and link-local addresses.
function getLocalIp() {
  const interfaces = os.networkInterfaces()
  const candidates = []
  for (const name of Object.keys(interfaces)) {
    if (/vEthernet|WSL|VirtualBox|VMware|Bluetooth/i.test(name)) continue
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254.')) {
        candidates.push(iface.address)
      }
    }
  }
  return candidates.find(ip => ip.startsWith('192.168.')) || candidates.find(ip => ip.startsWith('10.')) || candidates[0] || '127.0.0.1'
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const localIp = process.env.LAN_HOST || getLocalIp()
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
