import React from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'react-qr-code'
import './Minimal.css'

const Signup = () => {
  const navigate = useNavigate()
  const [currentTime, setCurrentTime] = React.useState(new Date())
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [error, setError] = React.useState(null)
  const [success, setSuccess] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [localIp, setLocalIp] = React.useState(null)

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  React.useEffect(() => {
    const fetchLocalIp = async () => {
      try {
        const resp = await fetch('/api/system/info')
        if (resp.ok) {
          const data = await resp.json()
          setLocalIp(data.local_ip)
        }
      } catch (err) {
        console.warn('Could not fetch local IP', err)
      }
    }
    fetchLocalIp()
  }, [])

  const qrTargetUrl = React.useMemo(() => {
    const isLanIp = (value) => {
      const ip = String(value || '').trim()
      return /^10\.\d+\.\d+\.\d+$/.test(ip) || /^192\.168\.\d+\.\d+$/.test(ip) || /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(ip)
    }

    const electronHost = window.electron && typeof window.electron.getLocalNetworkHost === 'function'
      ? window.electron.getLocalNetworkHost()
      : null
    if (isLanIp(electronHost)) return `http://${electronHost}:3000/#/Signup`

    const electronUrl = window.electron && typeof window.electron.getLocalNetworkUrl === 'function'
      ? window.electron.getLocalNetworkUrl(3000, '/#/Signup')
      : null
    if (electronUrl) {
      try {
        if (isLanIp(new URL(electronUrl).hostname)) return electronUrl
      } catch (e) {}
    }

    if (localIp) {
      return `http://${localIp}:3000/#/Signup`
    }

    const host = window.location.host || 'localhost:3000'

    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      return `http://192.168.1.216:3000/#/Signup`
    }

    return `http://${host}/#/Signup`
  }, [localIp])

  const copyToClipboard = async (text) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const ta = document.createElement('textarea')
        ta.value = text
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setSuccess('Link copiat în clipboard')
      setTimeout(() => setSuccess(null), 2000)
    } catch (e) {
      setError('Nu am putut copia linkul')
    }
  }

  const qrDebugText = React.useMemo(() => {
    try {
      const host = new URL(qrTargetUrl).hostname
      return /^10\.\d+\.\d+\.\d+$/.test(host) || /^192\.168\.\d+\.\d+$/.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)
        ? null
        : `QR fallback: ${qrTargetUrl}`
    } catch (e) {
      return `QR fallback: ${qrTargetUrl}`
    }
  }, [qrTargetUrl])

  const formattedClock = React.useMemo(() => {
    return new Intl.DateTimeFormat('ro-RO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(currentTime)
  }, [currentTime])

  const handleSignUp = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    // Validare password match
    if (password !== confirmPassword) {
      setError('Passwords do not match!')
      return
    }

    // Validare lungime password
    if (password.length < 6) {
      setError('Password must be at least 6 characters long!')
      return
    }

    setLoading(true)
    try {
      const resp = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      // Handle possibly empty or invalid JSON responses
      const text = await resp.text()
      let body = null
      try {
        body = text ? JSON.parse(text) : null
      } catch (parseErr) {
        console.warn('Failed to parse JSON from /api/auth/register:', parseErr, 'raw:', text)
      }
      if (!resp.ok) throw new Error((body && (body.error || body.message)) || `Signup failed (status ${resp.status})`)
      setSuccess('Account created successfully! You can now login.')
      setTimeout(() => navigate('/'), 1500)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-shell">
        <aside className="auth-side-panel auth-side-panel-left" aria-label="Real-time clock">
          <div className="auth-side-panel-card clock-panel">
            <span className="side-panel-label">Current time</span>
            <div className="clock-time">{formattedClock}</div>
            <p className="clock-caption">Live local time on this workstation.</p>
          </div>
        </aside>

        <div className="auth-card auth-card-with-sides">
          <div className="auth-brand">
            <h2>Create Account</h2>
            <p>Join Overview and start managing your projects!</p>
          </div>

          {error && (
            <div className="auth-message error">
              {error}
            </div>
          )}

          {success && (
            <div className="auth-message success">
              {success}
            </div>
          )}

          <form className="auth-form" onSubmit={handleSignUp}>
            <div className="form-group">
              <label className="form-label" htmlFor="email">Email Address</label>
              <input 
                id="email"
                className="form-input"
                type="email" 
                placeholder="your.email@example.com" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <input 
                id="password"
                className="form-input"
                type="password" 
                placeholder="Minimum 6 characters" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="confirmPassword">Confirm Password</label>
              <input 
                id="confirmPassword"
                className="form-input"
                type="password" 
                placeholder="Re-enter your password" 
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)} 
                required 
                disabled={loading}
              />
            </div>

            <button 
              className="auth-submit-btn" 
              type="submit"
              disabled={loading}
            >
              {loading ? 'Creating Account...' : 'Sign Up'}
            </button>
          </form>

          <div className="auth-footer">
            <p>Already have an account?</p>
            <button 
              className="auth-link-btn" 
              onClick={() => navigate('/')}
              disabled={loading}
            >
              Login Here
            </button>
          </div>
        </div>

        <aside className="auth-side-panel auth-side-panel-right" aria-label="QR code for phone access">
          <div className="auth-side-panel-card qr-panel">
            <span className="side-panel-label">Scan to open on phone</span>
            <div className="qr-frame">
              <QRCode value={qrTargetUrl} size={184} bgColor="#ffffff" fgColor="#111827" />
            </div>
            <p className="qr-caption">Open the app on your phone using the local network address.</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <code className="qr-url" style={{ flex: 1 }}>{qrTargetUrl}</code>
              <button onClick={() => copyToClipboard(qrTargetUrl)} className="btn btn-primary" style={{ padding: '6px 10px', fontSize: 13 }}>Copy</button>
            </div>
            {qrDebugText && <div className="qr-caption" style={{ color: '#b91c1c', marginTop: 8 }}>{qrDebugText}</div>}
          </div>
        </aside>
      </div>
    </div>
  )
}

export default Signup
