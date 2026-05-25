import React from 'react'
import { useNavigate } from 'react-router-dom'
import './AppHeader.css'

const AppHeader = ({ user }) => {
  const navigate = useNavigate()

  const handleLogout = () => {
    try { localStorage.removeItem('access_token') } catch (e) {}
    // return to login
    navigate('/')
    // reload to ensure in-memory state cleared
    setTimeout(() => window.location.reload(), 50)
  }

  return (
    <header className="app-header card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/Sigla.svg" alt="Sigla" className="app-logo" />
          <div className="avatar">{(user && (user.full_name || user.email) || 'U').charAt(0)}</div>
          <div>
            <div style={{ fontWeight: 700, color: '#111827' }}>{user?.full_name || user?.email || 'Utilizator'}</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>{user?.role || ''}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-outline-primary" onClick={handleLogout}>Log out</button>
        </div>
      </div>
    </header>
  )
}

export default AppHeader
