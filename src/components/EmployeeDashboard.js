import React, { useEffect, useState } from 'react'
import supabase from '../supabase-client'
import TaskExplorer from './TaskExplorer'
import JobExplorer from './JobExplorer'
import './EmployeeDashboard.css'
import './DashboardSidebar.css'
import { useNavigate } from 'react-router-dom'

const CATEGORY_LABELS = {
  cadastru_sporadic:   'Cadastru Sporadic',
  cadastru_sistematic: 'Cadastru Sistematic',
  topografie:          'Topografie',
  administrativ:       'Administrativ',
}

const EmployeeDashboard = () => {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [jobs, setJobs] = useState([])
  const [tasks, setTasks] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  const [activeSection, setActiveSection] = useState('home')
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [selectedJobId, setSelectedJobId] = useState(null)
  const [previousSection, setPreviousSection] = useState('lucrari')

  const [expandedTask, setExpandedTask] = useState(null)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 700 : false)

  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 700)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const getUser = async () => {
      const { data: { user: u } } = await supabase.auth.getUser()
      setUser(u)
      if (u) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('email', u.email).single()
        setUserProfile(profile || { id: u.id, email: u.email, full_name: u.email?.split('@')?.[0] || 'Utilizator', role: 'employee' })
      }
    }
    getUser()
  }, [])

  useEffect(() => {
    if (!userProfile) return
    fetchData()
    const interval = setInterval(fetchData, 2 * 60 * 1000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [jobsRes, tasksRes, profilesRes] = await Promise.all([
        supabase.from('jobs').select('*').order('created_at', { ascending: false }),
        supabase.from('tasks').select('*').order('created_at', { ascending: true }),
        supabase.from('profiles').select('id, email, full_name, role, created_at')
      ])
      if (jobsRes.error) throw jobsRes.error
      if (tasksRes.error) throw tasksRes.error
      if (profilesRes.error) throw profilesRes.error

      const profilesData = profilesRes.data || []
      const allTasks = (tasksRes.data || []).map(t => {
        const assigned = Array.isArray(t.assigned_to) ? t.assigned_to : (t.assigned_to ? [t.assigned_to] : [])
        const assignedEmails = Array.isArray(t.assigned_to_emails)
          ? t.assigned_to_emails
          : assigned.map(pid => (profilesData.find(p => p.id === pid) || {}).email).filter(Boolean)
        return { ...t, assigned_to: assigned, assigned_to_emails: assignedEmails }
      }).sort((a, b) => (a.created_at ? new Date(a.created_at).getTime() : 0) - (b.created_at ? new Date(b.created_at).getTime() : 0))

      const myEmail = userProfile?.email
      const myId = userProfile?.id

      const myRelevantJobIds = [...new Set(
        allTasks
          .filter(t => {
            const assigned = Array.isArray(t.assigned_to) ? t.assigned_to : []
            const emails = Array.isArray(t.assigned_to_emails) ? t.assigned_to_emails : []
            return assigned.includes(myId) || emails.includes(myEmail) || (emails.length === 0 && assigned.length === 0)
          })
          .map(t => t.job_id)
      )]

      const myJobs = (jobsRes.data || []).filter(j => myRelevantJobIds.includes(j.id))
      const myJobTasks = allTasks.filter(t => myRelevantJobIds.includes(t.job_id))
        .sort((a, b) => (a.created_at ? new Date(a.created_at).getTime() : 0) - (b.created_at ? new Date(b.created_at).getTime() : 0))

      setJobs(myJobs)
      setTasks(myJobTasks)
      setProfiles(profilesData)
    } catch (err) {
      setError(err.message || 'Eroare la încărcare date')
    } finally {
      setLoading(false)
    }
  }

  const displayUserLabel = (profile) => {
    if (!profile) return '(Neasignat)'
    return profile.full_name ? `${profile.full_name} (${profile.email})` : profile.email
  }

  const toggleComplete = async (task) => {
    const assignedEmails = Array.isArray(task.assigned_to_emails) ? task.assigned_to_emails : []
    const assignedIds = Array.isArray(task.assigned_to) ? task.assigned_to : []
    const canComplete = assignedEmails.length === 0 || assignedEmails.includes(userProfile?.email) || assignedIds.includes(userProfile?.id)
    if (!canComplete) { setMessage('Nu poți completa acest task — este asignat altcuiva!'); setTimeout(() => setMessage(null), 3000); return }
    if (task.status === 'completed') return
    try {
      setLoading(true)
      const token = localStorage.getItem('access_token')
      const resp = await fetch('/api/tasks/complete', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' }, body: JSON.stringify({ id: task.id }) })
      const body = await resp.json()
      if (!resp.ok) throw new Error(body.error || 'Failed to complete task')
      const updatedTask = body.data
      const updatedTasks = tasks.map(t => t.id === task.id ? updatedTask : t)
        .sort((a, b) => (a.created_at ? new Date(a.created_at).getTime() : 0) - (b.created_at ? new Date(b.created_at).getTime() : 0))
      setTasks(updatedTasks)
      // Refresh job from server — server auto-marks it completed when all tasks done
      try {
        const { data: freshJob } = await supabase.from('jobs').select().eq('id', task.job_id)
        if (freshJob && freshJob[0]) setJobs(prev => prev.map(j => j.id === task.job_id ? { ...j, ...freshJob[0] } : j))
      } catch (e) { console.warn('job refresh failed', e) }
      setMessage('Task completat!'); setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      setError(err.message || 'Eroare la completare task')
    } finally { setLoading(false) }
  }

  const getDaysInMonth = (date) => {
    const year = date.getFullYear(); const month = date.getMonth()
    const firstDay = new Date(year, month, 1); const lastDay = new Date(year, month + 1, 0)
    return { daysInMonth: lastDay.getDate(), startingDayOfWeek: firstDay.getDay(), year, month }
  }

  const calculateEstimatedDate = (hours) => {
    if (!hours || hours <= 0) return null
    let wh = hours; let d = new Date()
    while (wh > 0) { const dow = d.getDay(); if (dow !== 0 && dow !== 6) wh -= 8; if (wh > 0) d.setDate(d.getDate() + 1) }
    return d
  }

  const getTasksForDate = (date) => {
    const ds = date.toISOString().split('T')[0]
    const myEmail = userProfile?.email; const myId = userProfile?.id
    const myTaskIds = new Set(tasks.filter(t => {
      const a = Array.isArray(t.assigned_to) ? t.assigned_to : []
      const ae = Array.isArray(t.assigned_to_emails) ? t.assigned_to_emails : []
      return a.includes(myId) || ae.includes(myEmail)
    }).map(t => t.id))
    return tasks.filter(task => {
      if (!myTaskIds.has(task.id)) return false
      if (task.completed_at && new Date(task.completed_at).toISOString().split('T')[0] === ds) return true
      if (task.deadline && new Date(task.deadline).toISOString().split('T')[0] === ds) return true
      if (task.estimated_hours) { const ed = calculateEstimatedDate(task.estimated_hours); if (ed && ed.toISOString().split('T')[0] === ds) return true }
      return false
    })
  }

  const hasEventsOnDate = (date) => getTasksForDate(date).length > 0

  const handleLogout = () => {
    try { localStorage.removeItem('access_token') } catch (e) {}
    navigate('/'); setTimeout(() => window.location.reload(), 50)
  }

  const activeJobs = jobs.filter(j => j.status !== 'completed')
  const completedJobs = jobs.filter(j => j.status === 'completed')

  const navItem = (section, icon, label, sub = false) => (
    <button
      key={section}
      className={`sidebar-nav-item${activeSection === section || (section !== 'home' && activeSection.startsWith(section + '/') && !sub) ? ' active' : ''}`}
      onClick={() => { setActiveSection(section); setMobileSidebarOpen(false) }}
    >
      <span className="sidebar-nav-icon">{icon}</span>
      <span className="sidebar-nav-label">{label}</span>
    </button>
  )

  const dlBadge = (deadline, compact = false) => {
    if (!deadline) return null
    const d = new Date(deadline), now = new Date()
    const days = Math.ceil((d - now) / 86400000)
    let bg, color, label
    if (days < 0)       { bg = '#fde8e8'; color = '#c62828'; label = compact ? `Expirat ${Math.abs(days)}z` : `⚠ Expirat acum ${Math.abs(days)} ${Math.abs(days)===1?'zi':'zile'}` }
    else if (days === 0){ bg = '#fff3e0'; color = '#e65100'; label = compact ? 'Azi!' : '⏰ Scade azi!' }
    else if (days <= 3) { bg = '#fff3e0'; color = '#e65100'; label = compact ? `${days}z` : `📅 ${d.toLocaleDateString('ro-RO')} (${days} ${days===1?'zi':'zile'})` }
    else if (days <= 7) { bg = '#fffde7'; color = '#f57f17'; label = compact ? `${days}z` : `📅 ${d.toLocaleDateString('ro-RO')} (${days} zile)` }
    else                { bg = '#e8f5e9'; color = '#2e7d32'; label = compact ? d.toLocaleDateString('ro-RO') : `📅 ${d.toLocaleDateString('ro-RO')}` }
    return <span style={{ display:'inline-block', background: bg, color, padding: compact ? '2px 7px' : '3px 9px', borderRadius: 6, fontSize: compact ? 11 : 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>
  }

  const renderHome = () => {
    const myEmail = userProfile?.email; const myId = userProfile?.id
    const myTasksCount = tasks.filter(t => {
      const a = Array.isArray(t.assigned_to) ? t.assigned_to : []
      const ae = Array.isArray(t.assigned_to_emails) ? t.assigned_to_emails : []
      return (a.includes(myId) || ae.includes(myEmail)) && t.status !== 'completed' && jobs.find(j => j.id === t.job_id)?.status !== 'completed'
    }).length
    const items = [
      { section: 'profil', icon: '👤', label: 'Profil', count: myTasksCount },
      { section: 'lucrari', icon: '📁', label: 'Toate Lucrările', count: activeJobs.length },
      { section: 'lucrari/cadastru_sporadic', icon: '📍', label: 'Cadastru Sporadic', count: activeJobs.filter(j => j.category === 'cadastru_sporadic').length },
      { section: 'lucrari/cadastru_sistematic', icon: '🗺️', label: 'Cadastru Sistematic', count: activeJobs.filter(j => j.category === 'cadastru_sistematic').length },
      { section: 'lucrari/topografie', icon: '⛰️', label: 'Topografie', count: activeJobs.filter(j => j.category === 'topografie').length },
      { section: 'lucrari_finalizate', icon: '✅', label: 'Lucrări Finalizate', count: completedJobs.length },
      { section: 'administrativ', icon: '📋', label: 'Administrativ', count: activeJobs.filter(j => j.category === 'administrativ').length },
      { section: 'calendar', icon: '📅', label: 'Calendar', count: null },
    ]
    return (
      <div>
        <p className="home-welcome">Bună ziua, {userProfile?.full_name || user?.email}!</p>
        <p className="home-subtitle">Selectează o secțiune pentru a continua.</p>
        <div className="home-grid">
          {items.map(item => (
            <div key={item.section} className="home-card" onClick={() => setActiveSection(item.section)}>
              <div className="home-card-icon">{item.icon}</div>
              <div className="home-card-label">{item.label}</div>
              {item.count !== null && <div className="home-card-count">{item.count} {item.count === 1 ? 'element' : 'elemente'}</div>}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderProfil = () => {
    const myEmail = userProfile?.email; const myId = userProfile?.id
    const myTasks = tasks.filter(t => {
      const a = Array.isArray(t.assigned_to) ? t.assigned_to : []
      const ae = Array.isArray(t.assigned_to_emails) ? t.assigned_to_emails : []
      return a.includes(myId) || ae.includes(myEmail)
    }).sort((a, b) => {
      if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline)
      if (a.deadline) return -1; if (b.deadline) return 1; return 0
    })
    return (
      <div>
        <div className="section-header"><h2 className="section-title">👤 Profil</h2></div>
        <div className="profile-card">
          <div className="profile-avatar">{(userProfile?.full_name || user?.email || 'A').charAt(0).toUpperCase()}</div>
          <div>
            <div className="profile-name">{userProfile?.full_name || user?.email}</div>
            <div className="profile-email">{user?.email}</div>
            <div className="profile-role">Colaborator</div>
          </div>
        </div>
        <h3 style={{ marginBottom: 12, color: '#333' }}>Taskurile mele ({myTasks.length})</h3>
        <TaskExplorer tasks={myTasks} jobs={jobs} dlBadge={dlBadge} storageKey="profil-employee" onOpen={job => { setPreviousSection('profil'); setSelectedJobId(job.id); setActiveSection('job_detail') }}
          renderActions={task => task.status !== 'completed' && (
            <button onClick={e => { e.stopPropagation(); toggleComplete(task) }} style={{ fontSize: 11, padding: '3px 8px', background: '#4caf50', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap' }}>✅ Finalizez</button>
          )} />
      </div>
    )
  }

  const renderJobList = (filteredJobs) => {
    return (
      <div>
        {filteredJobs.length === 0 && <p style={{ color: '#6b7280', fontSize: 14 }}>Nu sunt lucrări în această categorie.</p>}
        {filteredJobs.map((job, idx) => {
          const jobTasks = tasks.filter(t => t.job_id === job.id)
          const completedCount = jobTasks.filter(t => t.status === 'completed').length
          const myEmail = userProfile?.email; const myId = userProfile?.id
          const myTasksInJob = jobTasks.filter(t => {
            const a = Array.isArray(t.assigned_to) ? t.assigned_to : []
            const ae = Array.isArray(t.assigned_to_emails) ? t.assigned_to_emails : []
            return a.includes(myId) || ae.includes(myEmail) || (a.length === 0 && ae.length === 0)
          })
          const earliestDeadline = myTasksInJob.filter(t => t.deadline && t.status !== 'completed').sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0]
            || jobTasks.filter(t => t.deadline && t.status !== 'completed').sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0]

          return (
            <div
              key={job.id}
              className="job-card"
              onClick={() => { setPreviousSection(activeSection); setSelectedJobId(job.id); setActiveSection('job_detail') }}
              style={{ marginBottom: 10, padding: '14px 16px', border: '1px solid #e5e7eb', borderRadius: 10, background: job.status === 'completed' ? '#f0fdf4' : 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)'; e.currentTarget.style.borderColor = '#93c5fd' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'; e.currentTarget.style.borderColor = '#e5e7eb' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: 15 }}>{idx + 1}. {job.name}</span>
                  <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, color: 'white', background: job.priority === 'urgent' ? '#f44336' : job.priority === 'repede' ? '#ff9800' : '#607d8b' }}>{job.priority || 'normal'}</span>
                  {job.category && <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, color: '#555', background: '#e3f2fd' }}>{CATEGORY_LABELS[job.category] || job.category}</span>}
                  <strong style={{ color: '#333', fontSize: 13 }}>— {job.client_name}</strong>
                </div>
                <div style={{ fontSize: 12, color: '#555', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ color: '#6b7280' }}>{completedCount}/{jobTasks.length} taskuri</span>
                  {myTasksInJob.length > 0 && <span style={{ background: '#e8f5e9', color: '#2e7d32', padding: '2px 7px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>{myTasksInJob.filter(t => t.status !== 'completed').length} taskuri ale mele</span>}
                  {earliestDeadline && dlBadge(earliestDeadline.deadline)}
                </div>
              </div>
              <span style={{ color: '#9ca3af', fontSize: 20, flexShrink: 0 }}>›</span>
            </div>
          )
        })}
      </div>
    )
  }

  const renderJobDetail = () => {
    const job = jobs.find(j => j.id === selectedJobId)
    const myEmail = userProfile?.email; const myId = userProfile?.id
    if (!job) return (
      <div>
        <button onClick={() => setActiveSection(previousSection)} style={{ padding: '7px 14px', background: '#374151', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, marginBottom: 16 }}>← Înapoi</button>
        <p>Lucrarea nu a fost găsită.</p>
      </div>
    )
    const jobTasks = tasks.filter(t => t.job_id === job.id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          <button onClick={() => setActiveSection(previousSection)} style={{ padding: '7px 14px', background: '#374151', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>← Înapoi</button>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>{job.name}</h2>
          <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, color: 'white', background: job.priority === 'urgent' ? '#f44336' : job.priority === 'repede' ? '#ff9800' : '#607d8b' }}>{job.priority || 'normal'}</span>
          {job.status === 'completed' && <span style={{ padding: '3px 8px', borderRadius: 5, fontSize: 11, color: 'white', background: '#4caf50' }}>Finalizat</span>}
        </div>

        <div style={{ background: 'white', borderRadius: 10, padding: 18, border: '1px solid #e5e7eb', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {job.order_number && <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, color: 'white', background: '#2196f3' }}>Nr. {job.order_number}</span>}
            {job.category && <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, color: '#555', background: '#e3f2fd' }}>{CATEGORY_LABELS[job.category] || job.category}</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, fontSize: 13 }}>
            <div><div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>Client</div><div style={{ fontWeight: 600 }}>{job.client_name || 'N/A'}</div></div>
            <div><div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>Email</div><div>{job.client_email || 'N/A'}</div></div>
            <div><div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>Telefon</div><div>{job.client_phone || 'N/A'}</div></div>
            <div><div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>Creat la</div><div>{new Date(job.created_at).toLocaleString('ro-RO')}</div></div>
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: 10, padding: 18, border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, color: '#1a1a2e' }}>Taskuri ({jobTasks.length})</h3>
          {jobTasks.length === 0 && <p style={{ fontSize: 13, color: '#6b7280' }}>Nu sunt taskuri la această lucrare.</p>}
          {jobTasks.map(task => {
            const isTaskExpanded = expandedTask === task.id
            const assignedProfiles = (profiles || []).filter(p => Array.isArray(task.assigned_to) ? task.assigned_to.includes(p.id) : task.assigned_to === p.id)
            const isMyTask = (Array.isArray(task.assigned_to) ? task.assigned_to.includes(myId) : false)
              || (Array.isArray(task.assigned_to_emails) ? task.assigned_to_emails.includes(myEmail) : false)
            const canComplete = isMyTask || (task.assigned_to?.length === 0 && task.assigned_to_emails?.length === 0)
            const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'completed'

            return (
              <div key={task.id} style={{ marginBottom: 8, padding: '10px 12px', border: `1px solid ${isMyTask ? '#a5d6a7' : '#e5e7eb'}`, borderRadius: 7, background: task.status === 'completed' ? '#f0fdf4' : (isOverdue ? '#fff8f8' : 'white') }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 14 }}>{task.name}</strong>
                      {isMyTask && <span style={{ fontSize: 10, background: '#e8f5e9', color: '#2e7d32', padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>al meu</span>}
                      {isOverdue && <span style={{ fontSize: 10, background: '#ffebee', color: '#c62828', padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>depășit</span>}
                      <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: task.status === 'completed' ? '#e8f5e9' : task.status === 'stand_by' ? '#e3f2fd' : '#fff3e0', color: task.status === 'completed' ? '#2e7d32' : task.status === 'stand_by' ? '#1565c0' : '#e65100', fontWeight: 600 }}>{task.status === 'completed' ? 'Finalizat' : task.status === 'stand_by' ? 'Stand By' : 'În lucru'}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                      <span>Asignat: {assignedProfiles.length > 0 ? assignedProfiles.map(p => displayUserLabel(p)).join(', ') : '(Toată echipa)'}</span>
                      {task.value != null && <span> | 💰 {parseFloat(task.value).toFixed(2)} lei</span>}
                      {task.deadline && <span style={{ marginLeft: 6 }}>{dlBadge(task.deadline, true)}</span>}
                    </div>
                    {task.description && <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>{task.description}</div>}
                    {isTaskExpanded && (
                      <div style={{ marginTop: 8, fontSize: 12, color: '#555', paddingTop: 8, borderTop: '1px solid #eee' }}>
                        {task.deadline && <div>Deadline: {new Date(task.deadline).toLocaleString('ro-RO')}</div>}
                        {task.completed_at && <div style={{ marginTop: 4 }}>Finalizat la: {new Date(task.completed_at).toLocaleString('ro-RO')}</div>}
                        {(Array.isArray(task.completers) && task.completers.length > 0) && <div style={{ marginTop: 4 }}>Finalizat de: {task.completers.map((c, i) => { const p = (profiles || []).find(p => p.id === c.id || (c.email && p.email && p.email.toLowerCase() === c.email.toLowerCase())); const l = p ? displayUserLabel(p) : (c.email || c.id); return `${l}${c.amount != null ? ` (${parseFloat(c.amount).toFixed(2)} lei)` : ''}${i < task.completers.length - 1 ? ', ' : ''}` }).join('')}</div>}
                        <div style={{ marginTop: 4 }}>Creat la: {new Date(task.created_at).toLocaleString('ro-RO')}</div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
                    <button onClick={() => setExpandedTask(isTaskExpanded ? null : task.id)} style={{ fontSize: 11, padding: '4px 8px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 5, cursor: 'pointer', color: '#374151' }}>{isTaskExpanded ? '▲' : '▼'}</button>
                    {canComplete && task.status !== 'completed' && (
                      <button onClick={() => toggleComplete(task)} style={{ fontSize: 11, padding: '4px 10px', background: '#4caf50', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}>✅ Finalizez</button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderSection = (filteredJobs, title, icon) => (
    <div>
      <div className="section-header"><h2 className="section-title">{icon} {title} <span style={{ fontSize: 14, fontWeight: 400, color: '#777' }}>({filteredJobs.filter(j => j.status !== 'completed').length} în lucru)</span></h2></div>
      <JobExplorer jobs={filteredJobs} tasks={tasks} dlBadge={dlBadge} storageKey={`jobs-employee-${title}`} onOpen={job => { setPreviousSection(activeSection); setSelectedJobId(job.id); setActiveSection('job_detail') }} renderCards={rows => renderJobList(rows)} />
    </div>
  )

  const renderCalendar = () => {
    const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentMonth)
    const monthNames = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']
    const dayNames = ['Dum','Lun','Mar','Mie','Joi','Vin','Sâm']
    const days = []
    for (let i = 0; i < startingDayOfWeek; i++) days.push(<div key={`e-${i}`} style={{ padding: 8 }} />)
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day)
      const hasEvents = hasEventsOnDate(date)
      const isToday = new Date().toDateString() === date.toDateString()
      const isSelected = selectedDate && selectedDate.toDateString() === date.toDateString()
      days.push(
        <div key={day} onClick={() => setSelectedDate(date)} style={{ padding: 12, textAlign: 'center', cursor: 'pointer', background: isSelected ? '#2196f3' : isToday ? '#e3f2fd' : hasEvents ? '#fff3e0' : 'transparent', color: isSelected ? 'white' : isToday ? '#1565c0' : 'black', fontWeight: isToday || hasEvents ? 700 : 400, borderRadius: 7, border: hasEvents ? '2px solid #ff9800' : isToday ? '2px solid #2196f3' : '1px solid #eee', position: 'relative', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
          {day}
          {hasEvents && !isSelected && <div style={{ position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)', width: 6, height: 6, background: '#ff9800', borderRadius: '50%' }} />}
        </div>
      )
    }
    return (
      <div>
        <div className="section-header"><h2 className="section-title">📅 Calendar</h2></div>
        <div className="calendar-inline">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <button onClick={() => setCurrentMonth(prev => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d })} style={{ padding: '7px 14px', border: 'none', borderRadius: 6, cursor: 'pointer', background: '#374151', color: '#fff', fontWeight: 600 }}>◀ Prev</button>
            <h3 style={{ margin: 0, color: '#2196f3' }}>{monthNames[month]} {year}</h3>
            <button onClick={() => setCurrentMonth(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d })} style={{ padding: '7px 14px', border: 'none', borderRadius: 6, cursor: 'pointer', background: '#374151', color: '#fff', fontWeight: 600 }}>Next ▶</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 8 }}>
            {dayNames.map(n => <div key={n} style={{ textAlign: 'center', fontWeight: 700, fontSize: 12, padding: 6, color: '#777' }}>{n}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>{days}</div>
          {selectedDate && (
            <div style={{ marginTop: 20, borderTop: '2px solid #eee', paddingTop: 16 }}>
              <h4 style={{ margin: '0 0 10px', color: '#2196f3' }}>📅 {selectedDate.toLocaleDateString('ro-RO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h4>
              {getTasksForDate(selectedDate).length > 0
                ? <div>{getTasksForDate(selectedDate).map(t => { const j = jobs.find(jj => jj.id === t.job_id); return <div key={t.id} style={{ fontSize: 13, marginLeft: 12, padding: '5px 8px', background: t.status === 'completed' ? '#e8f5e9' : t.status === 'stand_by' ? '#e3f2fd' : '#fff3e0', borderRadius: 5, marginTop: 4 }}>• {t.name} {j && `(${j.name})`} - <strong>{t.status === 'completed' ? 'Finalizat' : t.status === 'stand_by' ? 'Stand By' : 'În lucru'}</strong></div> })}</div>
                : <p style={{ color: '#6b7280', fontStyle: 'italic', fontSize: 13 }}>Nu sunt taskuri asignate în această zi.</p>
              }
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <div className="sidebar-logo" onClick={() => setActiveSection('home')} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && setActiveSection('home')}>
          <img src="/Sigla.svg" alt="Overview" />
          <span className="sidebar-logo-text">Overview</span>
        </div>

        <nav className={`sidebar-nav${mobileSidebarOpen ? ' mobile-open' : ''}`}>
          {navItem('home', '🏠', 'Acasă')}
          {navItem('profil', '👤', 'Profil')}
          <div>
            {navItem('lucrari', '📁', 'Lucrări')}
            <div className="sidebar-subnav">
              {navItem('lucrari/cadastru_sporadic', '📍', 'Cadastru Sporadic', true)}
              {navItem('lucrari/cadastru_sistematic', '🗺️', 'Cadastru Sistematic', true)}
              {navItem('lucrari/topografie', '⛰️', 'Topografie', true)}
              {navItem('administrativ', '📋', 'Administrativ', true)}
            </div>
          </div>
          {navItem('lucrari_finalizate', '✅', 'Lucrări Finalizate')}
          {navItem('calendar', '📅', 'Calendar')}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user-name">{userProfile?.full_name || user?.email || 'Utilizator'}</div>
          <div className="sidebar-user-role">Colaborator</div>
          <button className="sidebar-logout-btn" onClick={handleLogout}>🚪 Ieși din cont</button>
        </div>
      </aside>

      <main className="app-main">
        {loading && <div style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>Se încarcă...</div>}
        {error && <div className="dash-alert dash-alert-error">{error}<button onClick={() => setError(null)}>✕</button></div>}
        {message && <div className="dash-alert dash-alert-success">{message}<button onClick={() => setMessage(null)}>✕</button></div>}

        {activeSection === 'home' && renderHome()}
        {activeSection === 'profil' && renderProfil()}
        {activeSection === 'lucrari' && renderSection(jobs, 'Toate Lucrările', '📁')}
        {activeSection === 'lucrari/cadastru_sporadic' && renderSection(jobs.filter(j => j.category === 'cadastru_sporadic'), 'Cadastru Sporadic', '📍')}
        {activeSection === 'lucrari/cadastru_sistematic' && renderSection(jobs.filter(j => j.category === 'cadastru_sistematic'), 'Cadastru Sistematic', '🗺️')}
        {activeSection === 'lucrari/topografie' && renderSection(jobs.filter(j => j.category === 'topografie'), 'Topografie', '⛰️')}
        {activeSection === 'lucrari_finalizate' && (
          <div>
            <div className="section-header"><h2 className="section-title">✅ Lucrări Finalizate <span style={{ fontSize: 14, fontWeight: 400, color: '#777' }}>({completedJobs.length})</span></h2></div>
            <JobExplorer jobs={jobs} tasks={tasks} dlBadge={dlBadge} storageKey={"jobs-employee-finalizate"} onOpen={job => { setPreviousSection(activeSection); setSelectedJobId(job.id); setActiveSection('job_detail') }} renderCards={rows => renderJobList(rows)} defaultStatus="completed" />
          </div>
        )}
        {activeSection === 'administrativ' && renderSection(jobs.filter(j => j.category === 'administrativ'), 'Administrativ', '📋')}
        {activeSection === 'calendar' && renderCalendar()}
        {activeSection === 'job_detail' && renderJobDetail()}
      </main>

      <button className="sidebar-mobile-toggle" onClick={() => setMobileSidebarOpen(s => !s)} style={{ display: isMobile ? 'flex' : 'none' }}>☰</button>
    </div>
  )
}

export default EmployeeDashboard
