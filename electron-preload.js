const os = require('os')
const { spawnSync } = require('child_process')
const { contextBridge } = require('electron')

function isValidIPv4(address) {
	return /^\d+\.\d+\.\d+\.\d+$/.test(String(address || '').trim())
}

function isPrivateIPv4(address) {
	const ip = String(address || '').trim()
	return ip.startsWith('10.') || ip.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
}

function collectIpsFromHostnameOutput() {
	try {
		const result = spawnSync('hostname', ['-I'], { encoding: 'utf8' })
		if (!result || result.status !== 0) return []
		return String(result.stdout || '')
			.split(/\s+/)
			.map((item) => item.trim())
			.filter((item) => isValidIPv4(item) && item !== '127.0.0.1')
	} catch (e) {
		return []
	}
}

function collectLanHostCandidates() {
	const candidates = []

	for (const value of [process.env.ELECTRON_LAN_HOST, process.env.LAN_HOST, process.env.LOCAL_IP]) {
		if (isPrivateIPv4(value)) candidates.push(String(value).trim())
	}

	const interfaces = os.networkInterfaces()
	for (const entries of Object.values(interfaces)) {
		for (const entry of entries || []) {
			if (!entry || entry.internal || !entry.address) continue
			const family = String(entry.family || '').toLowerCase()
			if (family !== 'ipv4' && family !== '4') continue
			if (isPrivateIPv4(entry.address)) candidates.push(String(entry.address).trim())
		}
	}

	const hostnameIps = collectIpsFromHostnameOutput()
	for (const ip of hostnameIps) {
		if (isPrivateIPv4(ip)) candidates.push(ip)
	}

	return [...new Set(candidates)]
}

function getLocalNetworkHost() {
	const preferredNames = ['wi-fi', 'wifi', 'wlan', 'wireless', 'wl', 'eth', 'enp', 'eno', 'ethernet']
	const excludedNames = ['docker', 'veth', 'br-', 'virbr', 'vmnet', 'tun', 'tap', 'lo', 'loopback']
	const candidates = collectLanHostCandidates()
	if (candidates.length > 0) return candidates[0]

	if (isValidIPv4(process.env.ELECTRON_LAN_HOST)) return String(process.env.ELECTRON_LAN_HOST).trim()
	if (isValidIPv4(process.env.LAN_HOST)) return String(process.env.LAN_HOST).trim()
	if (isValidIPv4(process.env.LOCAL_IP)) return String(process.env.LOCAL_IP).trim()

	// Last-resort fallback used when the LAN IP cannot be auto-detected.
	return '192.168.0.124'
}

function getLocalNetworkUrl(port = 3000, pathname = '/Signup') {
	const host = getLocalNetworkHost()
	const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`
	return `http://${host}:${port}${cleanPath}`
}

contextBridge.exposeInMainWorld('electron', {
	getLocalNetworkHost,
	getLocalNetworkUrl
})
