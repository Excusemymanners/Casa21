import React from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'react-qr-code'
import './Minimal.css'

const Login = () => {
  const navigate = useNavigate()
  const [currentTime, setCurrentTime] = React.useState(new Date())
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [locked, setLocked] = React.useState(false)
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
    const electronUrl = window.electron && typeof window.electron.getLocalNetworkUrl === 'function'
      ? window.electron.getLocalNetworkUrl(3000, '/#/')
      : null

    if (electronUrl) return electronUrl

    if (localIp) {
      return `http://${localIp}:3000/#/`
    }

    const host = window.location.host || 'localhost:3000'

    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      return `http://192.168.1.128:3000/#/`
    }

    return `http://${host}/#/`
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
      setError(null)
      // small visual feedback via alert for now
      alert('Link copiat în clipboard')
    } catch (e) {
      alert('Nu am putut copia linkul')
    }
  }

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

  const handleLogin = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // check locked state for this email
    try {
      const attemptsJson = localStorage.getItem('loginAttempts') || '{}'
      const attempts = JSON.parse(attemptsJson || '{}')
      const count = attempts[email?.toLowerCase()] || 0
      if (count >= 3) {
        setLocked(true)
        setError('Contul blocat local: contactează CEO sau Admin pentru resetare parolă.')
        setLoading(false)
        return
      }
    } catch (err) {
      // ignore parse errors
    }

    try {
      // Call new serverless login endpoint
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const body = await resp.json()
      if (!resp.ok) throw new Error(body.error || 'Login failed')

      // Save token and user
      if (body.access_token) localStorage.setItem('access_token', body.access_token)
      const user = body.user
      if (!user) throw new Error('Missing user data')
      // on success, reset local attempt counter for this email
      try {
        const attemptsJson = localStorage.getItem('loginAttempts') || '{}'
        const attempts = JSON.parse(attemptsJson || '{}')
        delete attempts[email?.toLowerCase()]
        localStorage.setItem('loginAttempts', JSON.stringify(attempts))
      } catch (e) {}
      if (user.role === 'ceo') navigate('/CEODashboard')
      else if (user.role === 'admin') navigate('/AdminDashboard')
      else if (user.role === 'employee') navigate('/EmployeeDashboard')
      else navigate('/')
    } catch (err) {
      setError(err.message || 'Failed to login')
      // increment local attempts counter for this email
      try {
        const key = email?.toLowerCase()
        if (key) {
          const attemptsJson = localStorage.getItem('loginAttempts') || '{}'
          const attempts = JSON.parse(attemptsJson || '{}')
          attempts[key] = (attempts[key] || 0) + 1
          localStorage.setItem('loginAttempts', JSON.stringify(attempts))
          if (attempts[key] >= 3) {
            setLocked(true)
            setError('Ai introdus parola greșit de 3 ori. Contactează CEO sau Admin pentru resetare parolă.')
          }
        }
      } catch (e) {
        console.warn('Failed to update login attempts', e)
      }
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
            <img src="/Sigla.svg" alt="Sigla" className="auth-brand-icon" />
            <h2>Welcome Back</h2>
            <p>Log in to continue managing your projects</p>
          </div>

          {error && <div className="auth-message error">{error}</div>}

          <form className="auth-form" onSubmit={handleLogin}>
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
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <button className="auth-submit-btn" type="submit" disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <div className="auth-footer">
            <p>Don't have an account?</p>
            <button className="auth-link-btn" onClick={() => navigate('/Signup')} disabled={loading}>
              Create Account
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
            <code className="qr-url">{qrTargetUrl}</code>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default Login
