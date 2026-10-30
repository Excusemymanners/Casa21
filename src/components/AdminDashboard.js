import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import supabase from '../supabase-client'
import TaskExplorer from './TaskExplorer'
import JobExplorer from './JobExplorer'
import { buildMonthlyReportData, generateMonthlyReportCsv, downloadCsv, isCreditedTo, shareFor, doneDateFor } from '../utils/generateMonthlyReportCsv'
import './AdminDashboard.css'
import './DashboardSidebar.css'

const CATEGORY_LABELS = {
  cadastru_sporadic:   'Cadastru Sporadic',
  cadastru_sistematic: 'Cadastru Sistematic',
  topografie:          'Topografie',
  administrativ:       'Administrativ',
}

const JOB_NAME_OPTIONS = [
  'Actualizare Date',
  'Prima Înregistrare',
  'Aviz OCPI',
  'Dezmembrare/Alipire',
  'Îndreptare Eroare Materiale',
  'Identificare Top/CF',
  'Cadastru Sistematic',
  'Cerere BCPI',
  'Altele',
]

const AdminDashboard = () => {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [jobs, setJobs] = useState([])
  const [tasks, setTasks] = useState([])
  const [profiles, setProfiles] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  const [activeSection, setActiveSection] = useState('home')
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const [showCreateWithTasks, setShowCreateWithTasks] = useState(false)
  const [jobNameType, setJobNameType] = useState('')
  const [jobNameCustom, setJobNameCustom] = useState('')
  const [clientname, setClientname] = useState('')
  const [clientemail, setClientemail] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [jobPriority, setJobPriority] = useState('normal')
  const [jobOrderNumber, setJobOrderNumber] = useState('')
  const [clientIdSeries, setClientIdSeries] = useState('')
  const [clientCNP, setClientCNP] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [jobCategory, setJobCategory] = useState('')
  const [jobResponsible, setJobResponsible] = useState('')
  const [newJobTasks, setNewJobTasks] = useState([{ name: '', description: '', assigned_to: [], estimated_hours: '', value: '', deadline: '', noDeadline: false }])

  const [selectedJobId, setSelectedJobId] = useState(null)
  const [previousSection, setPreviousSection] = useState('lucrari')
  const [expandedJob, setExpandedJob] = useState(null)
  const [editingJobId, setEditingJobId] = useState(null)
  const [jobEdits, setJobEdits] = useState({})
  const [expandedTask, setExpandedTask] = useState(null)
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [taskEdits, setTaskEdits] = useState({})
  const [overflowTask, setOverflowTask] = useState(null)
  const [taskMenuOpen, setTaskMenuOpen] = useState(null)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 700 : false)
  const [addingTaskToJob, setAddingTaskToJob] = useState(null)
  const [newTaskData, setNewTaskData] = useState({ name: '', description: '', assigned_to: [], estimated_hours: '', value: '', deadline: '', noDeadline: false })
  const [amountPaidDraft, setAmountPaidDraft] = useState({})
  const [taskDrafts, setTaskDrafts] = useState({})
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedEmployees, setExpandedEmployees] = useState(new Set())
  const [dragOverTaskId, setDragOverTaskId] = useState(null)
  const [dragOverJobId, setDragOverJobId] = useState(null)
  const dragTaskRef = useRef(null)
  const dragJobRef = useRef(null)

  const [editingProfileId, setEditingProfileId] = useState(null)
  const [profileEdits, setProfileEdits] = useState({})
  const [showCreateProfile, setShowCreateProfile] = useState(false)
  const [newProfileData, setNewProfileData] = useState({ email: '', password: '', confirmPassword: '', full_name: '', role: 'employee' })

  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [reportMonth, setReportMonth] = useState(new Date())

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 700)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const getUser = async () => {
      const { data: { user: u } } = await supabase.auth.getUser()
      setUser(u)
    }
    getUser()
    fetchData()
    const interval = setInterval(fetchData, 2 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [jobsRes, tasksRes, profilesRes, usersRes] = await Promise.all([
        supabase.from('jobs').select('*').order('created_at', { ascending: false }),
        supabase.from('tasks').select('*').order('created_at', { ascending: true }),
        supabase.from('profiles').select('id, email, full_name, role, created_at'),
        fetch('/api/users').then(async r => {
          if (!r.ok) return { data: [], error: new Error('Failed') }
          const b = await r.json()
          return { data: b.users || [], error: null }
        })
      ])
      if (jobsRes.error) throw jobsRes.error
      if (tasksRes.error) throw tasksRes.error
      if (profilesRes.error) throw profilesRes.error

      const profilesData = profilesRes.data || []
      const tasksNormalized = (tasksRes.data || []).map(t => {
        let assigned = []
        if (Array.isArray(t.assigned_to)) assigned = t.assigned_to
        else if (t.assigned_to) assigned = [t.assigned_to]
        const assignedEmails = Array.isArray(t.assigned_to_emails)
          ? t.assigned_to_emails
          : assigned.map(pid => (profilesData.find(p => p.id === pid) || {}).email).filter(Boolean)
        return { ...t, assigned_to: assigned, assigned_to_emails: assignedEmails }
      })

      setJobs(jobsRes.data || [])
      setTasks(tasksNormalized)
      setProfiles(profilesData)
      setUsers(usersRes.data || [])
    } catch (err) {
      setError(err.message || 'Eroare la încărcare date')
    } finally {
      setLoading(false)
    }
  }

  const fetchProfiles = async () => {
    setLoading(true)
    try {
      const { data, error: err } = await supabase.from('profiles').select('id, email, full_name, role, created_at')
      if (err) throw err
      setProfiles(data || [])
      setMessage('Profile reîmprospătate!'); setTimeout(() => setMessage(null), 2000)
    } catch (err) {
      setError(err.message || 'Eroare la încărcare profile')
    } finally { setLoading(false) }
  }

  const recalcJobTotal = async (jobId) => {
    try {
      const { data: jobTasks } = await supabase.from('tasks').select('value').eq('job_id', jobId)
      const total = (jobTasks || []).reduce((s, t) => s + (parseFloat(t.value) || 0), 0)
      await supabase.from('jobs').update({ total_value: total }).eq('id', jobId)
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, total_value: total } : j))
    } catch (err) { console.error('recalcJobTotal', err) }
  }

  const displayUserLabel = (profile) => {
    if (!profile) return '(Neasignat)'
    return profile.full_name ? `${profile.full_name} (${profile.email})` : profile.email
  }

  const resolveUserLabel = (idOrEmail) => {
    if (!idOrEmail) return null
    const byProfile = (profiles || []).find(p => p.id === idOrEmail || p.email === idOrEmail)
    if (byProfile) return displayUserLabel(byProfile)
    const byUser = (users || []).find(u => u.id === idOrEmail || u.email === idOrEmail)
    if (byUser) return byUser.full_name ? `${byUser.full_name} (${byUser.email})` : byUser.email
    return String(idOrEmail)
  }

  const formatEstimatedDate = (hours) => {
    if (!hours || hours <= 0) return ''
    let wh = hours; let d = new Date()
    while (wh > 0) { const dow = d.getDay(); if (dow !== 0 && dow !== 6) wh -= 8; if (wh > 0) d.setDate(d.getDate() + 1) }
    return d.toLocaleDateString('ro-RO', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  const responsibleName = (id) => {
    if (!id) return null
    const p = (profiles || []).find(p => p.id === id)
    return p ? (p.full_name || p.email) : null
  }

  const MultiAssignSelector = ({ profiles, selectedIds = [], onChange }) => {
    const ids = Array.isArray(selectedIds) ? selectedIds : []
    const selectedProfiles = (profiles || []).filter(p => ids.includes(p.id))
    const availableProfiles = (profiles || []).filter(p => !ids.includes(p.id))
    const add = (id) => { if (!id) return; onChange([...ids, id]) }
    const remove = (id) => onChange(ids.filter(sid => sid !== id))
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <select onChange={e => { add(e.target.value); e.target.value = '' }} defaultValue="" style={{ padding: '6px 9px', borderRadius: 5, border: '1px solid #ccc', fontSize: 13, background: 'white' }}>
          <option value="">-- Alege colaborator</option>
          {availableProfiles.map(p => <option key={p.id} value={p.id}>{displayUserLabel(p)}</option>)}
        </select>
        {selectedProfiles.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {selectedProfiles.map(p => (
              <span key={p.id} style={{ background: '#e3f2fd', color: '#1565c0', padding: '3px 8px', borderRadius: 12, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                {p.full_name || p.email}
                <button type="button" onClick={() => remove(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1565c0', fontSize: 15, padding: '0 1px', lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }

  const downloadPdfForJob = async (job) => {
    try {
      const jobTasks = tasks.filter(t => t.job_id === job.id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      const totalValue = job.total_value != null ? parseFloat(job.total_value) : jobTasks.reduce((s, t) => s + (parseFloat(t.value) || 0), 0)
      const norm = v => { if (v == null) return null; if (typeof v === 'object') return v.order_number ?? v.value ?? v.id ?? String(v); return v }
      const pdfData = {
        template: 'blank', clientName: job.client_name, clientCNP: job.client_cnp || null,
        clientSeries: job.client_id_series || null, clientAddress: job.client_address || null, clientEmail: job.client_email || null,
        jobName: job.name, tasks: jobTasks, totalValue, completedAt: job.completed_at || new Date().toISOString(),
        receptionNumber: job.reception_number || null, orderNumber: norm(job.order_number), users, asciiFallback: true
      }
      const { generateAndDownloadPdf } = await import('../utils/generatePdfClient')
      const res = await generateAndDownloadPdf(pdfData)
      if (!res || !res.ok) setError(res?.error || 'Eroare generare PDF')
    } catch (err) { setError(err.message || 'Eroare la descărcare PDF') }
  }

  const handleCreateJob = async (e) => {
    e.preventDefault()
    const invalidTask = newJobTasks.filter(t => t.name?.trim()).find(t => !t.noDeadline && !t.deadline)
    if (invalidTask) { setError(`Task "${invalidTask.name}": setează un deadline sau bifează "Fără termen".`); return }
    const finalJobName = jobNameType === 'Altele' ? jobNameCustom.trim() : jobNameType
    if (!finalJobName) { setError('Selectează tipul lucrării.'); return }
    setLoading(true); setError(null)
    try {
      const catValue = jobCategory || null
      const jobPayload = {
        name: finalJobName, priority: jobPriority || 'normal', client_name: clientname || '',
        client_phone: clientPhone || null, client_id_series: clientIdSeries || null,
        client_cnp: clientCNP || null, client_address: clientAddress || null,
        client_email: clientemail || null, status: 'todo', created_by: user?.id || null,
        total_value: 0, order_number: jobOrderNumber ? parseInt(jobOrderNumber, 10) : null,
        category: catValue, responsible_id: jobResponsible || null
      }
      let newJobData
      try {
        const { data: d, error: e } = await supabase.from('jobs').insert([jobPayload]).select()
        if (e) throw e; newJobData = d
      } catch (err) {
        if (err?.message?.includes('category')) {
          const { category: _, ...payloadNoCat } = jobPayload
          const { data: d2, error: e2 } = await supabase.from('jobs').insert([payloadNoCat]).select()
          if (e2) throw e2; newJobData = d2
        } else throw err
      }
      const jobId = newJobData[0].id
      const filteredTasks = newJobTasks.filter(t => t.name?.trim())
      const base = Date.now()
      const tasksToInsert = filteredTasks.map((t, i) => ({
        job_id: jobId, name: t.name, description: t.description || null, status: 'todo',
        assigned_to: Array.isArray(t.assigned_to) ? t.assigned_to : (t.assigned_to ? [t.assigned_to] : []),
        assigned_to_emails: null,
        value: t.value ? parseFloat(t.value) : null,
        deadline: t.noDeadline ? null : (t.deadline ? new Date(t.deadline).toISOString() : null),
        created_by: user?.id || null, created_at: new Date(base + i).toISOString()
      }))
      const tryInsertTasks = async (rows) => {
        try {
          const { data: d, error: e } = await supabase.from('tasks').insert(rows).select()
          if (e) throw e; return d
        } catch (err) {
          if (err?.message?.includes('invalid input syntax for type uuid')) {
            const t2 = rows.map(r => ({ ...r, assigned_to: Array.isArray(r.assigned_to) && r.assigned_to.length > 0 ? r.assigned_to[0] : r.assigned_to }))
            const { data: d2, error: e2 } = await supabase.from('tasks').insert(t2).select()
            if (e2) throw e2; return d2
          }
          throw err
        }
      }
      if (tasksToInsert.length > 0) await tryInsertTasks(tasksToInsert)
      const sumTasks = tasksToInsert.reduce((s, t) => s + (parseFloat(t.value) || 0), 0)
      if (sumTasks > 0) await supabase.from('jobs').update({ total_value: sumTasks }).eq('id', jobId)

      setJobNameType(''); setJobNameCustom(''); setClientname(''); setJobPriority('normal'); setClientIdSeries(''); setClientCNP(''); setClientAddress('')
      setClientemail(''); setClientPhone(''); setJobOrderNumber(''); setJobCategory(''); setJobResponsible('')
      setNewJobTasks([{ name: '', description: '', assigned_to: [], estimated_hours: '', value: '', deadline: '', noDeadline: false }])
      setShowCreateWithTasks(false)
      setMessage('Job și taskuri create!'); setTimeout(() => setMessage(null), 3000)
      fetchData()
    } catch (err) { setError(err.message || 'Eroare la creare job') } finally { setLoading(false) }
  }

  const updateNewJobTaskField = (idx, field, value) => setNewJobTasks(prev => { const c = [...prev]; c[idx][field] = value; return c })
  const addNewJobTask = () => setNewJobTasks(prev => [...prev, { name: '', description: '', assigned_to: [], estimated_hours: '', value: '', deadline: '', noDeadline: false }])
  const removeNewJobTask = (idx) => setNewJobTasks(prev => prev.filter((_, i) => i !== idx))

  const startEditJob = (job) => {
    setEditingJobId(job.id)
    const namedOptions = JOB_NAME_OPTIONS.filter(o => o !== 'Altele')
    const nameType = namedOptions.includes(job.name) ? job.name : 'Altele'
    const nameCustom = nameType === 'Altele' ? job.name : ''
    setJobEdits({ nameType, nameCustom, priority: job.priority || 'normal', client_name: job.client_name, client_phone: job.client_phone || '', client_id_series: job.client_id_series || '', client_cnp: job.client_cnp || '', client_address: job.client_address || '', client_email: job.client_email || '', status: job.status, total_value: job.total_value ?? '', amount_paid: job.amount_paid ?? '', order_number: job.order_number ?? '', category: job.category || '', responsible_id: job.responsible_id || '' })
    const jobTasks = tasks.filter(t => t.job_id === job.id)
    const drafts = {}
    jobTasks.forEach(t => {
      drafts[t.id] = { name: t.name, description: t.description || '', status: t.status, assigned_to: Array.isArray(t.assigned_to) ? t.assigned_to : (t.assigned_to ? [t.assigned_to] : []), value: t.value || '', deadline: t.deadline || '' }
    })
    setTaskDrafts(drafts)
  }
  const cancelEditJob = () => { setEditingJobId(null); setJobEdits({}); setTaskDrafts({}) }

  const saveJob = async (jobId) => {
    setLoading(true); setError(null)
    try {
      const updates = {}; const f = jobEdits
      if (f.nameType !== undefined) updates.name = f.nameType === 'Altele' ? (f.nameCustom || '').trim() : f.nameType
      if (f.client_name !== undefined) updates.client_name = f.client_name
      if (f.client_email !== undefined) updates.client_email = f.client_email || null
      if (f.client_phone !== undefined) updates.client_phone = f.client_phone || null
      if (f.status !== undefined) updates.status = f.status
      if (f.total_value !== undefined) updates.total_value = f.total_value !== '' ? parseFloat(f.total_value) : null
      if (f.amount_paid !== undefined) updates.amount_paid = f.amount_paid !== '' ? parseFloat(f.amount_paid) : 0
      if (f.order_number !== undefined) updates.order_number = f.order_number !== '' ? parseInt(f.order_number, 10) : null
      if (f.priority !== undefined) updates.priority = f.priority || 'normal'
      if (f.client_id_series !== undefined) updates.client_id_series = f.client_id_series || null
      if (f.client_cnp !== undefined) updates.client_cnp = f.client_cnp || null
      if (f.client_address !== undefined) updates.client_address = f.client_address || null
      if (f.category !== undefined) updates.category = f.category || null
      if (f.responsible_id !== undefined) updates.responsible_id = f.responsible_id || null

      const { data, error: updErr } = await supabase.from('jobs').update(updates).eq('id', jobId).select()
      if (updErr) throw updErr
      setJobs(prev => prev.map(j => j.id === jobId ? data[0] : j))
      setEditingJobId(null); setJobEdits({}); setTaskDrafts({})
      setMessage('Job actualizat!'); setTimeout(() => setMessage(null), 3000)
    } catch (err) { setError(err.message || 'Eroare la actualizare job') } finally { setLoading(false) }
  }

  const saveJobAndTasks = async (jobId) => {
    setLoading(true); setError(null)
    try {
      const f = jobEdits
      const jobUpdates = {}
      if (f.nameType !== undefined) jobUpdates.name = f.nameType === 'Altele' ? (f.nameCustom || '').trim() : f.nameType
      if (f.client_name !== undefined) jobUpdates.client_name = f.client_name
      if (f.client_email !== undefined) jobUpdates.client_email = f.client_email || null
      if (f.client_phone !== undefined) jobUpdates.client_phone = f.client_phone || null
      if (f.status !== undefined) jobUpdates.status = f.status
      if (f.amount_paid !== undefined) jobUpdates.amount_paid = f.amount_paid !== '' ? parseFloat(f.amount_paid) : 0
      if (f.order_number !== undefined) jobUpdates.order_number = f.order_number !== '' ? parseInt(f.order_number, 10) : null
      if (f.priority !== undefined) jobUpdates.priority = f.priority || 'normal'
      if (f.client_id_series !== undefined) jobUpdates.client_id_series = f.client_id_series || null
      if (f.client_cnp !== undefined) jobUpdates.client_cnp = f.client_cnp || null
      if (f.client_address !== undefined) jobUpdates.client_address = f.client_address || null
      if (f.category !== undefined) jobUpdates.category = f.category || null
      if (f.responsible_id !== undefined) jobUpdates.responsible_id = f.responsible_id || null
      const { data: jobData, error: jobErr } = await supabase.from('jobs').update(jobUpdates).eq('id', jobId).select()
      if (jobErr) throw jobErr
      setJobs(prev => prev.map(j => j.id === jobId ? jobData[0] : j))

      for (const [taskId, draft] of Object.entries(taskDrafts)) {
        const assigned = Array.isArray(draft.assigned_to) ? (draft.assigned_to.length > 0 ? draft.assigned_to : null) : null
        const taskUpdates = {
          name: draft.name,
          description: draft.description || null,
          status: draft.status,
          assigned_to: assigned,
          assigned_to_emails: assigned?.length > 0 ? assigned.map(id => profiles.find(p => p.id === id)?.email).filter(Boolean) : null,
          value: draft.value ? parseFloat(draft.value) : null,
          deadline: draft.deadline ? new Date(draft.deadline).toISOString() : null,
        }
        try {
          const { data: td, error: te } = await supabase.from('tasks').update(taskUpdates).eq('id', taskId).select()
          if (te) throw te
          setTasks(prev => prev.map(t => t.id === taskId ? { ...td[0], assigned_to: Array.isArray(td[0].assigned_to) ? td[0].assigned_to : (td[0].assigned_to ? [td[0].assigned_to] : []), assigned_to_emails: Array.isArray(td[0].assigned_to_emails) ? td[0].assigned_to_emails : [] } : t))
        } catch (te) {
          if (te?.message?.includes('invalid input syntax for type uuid')) {
            const bc = { ...taskUpdates, assigned_to: assigned?.length > 0 ? assigned[0] : null }
            const { data: td2, error: te2 } = await supabase.from('tasks').update(bc).eq('id', taskId).select()
            if (te2) throw te2
            setTasks(prev => prev.map(t => t.id === taskId ? { ...td2[0], assigned_to: Array.isArray(td2[0].assigned_to) ? td2[0].assigned_to : (td2[0].assigned_to ? [td2[0].assigned_to] : []), assigned_to_emails: Array.isArray(td2[0].assigned_to_emails) ? td2[0].assigned_to_emails : [] } : t))
          } else throw te
        }
      }
      // Valoarea totală = suma valorilor taskurilor (după salvarea taskurilor)
      await recalcJobTotal(jobId)
      setEditingJobId(null); setJobEdits({}); setTaskDrafts({})
      setMessage('Lucrare și taskuri salvate!'); setTimeout(() => setMessage(null), 3000)
    } catch (err) { setError(err.message || 'Eroare la salvare') } finally { setLoading(false) }
  }

  const deleteJob = async (jobId) => {
    if (!window.confirm('Ștergi job-ul? Toate taskurile vor fi șterse!')) return
    setLoading(true); setError(null)
    try {
      await supabase.from('tasks').delete().eq('job_id', jobId)
      const { error: e } = await supabase.from('jobs').delete().eq('id', jobId); if (e) throw e
      setJobs(prev => prev.filter(j => j.id !== jobId))
      setTasks(prev => prev.filter(t => t.job_id !== jobId))
      if (activeSection === 'job_detail') setActiveSection(previousSection)
      setMessage('Job șters!'); setTimeout(() => setMessage(null), 3000)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  const duplicateJob = async (job) => {
    setLoading(true); setError(null)
    try {
      const { order_number, completed_at, amount_paid, status, id, created_at, updated_at, ...rest } = job
      const newJob = { ...rest, name: `${job.name} (copie)`, status: 'todo', amount_paid: 0, total_value: 0, order_number: null, completed_at: null }
      const { data: newJobData, error: je } = await supabase.from('jobs').insert([newJob]).select()
      if (je) throw je
      const newJobId = newJobData[0].id
      const srcTasks = tasks.filter(t => t.job_id === job.id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      const base = Date.now()
      const tasksCopy = srcTasks.map((t, i) => {
        const { id: _id, job_id: _jid, created_at: _ca, updated_at: _ua, completed_at: _ta, completed_by: _cb, completed_by_email: _cbe, completers: _compl, ...tRest } = t
        return { ...tRest, job_id: newJobId, status: 'todo', completed_at: null, completed_by: null, completed_by_email: null, completers: [], created_at: new Date(base + i).toISOString() }
      })
      if (tasksCopy.length > 0) {
        const { error: te } = await supabase.from('tasks').insert(tasksCopy)
        if (te) throw te
      }
      const totalValue = srcTasks.reduce((s, t) => s + (parseFloat(t.value) || 0), 0)
      if (totalValue > 0) await supabase.from('jobs').update({ total_value: totalValue }).eq('id', newJobId)
      await fetchData()
      setSelectedJobId(newJobId)
      setActiveSection('job_detail')
      setMessage(`Lucrare duplicată: "${job.name} (copie)"`); setTimeout(() => setMessage(null), 3000)
    } catch (err) { setError(err.message || 'Eroare la duplicare') } finally { setLoading(false) }
  }

  const handleAmountPaidChange = (jobId, value) => setAmountPaidDraft(prev => ({ ...prev, [jobId]: value }))
  const saveAmountPaid = async (jobId) => {
    const raw = amountPaidDraft[jobId]; const parsed = raw === '' || raw == null ? 0 : parseFloat(raw)
    setLoading(true); setError(null)
    try {
      const { data, error: e } = await supabase.from('jobs').update({ amount_paid: isNaN(parsed) ? 0 : parsed }).eq('id', jobId).select()
      if (e) throw e
      if (data?.[0]) setJobs(prev => prev.map(j => j.id === jobId ? data[0] : j))
      setMessage('Bani încasați actualizați'); setTimeout(() => setMessage(null), 2500)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  const startEditTask = (task) => {
    setEditingTaskId(task.id)
    setTaskEdits({ name: task.name, description: task.description || '', status: task.status, assigned_to: Array.isArray(task.assigned_to) ? task.assigned_to : task.assigned_to ? [task.assigned_to] : [], estimated_hours: task.estimated_hours || '', value: task.value || '', deadline: task.deadline || '' })
  }
  const cancelEditTask = () => { setEditingTaskId(null); setTaskEdits({}) }

  const saveTask = async (taskId) => {
    setLoading(true); setError(null)
    try {
      const updates = {}
      if (taskEdits.name !== undefined) updates.name = taskEdits.name
      if (taskEdits.description !== undefined) updates.description = taskEdits.description
      if (taskEdits.status !== undefined) updates.status = taskEdits.status
      if (taskEdits.assigned_to !== undefined) {
        updates.assigned_to = Array.isArray(taskEdits.assigned_to) ? (taskEdits.assigned_to.length > 0 ? taskEdits.assigned_to : null) : (taskEdits.assigned_to ? [taskEdits.assigned_to] : null)
        updates.assigned_to_emails = updates.assigned_to?.length > 0 ? (updates.assigned_to.map(id => profiles.find(p => p.id === id)?.email).filter(Boolean)) : null
      }
      if (taskEdits.value !== undefined) updates.value = taskEdits.value ? parseFloat(taskEdits.value) : null
      if (taskEdits.deadline !== undefined) updates.deadline = taskEdits.deadline ? new Date(taskEdits.deadline).toISOString() : null

      let data
      try {
        const res = await supabase.from('tasks').update(updates).eq('id', taskId).select()
        if (res.error) throw res.error; data = res.data
      } catch (err) {
        if (err?.message?.includes('invalid input syntax for type uuid')) {
          const bc = { ...updates }; if (Array.isArray(bc.assigned_to)) bc.assigned_to = bc.assigned_to.length > 0 ? bc.assigned_to[0] : null
          const r2 = await supabase.from('tasks').update(bc).eq('id', taskId).select(); if (r2.error) throw r2.error; data = r2.data
        } else throw err
      }
      setTasks(prev => prev.map(t => t.id === taskId ? data[0] : t))
      setEditingTaskId(null); setTaskEdits({})
      setMessage('Task actualizat!'); setTimeout(() => setMessage(null), 3000)
      if (data?.[0]?.job_id) recalcJobTotal(data[0].job_id)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  const deleteTask = async (taskId) => {
    if (!window.confirm('Ștergi task-ul?')) return
    setLoading(true); setError(null)
    try {
      const task = tasks.find(t => t.id === taskId)
      const { error: e } = await supabase.from('tasks').delete().eq('id', taskId); if (e) throw e
      setTasks(prev => prev.filter(t => t.id !== taskId))
      setMessage('Task șters!'); setTimeout(() => setMessage(null), 3000)
      if (task?.job_id) recalcJobTotal(task.job_id)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  const toggleComplete = async (task) => {
    const newStatus = task.status === 'completed' ? 'todo' : 'completed'
    let updates
    if (newStatus === 'completed') {
      const existing = Array.isArray(task.completers) ? task.completers.slice() : (task.completed_by ? [{ id: task.completed_by, email: task.completed_by_email, completed_at: task.completed_at }] : [])
      if (existing.find(c => c.id === user?.id)) { setMessage('Ai marcat deja acest task'); setTimeout(() => setMessage(null), 2000); return }
      if (existing.length >= 2) { setMessage('Task are deja doi finalizatori'); setTimeout(() => setMessage(null), 2000); return }
      const newC = { id: user?.id, email: user?.email, completed_at: new Date().toISOString() }
      const newCompleters = existing.concat([newC])
      const tv = task.value != null ? parseFloat(task.value) : null
      if (tv != null) { const share = parseFloat((tv / newCompleters.length).toFixed(2)); newCompleters.forEach(c => { c.amount = share }) }
      updates = { status: 'completed', completed_at: newCompleters[0]?.completed_at || new Date().toISOString(), completers: newCompleters, completed_by: newCompleters[0]?.id || null, completed_by_email: newCompleters[0]?.email || null }
    } else {
      updates = { status: 'todo', completed_at: null, completers: [], completed_by: null, completed_by_email: null }
    }
    setLoading(true)
    try {
      const { data, error: err } = await supabase.from('tasks').update(updates).eq('id', task.id).select()
      if (err) throw err
      const updatedTasks = tasks.map(t => t.id === task.id ? data[0] : t)
      setTasks(updatedTasks)
      // Refresh job from server — server auto-marks it completed when all tasks done
      try {
        const { data: freshJob } = await supabase.from('jobs').select().eq('id', task.job_id)
        if (freshJob && freshJob[0]) setJobs(prev => prev.map(j => j.id === task.job_id ? { ...j, ...freshJob[0] } : j))
      } catch (e) { console.warn('job refresh failed', e) }
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  const startAddTaskToJob = (jobId) => { setAddingTaskToJob(jobId); setNewTaskData({ name: '', description: '', assigned_to: [], estimated_hours: '', value: '', deadline: '', noDeadline: false }) }
  const cancelAddTask = () => { setAddingTaskToJob(null); setNewTaskData({ name: '', description: '', assigned_to: [], estimated_hours: '', value: '', deadline: '', noDeadline: false }) }

  const handleAddTask = async (e) => {
    e.preventDefault()
    if (!newTaskData.noDeadline && !newTaskData.deadline) { setError('Setează un deadline sau bifează "Fără termen".'); return }
    setLoading(true); setError(null)
    try {
      const assignedArr = Array.isArray(newTaskData.assigned_to) ? newTaskData.assigned_to : (newTaskData.assigned_to ? [newTaskData.assigned_to] : [])
      const taskToInsert = { job_id: addingTaskToJob, name: newTaskData.name, description: newTaskData.description || null, status: 'todo', assigned_to: assignedArr.length > 0 ? assignedArr : null, assigned_to_emails: null, value: newTaskData.value ? parseFloat(newTaskData.value) : null, deadline: newTaskData.noDeadline ? null : (newTaskData.deadline ? new Date(newTaskData.deadline).toISOString() : null), created_by: user?.id || null }
      try {
        const { error: e } = await supabase.from('tasks').insert([taskToInsert]); if (e) throw e
      } catch (err) {
        if (err?.message?.includes('invalid input syntax for type uuid')) { const t2 = { ...taskToInsert, assigned_to: Array.isArray(taskToInsert.assigned_to) ? taskToInsert.assigned_to[0] : taskToInsert.assigned_to }; const { error: e2 } = await supabase.from('tasks').insert([t2]); if (e2) throw e2 } else throw err
      }
      cancelAddTask(); setMessage('Task adăugat!'); setTimeout(() => setMessage(null), 3000)
      fetchData(); recalcJobTotal(addingTaskToJob)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  const startEditProfile = (profile) => { setEditingProfileId(profile.id); setProfileEdits({ email: profile.email || '', full_name: profile.full_name || '', role: profile.role || 'employee' }) }
  const cancelEditProfile = () => { setEditingProfileId(null); setProfileEdits({}) }

  const saveProfile = async (profileId) => {
    setLoading(true); setError(null)
    try {
      const token = localStorage.getItem('access_token')
      const resp = await fetch(`/api/profiles/${profileId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' }, body: JSON.stringify(profileEdits) })
      const body = await resp.json(); if (!resp.ok) throw new Error(body.error)
      setProfiles(prev => prev.map(p => p.id === profileId ? body.profile : p))
      cancelEditProfile(); setMessage('Profil actualizat!'); setTimeout(() => setMessage(null), 3000)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  const setProfileRole = async (profileId, newRole) => {
    const profile = profiles.find(p => p.id === profileId)
    if (!profile) return
    if (!window.confirm(`Schimbi rolul lui ${profile.full_name || profile.email} la ${newRole}?`)) return
    setLoading(true); setError(null)
    try {
      const token = localStorage.getItem('access_token')
      const resp = await fetch(`/api/profiles/${profileId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' }, body: JSON.stringify({ role: newRole }) })
      const body = await resp.json(); if (!resp.ok) throw new Error(body.error)
      setProfiles(prev => prev.map(p => p.id === profileId ? body.profile : p))
      setMessage('Rol actualizat!'); setTimeout(() => setMessage(null), 3000)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  const deleteProfile = async (profileId) => {
    if (!window.confirm('Ștergi colaboratorul?')) return
    setLoading(true); setError(null)
    try {
      const delAuth = await fetch('/api/delete-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: profileId }) })
      if (!delAuth.ok) { const e = await delAuth.json(); throw new Error(e.error) }
      const { error: e } = await supabase.from('profiles').delete().eq('id', profileId); if (e) throw e
      setProfiles(prev => prev.filter(p => p.id !== profileId))
      setMessage('Colaborator șters!'); setTimeout(() => setMessage(null), 3000)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  const handleChangePassword = async (profile) => {
    if (!profile) return
    const p1 = window.prompt(`Noua parolă pentru ${profile.full_name || profile.email}:`); if (!p1) return
    const p2 = window.prompt('Confirmă parola:')
    if (p1 !== p2) { setError('Parolele nu se potrivesc!'); setTimeout(() => setError(null), 3000); return }
    if (p1.length < 6) { setError('Parola prea scurtă!'); setTimeout(() => setError(null), 3000); return }
    setLoading(true); setError(null)
    try {
      const token = localStorage.getItem('access_token')
      const resp = await fetch('/api/users/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' }, body: JSON.stringify({ id: profile.id, email: profile.email, new_password: p1 }) })
      const body = await resp.json(); if (!resp.ok) throw new Error(body.error)
      setMessage('Parolă schimbată!'); setTimeout(() => setMessage(null), 3000)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  const handleCreateNewProfile = async (e) => {
    e.preventDefault(); setError(null)
    const email = (newProfileData.email || '').trim().toLowerCase()
    const full_name = (newProfileData.full_name || '').trim()
    const password = newProfileData.password || ''
    if (!email || !password || !full_name) { setError('Email, parolă și nume sunt obligatorii!'); return }
    if (password !== newProfileData.confirmPassword) { setError('Parolele nu se potrivesc!'); return }
    if (password.length < 6) { setError('Parola prea scurtă!'); return }
    setLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const resp = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' }, body: JSON.stringify({ email, password, full_name, role: newProfileData.role }) })
      const body = await resp.json(); if (!resp.ok) throw new Error(body.error)
      setMessage('Profil creat!'); setNewProfileData({ email: '', password: '', confirmPassword: '', full_name: '', role: 'employee' }); setShowCreateProfile(false)
      await fetchProfiles(); setTimeout(() => setMessage(null), 3000)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
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
    return tasks.filter(task => {
      if (task.completed_at && new Date(task.completed_at).toISOString().split('T')[0] === ds) return true
      if (task.created_at && new Date(task.created_at).toISOString().split('T')[0] === ds) return true
      if (task.deadline && new Date(task.deadline).toISOString().split('T')[0] === ds) return true
      if (task.estimated_hours) { const ed = calculateEstimatedDate(task.estimated_hours); if (ed && ed.toISOString().split('T')[0] === ds) return true }
      return false
    })
  }
  const getJobsForDate = (date) => {
    const ds = date.toISOString().split('T')[0]
    return jobs.filter(job => {
      if (job.completed_at && new Date(job.completed_at).toISOString().split('T')[0] === ds) return true
      if (job.created_at && new Date(job.created_at).toISOString().split('T')[0] === ds) return true
      return false
    })
  }
  const hasEventsOnDate = (date) => getTasksForDate(date).length > 0 || getJobsForDate(date).length > 0
  const navigateMonth = (dir) => setCurrentMonth(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + dir); return d })
  const navigateReportMonth = (dir) => setReportMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + dir, 1))

  const handleLogout = () => {
    try { localStorage.removeItem('access_token') } catch (e) {}
    navigate('/'); setTimeout(() => window.location.reload(), 50)
  }

  const activeJobs = jobs.filter(j => j.status !== 'completed')
  const completedJobs = jobs.filter(j => j.status === 'completed')
  // Un task e „de făcut” doar dacă nu e finalizat și nici lucrarea lui nu e finalizată (la fel ca în emailuri)
  const isTaskOpen = (t) => t.status !== 'completed' && jobs.find(j => j.id === t.job_id)?.status !== 'completed'
  const currentUserProfile = profiles.find(p => p.email === user?.email) || null
  // Raport Lunar: Admin vede doar statisticile lui. Lucrările le vede pe toate. CEO vede tot.
  const myReportProfiles = currentUserProfile ? [currentUserProfile] : []

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

  const renderHome = () => {
    const displayName = currentUserProfile?.full_name || user?.email || 'Admin'
    const items = [
      { section: 'profil', icon: '👤', label: 'Profil', count: tasks.filter(t => { const a = Array.isArray(t.assigned_to) ? t.assigned_to : []; const ae = Array.isArray(t.assigned_to_emails) ? t.assigned_to_emails : []; return (a.includes(currentUserProfile?.id) || ae.includes(user?.email)) && isTaskOpen(t) }).length },
      { section: 'lucrari', icon: '📁', label: 'Toate Lucrările', count: activeJobs.length },
      { section: 'lucrari/cadastru_sporadic', icon: '📍', label: 'Cadastru Sporadic', count: activeJobs.filter(j => j.category === 'cadastru_sporadic').length },
      { section: 'lucrari/cadastru_sistematic', icon: '🗺️', label: 'Cadastru Sistematic', count: activeJobs.filter(j => j.category === 'cadastru_sistematic').length },
      { section: 'lucrari/topografie', icon: '⛰️', label: 'Topografie', count: activeJobs.filter(j => j.category === 'topografie').length },
      { section: 'lucrari_finalizate', icon: '✅', label: 'Lucrări Finalizate', count: completedJobs.length },
      { section: 'administrativ', icon: '📋', label: 'Administrativ', count: activeJobs.filter(j => j.category === 'administrativ').length },
      { section: 'calendar', icon: '📅', label: 'Calendar', count: null },
      { section: 'raport_lunar', icon: '📊', label: 'Raport Lunar', count: null },
      { section: 'profil_nou', icon: '➕', label: 'Crează Profil Nou', count: profiles.length },
    ]
    return (
      <div>
        <p className="home-welcome">Bună ziua, {displayName}!</p>
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
    const myId = currentUserProfile?.id
    const myEmail = user?.email
    const myTasks = tasks.filter(t => {
      const a = Array.isArray(t.assigned_to) ? t.assigned_to : (t.assigned_to ? [t.assigned_to] : [])
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
          <div className="profile-avatar">{(currentUserProfile?.full_name || user?.email || 'A').charAt(0).toUpperCase()}</div>
          <div>
            <div className="profile-name">{currentUserProfile?.full_name || user?.email}</div>
            <div className="profile-email">{user?.email}</div>
            <div className="profile-role">{user?.role || 'admin'}</div>
          </div>
        </div>
        <h3 style={{ marginBottom: 12, color: '#333' }}>Subtaskuri asignate ({myTasks.length})</h3>
        <TaskExplorer tasks={myTasks} jobs={jobs} dlBadge={dlBadge} storageKey="profil-admin" onOpen={job => { setPreviousSection('profil'); setSelectedJobId(job.id); setActiveSection('job_detail') }} />
      </div>
    )
  }

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

  const reorderItems = async (type, orderedIds, stateArr, setStateFn) => {
    const token = localStorage.getItem('access_token')
    const updates = orderedIds.map((id, i) => ({ id, sort_order: i }))
    setStateFn(prev => {
      const map = {}
      updates.forEach(u => { map[u.id] = u.sort_order })
      return prev.map(item => map[item.id] != null ? { ...item, sort_order: map[item.id] } : item)
    })
    try {
      await fetch('/api/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
        body: JSON.stringify({ type, items: updates })
      })
    } catch (err) { console.error('reorder error', err) }
  }

  const renderJobList = (filteredJobs, opts = {}) => {
    const sorted = opts.keepOrder ? filteredJobs : [...filteredJobs].sort((a, b) => {
      if (a.sort_order != null && b.sort_order != null) return a.sort_order - b.sort_order
      if (a.sort_order != null) return -1
      if (b.sort_order != null) return 1
      return new Date(a.created_at) - new Date(b.created_at)
    })

    const handleJobDrop = (targetId) => {
      const sourceId = dragJobRef.current
      dragJobRef.current = null
      setDragOverJobId(null)
      if (!sourceId || sourceId === targetId) return
      // Reorder across the GLOBAL job list to keep sort_order unique (no cross-category collisions)
      const globalSorted = [...jobs].sort((a, b) => {
        if (a.sort_order != null && b.sort_order != null) return a.sort_order - b.sort_order
        if (a.sort_order != null) return -1
        if (b.sort_order != null) return 1
        return new Date(a.created_at) - new Date(b.created_at)
      })
      const srcIdx = globalSorted.findIndex(j => j.id === sourceId)
      const tgtIdx = globalSorted.findIndex(j => j.id === targetId)
      if (srcIdx === -1 || tgtIdx === -1) return
      const [moved] = globalSorted.splice(srcIdx, 1)
      const newTgtIdx = globalSorted.findIndex(j => j.id === targetId)
      globalSorted.splice(newTgtIdx, 0, moved)
      reorderItems('jobs', globalSorted.map(j => j.id), jobs, setJobs)
    }

    return (
      <div>
        {sorted.length === 0 && <p style={{ color: '#6b7280', fontSize: 14 }}>Nu sunt lucrări în această categorie.</p>}
        {sorted.map((job, idx) => {
          const jobTasks = tasks.filter(t => t.job_id === job.id)
          const completedCount = jobTasks.filter(t => t.status === 'completed').length
          const earliestDeadline = jobTasks.filter(t => t.deadline && t.status !== 'completed').sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0]
          const isDropTarget = dragOverJobId === job.id
          return (
            <div
              key={job.id}
              className="job-card"
              draggable={opts.draggable !== false}
              onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; dragJobRef.current = job.id }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverJobId !== job.id) setDragOverJobId(job.id) }}
              onDragLeave={() => setDragOverJobId(null)}
              onDrop={(e) => { e.preventDefault(); handleJobDrop(job.id) }}
              onDragEnd={() => { dragJobRef.current = null; setDragOverJobId(null) }}
              onClick={() => { setPreviousSection(activeSection); setSelectedJobId(job.id); setActiveSection('job_detail') }}
              style={{ marginBottom: 10, padding: '14px 16px', border: `1px solid ${isDropTarget ? '#1976d2' : '#e5e7eb'}`, borderTop: isDropTarget ? '3px solid #1976d2' : undefined, borderRadius: 10, background: job.status === 'completed' ? '#f0fdf4' : 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', cursor: 'grab', display: 'flex', alignItems: 'center', gap: 12 }}
              onMouseEnter={e => { if (!dragJobRef.current) { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)'; e.currentTarget.style.borderColor = '#93c5fd' } }}
              onMouseLeave={e => { if (!dragJobRef.current) { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'; e.currentTarget.style.borderColor = '#e5e7eb' } }}
            >
              <span title="Trage pentru a reordona" style={{ cursor: 'grab', color: '#bbb', fontSize: 18, flexShrink: 0, lineHeight: 1, userSelect: 'none' }}>⠿</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: 15 }}>{idx + 1}. {job.name}</span>
                  <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, color: 'white', background: job.priority === 'urgent' ? '#f44336' : job.priority === 'repede' ? '#ff9800' : '#607d8b' }}>{job.priority || 'normal'}</span>
                  {job.order_number && <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, color: 'white', background: '#2196f3' }}>Nr. {job.order_number}</span>}
                  {job.category && <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, color: '#555', background: '#e3f2fd' }}>{CATEGORY_LABELS[job.category] || job.category}</span>}
                  <strong style={{ color: '#333', fontSize: 13 }}>— {job.client_name}</strong>
                  {job.responsible_id && <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, color: '#1b5e20', background: '#e8f5e9' }}>👷 {responsibleName(job.responsible_id) || 'Responsabil'}</span>}
                </div>
                <div style={{ fontSize: 12, color: '#555', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>💰 <strong>{job.total_value != null ? parseFloat(job.total_value).toFixed(2) + ' lei' : 'N/A'}</strong></span>
                  <span style={{ color: '#4caf50' }}>💵 <strong>{job.amount_paid != null ? parseFloat(job.amount_paid).toFixed(2) + ' lei' : '0.00 lei'}</strong></span>
                  <span style={{ color: '#6b7280' }}>{completedCount}/{jobTasks.length} taskuri</span>
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
    if (!job) return (
      <div>
        <button onClick={() => setActiveSection(previousSection)} style={{ padding: '7px 14px', background: '#374151', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, marginBottom: 16 }}>← Înapoi</button>
        <p>Lucrarea nu a fost găsită.</p>
      </div>
    )
    const jobTasks = tasks.filter(t => t.job_id === job.id).sort((a, b) => {
      if (a.sort_order != null && b.sort_order != null) return a.sort_order - b.sort_order
      if (a.sort_order != null) return -1
      if (b.sort_order != null) return 1
      return new Date(a.created_at) - new Date(b.created_at)
    })

    const handleTaskDrop = (targetId) => {
      const sourceId = dragTaskRef.current
      dragTaskRef.current = null
      setDragOverTaskId(null)
      if (!sourceId || sourceId === targetId) return
      const srcIdx = jobTasks.findIndex(t => t.id === sourceId)
      const tgtIdx = jobTasks.findIndex(t => t.id === targetId)
      if (srcIdx === -1 || tgtIdx === -1) return
      const reordered = [...jobTasks]
      const [moved] = reordered.splice(srcIdx, 1)
      reordered.splice(tgtIdx, 0, moved)
      reorderItems('tasks', reordered.map(t => t.id), tasks, setTasks)
    }

    const isEditing = editingJobId === job.id
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => { setEditingJobId(null); setJobEdits({}); setActiveSection(previousSection) }} style={{ padding: '7px 14px', background: '#374151', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>← Înapoi</button>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>{job.name}</h2>
            <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, color: 'white', background: job.priority === 'urgent' ? '#f44336' : job.priority === 'repede' ? '#ff9800' : '#607d8b' }}>{job.priority || 'normal'}</span>
            {job.status === 'completed' && <span style={{ padding: '3px 8px', borderRadius: 5, fontSize: 11, color: 'white', background: '#4caf50' }}>Finalizat</span>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => downloadPdfForJob(job)} style={{ padding: '7px 14px', background: '#e65100', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>📄 PDF</button>
            <button onClick={() => duplicateJob(job)} style={{ padding: '7px 14px', background: '#7b1fa2', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>📋 Duplică</button>
            <button onClick={() => deleteJob(job.id)} style={{ padding: '7px 14px', background: '#c62828', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>🗑️ Șterge</button>
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: 10, padding: 18, border: '1px solid #e5e7eb', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          {isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select value={jobEdits.nameType || 'Altele'} onChange={e => setJobEdits(p => ({ ...p, nameType: e.target.value }))} style={{ flex: '1 1 200px', padding: '7px 10px', borderRadius: 6, border: '1px solid #ccc' }}>
                  {JOB_NAME_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <select value={jobEdits.priority || 'normal'} onChange={e => setJobEdits(p => ({ ...p, priority: e.target.value }))} style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid #ccc' }}>
                  <option value="normal">Normal</option><option value="repede">Repede</option><option value="urgent">Urgent</option>
                </select>
                <select value={jobEdits.category || ''} onChange={e => setJobEdits(p => ({ ...p, category: e.target.value }))} style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid #ccc' }}>
                  <option value="">Fără categorie</option>
                  <option value="cadastru_sporadic">Cadastru Sporadic</option>
                  <option value="cadastru_sistematic">Cadastru Sistematic</option>
                  <option value="topografie">Topografie</option>
                  <option value="administrativ">Administrativ</option>
                </select>
                <select value={jobEdits.responsible_id || ''} onChange={e => setJobEdits(p => ({ ...p, responsible_id: e.target.value }))} style={{ flex: '1 1 200px', padding: '7px 10px', borderRadius: 6, border: '1px solid #ccc' }}>
                  <option value="">-- Responsabil lucrare</option>
                  {(profiles || []).map(p => <option key={p.id} value={p.id}>{displayUserLabel(p)}</option>)}
                </select>
              </div>
              {jobEdits.nameType === 'Altele' && (
                <input placeholder="Descrie tipul lucrării *" value={jobEdits.nameCustom || ''} onChange={e => setJobEdits(p => ({ ...p, nameCustom: e.target.value }))} style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid #f59e0b', background: '#fffbeb' }} />
              )}
              <input placeholder="Nume Client" value={jobEdits.client_name || ''} onChange={e => setJobEdits(p => ({ ...p, client_name: e.target.value }))} style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid #ccc' }} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input placeholder="Serie buletin" value={jobEdits.client_id_series || ''} onChange={e => setJobEdits(p => ({ ...p, client_id_series: e.target.value }))} style={{ flex: '1 1 120px', padding: '7px 10px', borderRadius: 6, border: '1px solid #ccc' }} />
                <input placeholder="CNP" value={jobEdits.client_cnp || ''} onChange={e => setJobEdits(p => ({ ...p, client_cnp: e.target.value }))} style={{ flex: '1 1 120px', padding: '7px 10px', borderRadius: 6, border: '1px solid #ccc' }} />
                <input placeholder="Adresa" value={jobEdits.client_address || ''} onChange={e => setJobEdits(p => ({ ...p, client_address: e.target.value }))} style={{ flex: '2 1 200px', padding: '7px 10px', borderRadius: 6, border: '1px solid #ccc' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input type="email" placeholder="Email Client" value={jobEdits.client_email || ''} onChange={e => setJobEdits(p => ({ ...p, client_email: e.target.value }))} style={{ flex: '1 1 180px', padding: '7px 10px', borderRadius: 6, border: '1px solid #ccc' }} />
                <input placeholder="Telefon Client" value={jobEdits.client_phone || ''} onChange={e => setJobEdits(p => ({ ...p, client_phone: e.target.value }))} style={{ flex: '1 1 140px', padding: '7px 10px', borderRadius: 6, border: '1px solid #ccc' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ fontSize: 12 }}>Bani încasați:</label>
                <input type="number" step="0.01" value={jobEdits.amount_paid ?? ''} onChange={e => setJobEdits(p => ({ ...p, amount_paid: e.target.value }))} style={{ width: 120, padding: '7px 10px', borderRadius: 6, border: '1px solid #ccc' }} />
                <label style={{ fontSize: 12 }}>Nr. ordine:</label>
                <input type="number" min="1" value={jobEdits.order_number ?? ''} onChange={e => setJobEdits(p => ({ ...p, order_number: e.target.value }))} style={{ width: 100, padding: '7px 10px', borderRadius: 6, border: '1px solid #ccc' }} />
                <select value={jobEdits.status || 'todo'} onChange={e => setJobEdits(p => ({ ...p, status: e.target.value }))} style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid #ccc' }}>
                  <option value="todo">În lucru</option><option value="completed">Finalizat</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => saveJobAndTasks(job.id)} style={{ padding: '7px 14px', background: '#4caf50', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>💾 Salvează tot</button>
                <button onClick={cancelEditJob} style={{ padding: '7px 14px', background: '#999', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Anulează</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {job.order_number && <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, color: 'white', background: '#2196f3' }}>Nr. {job.order_number}</span>}
                  {job.category && <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 11, color: '#555', background: '#e3f2fd' }}>{CATEGORY_LABELS[job.category] || job.category}</span>}
                </div>
                <button onClick={() => startEditJob(job)} style={{ padding: '7px 14px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>✏️ Editează</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, fontSize: 13 }}>
                <div><div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>Client</div><div style={{ fontWeight: 600 }}>{job.client_name || 'N/A'}</div></div>
                <div><div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>Responsabil</div><div style={{ fontWeight: 600 }}>{responsibleName(job.responsible_id) || 'Nealocat'}</div></div>
                <div><div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>Email</div><div>{job.client_email || 'N/A'}</div></div>
                <div><div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>Telefon</div><div>{job.client_phone || 'N/A'}</div></div>
                <div><div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>CNP</div><div>{job.client_cnp || 'N/A'}</div></div>
                <div><div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>Serie buletin</div><div>{job.client_id_series || 'N/A'}</div></div>
                <div><div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>Adresă</div><div>{job.client_address || 'N/A'}</div></div>
                <div><div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>Valoare totală</div><div style={{ fontWeight: 700, color: '#1976d2', fontSize: 15 }}>{job.total_value != null ? parseFloat(job.total_value).toFixed(2) + ' lei' : 'N/A'}</div></div>
                <div>
                  <div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>Bani încasați</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="number" step="0.01" min="0" value={amountPaidDraft[job.id] !== undefined ? amountPaidDraft[job.id] : (job.amount_paid ?? '')} onChange={e => handleAmountPaidChange(job.id, e.target.value)} style={{ width: 110, padding: '5px 7px', borderRadius: 5, border: '1px solid #ccc', fontSize: 13 }} />
                    <button onClick={() => saveAmountPaid(job.id)} style={{ padding: '5px 10px', background: '#4caf50', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12 }}>💾</button>
                  </div>
                </div>
                <div><div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>Creat la</div><div>{new Date(job.created_at).toLocaleString('ro-RO')}</div></div>
              </div>
            </div>
          )}
        </div>

        <div style={{ background: 'white', borderRadius: 10, padding: 18, border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 15, color: '#1a1a2e' }}>Taskuri ({jobTasks.length})</h3>
            {addingTaskToJob !== job.id && (
              <button onClick={() => startAddTaskToJob(job.id)} style={{ padding: '6px 14px', background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#2e7d32', fontWeight: 600 }}>➕ Adaugă task</button>
            )}
          </div>
          {jobTasks.map(task => {
            const assignedProfiles = (profiles || []).filter(p => Array.isArray(task.assigned_to) ? task.assigned_to.includes(p.id) : task.assigned_to === p.id)
            const isTaskExpanded = expandedTask === task.id
            if (isEditing) {
              const draft = taskDrafts[task.id] || { name: task.name, description: task.description || '', status: task.status, assigned_to: Array.isArray(task.assigned_to) ? task.assigned_to : [], value: task.value || '', deadline: task.deadline || '' }
              const setDraft = (upd) => setTaskDrafts(prev => ({ ...prev, [task.id]: { ...draft, ...upd } }))
              return (
                <div key={task.id} className="task-row" style={{ marginBottom: 8, padding: '10px 12px', border: '1px solid #90caf9', borderRadius: 7, background: '#f0f7ff' }}>
                  <input placeholder="Nume Task" value={draft.name} onChange={e => setDraft({ name: e.target.value })} style={{ marginBottom: 5, width: '100%', padding: '6px 9px', borderRadius: 5, border: '1px solid #ccc', boxSizing: 'border-box' }} />
                  <textarea placeholder="Descriere" value={draft.description} onChange={e => setDraft({ description: e.target.value })} style={{ marginBottom: 5, width: '100%', minHeight: 50, padding: '6px 9px', borderRadius: 5, border: '1px solid #ccc', boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><label style={{ fontSize: 12 }}>Deadline:</label><input type="datetime-local" value={draft.deadline ? draft.deadline.slice(0, 16) : ''} onChange={e => setDraft({ deadline: e.target.value })} style={{ padding: 5 }} /></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><label style={{ fontSize: 12 }}>Valoare (lei):</label><input type="number" value={draft.value} onChange={e => setDraft({ value: e.target.value })} style={{ width: 100, padding: 5 }} step="0.01" min="0" /></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><label style={{ fontSize: 12 }}>Status:</label><select value={draft.status} onChange={e => setDraft({ status: e.target.value })} style={{ padding: '4px 8px', borderRadius: 5, border: '1px solid #ccc' }}><option value="todo">În lucru</option><option value="stand_by">Stand By</option><option value="completed">Finalizat</option></select></div>
                  </div>
                  <MultiAssignSelector profiles={profiles} selectedIds={draft.assigned_to || []} onChange={v => setDraft({ assigned_to: v })} />
                  <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={() => deleteTask(task.id)} style={{ fontSize: 11, padding: '4px 10px', background: '#ffebee', border: '1px solid #ffcdd2', borderRadius: 5, cursor: 'pointer', color: '#c62828' }}>🗑️ Șterge task</button>
                  </div>
                </div>
              )
            }
            const isDropTarget = dragOverTaskId === task.id
            return (
              <div
                key={task.id}
                className="task-row"
                draggable={!isEditing}
                onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; dragTaskRef.current = task.id }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverTaskId !== task.id) setDragOverTaskId(task.id) }}
                onDragLeave={() => setDragOverTaskId(null)}
                onDrop={(e) => { e.preventDefault(); handleTaskDrop(task.id) }}
                onDragEnd={() => { dragTaskRef.current = null; setDragOverTaskId(null) }}
                style={{ marginBottom: 8, padding: '10px 12px', border: `1px solid ${isDropTarget ? '#1976d2' : '#e5e7eb'}`, borderTop: isDropTarget ? '3px solid #1976d2' : undefined, borderRadius: 7, background: task.status === 'completed' ? '#f0fdf4' : 'white', cursor: isEditing ? 'default' : 'grab' }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {!isEditing && <span title="Trage pentru a reordona" style={{ color: '#ccc', fontSize: 16, cursor: 'grab', userSelect: 'none', lineHeight: 1 }}>⠿</span>}
                        <strong style={{ fontSize: 14 }}>{task.name}</strong>
                        <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: task.status === 'completed' ? '#e8f5e9' : task.status === 'stand_by' ? '#e3f2fd' : '#fff3e0', color: task.status === 'completed' ? '#2e7d32' : task.status === 'stand_by' ? '#1565c0' : '#e65100', fontWeight: 600 }}>{task.status === 'completed' ? 'Finalizat' : task.status === 'stand_by' ? 'Stand By' : 'În lucru'}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                        <span>Asignat: {assignedProfiles.length > 0 ? assignedProfiles.map(p => displayUserLabel(p)).join(', ') : '(Neasignat)'}</span>
                        {task.value != null && <span> | 💰 {parseFloat(task.value).toFixed(2)} lei</span>}
                        {task.deadline && <span style={{ marginLeft: 6 }}>{dlBadge(task.deadline, true)}</span>}
                      </div>
                      {task.description && <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>{task.description}</div>}
                      {isTaskExpanded && (
                        <div style={{ marginTop: 8, fontSize: 12, color: '#555', paddingTop: 8, borderTop: '1px solid #eee' }}>
                          {(Array.isArray(task.completers) && task.completers.length > 0) && <div style={{ marginBottom: 4 }}>Finalizat de: {task.completers.map((c, i) => { const p = (profiles || []).find(p => p.id === c.id || (c.email && p.email && p.email.toLowerCase() === c.email.toLowerCase())); const l = p ? displayUserLabel(p) : (c.email || c.id); return `${l}${c.amount != null ? ` (${c.amount} lei)` : ''}${i < task.completers.length - 1 ? ', ' : ''}` }).join('')}</div>}
                          {task.completed_at && <div>Finalizat la: {new Date(task.completed_at).toLocaleString('ro-RO')}</div>}
                          <div style={{ marginTop: 4 }}>Creat la: {new Date(task.created_at).toLocaleString('ro-RO')}</div>
                          {task.deadline && <div style={{ marginTop: 4 }}>Deadline: {new Date(task.deadline).toLocaleString('ro-RO')}</div>}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
                      <button onClick={() => setExpandedTask(isTaskExpanded ? null : task.id)} style={{ fontSize: 11, padding: '4px 8px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 5, cursor: 'pointer', color: '#374151' }}>{isTaskExpanded ? '▲' : '▼'}</button>
                      <button onClick={() => toggleComplete(task)} style={{ fontSize: 11, padding: '4px 8px', background: task.status === 'completed' ? '#fff3e0' : '#e8f5e9', border: '1px solid ' + (task.status === 'completed' ? '#ffcc80' : '#c8e6c9'), borderRadius: 5, cursor: 'pointer', color: task.status === 'completed' ? '#e65100' : '#2e7d32' }}>{task.status === 'completed' ? '↩️ Undo' : task.status === 'stand_by' ? '▶ Reia' : '✅ Done'}</button>
                      <button onClick={() => deleteTask(task.id)} style={{ fontSize: 11, padding: '4px 8px', background: '#ffebee', border: '1px solid #ffcdd2', borderRadius: 5, cursor: 'pointer', color: '#c62828' }}>🗑️</button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          {addingTaskToJob === job.id ? (
            <form onSubmit={handleAddTask} style={{ marginTop: 12, padding: 14, background: '#e3f2fd', borderRadius: 7, border: '2px solid #90caf9' }}>
              <input placeholder="Nume task" value={newTaskData.name} onChange={e => setNewTaskData(p => ({ ...p, name: e.target.value }))} required style={{ width: '100%', marginBottom: 6, padding: '7px 9px', borderRadius: 5, border: '1px solid #ccc' }} />
              <textarea placeholder="Descriere" value={newTaskData.description || ''} onChange={e => setNewTaskData(p => ({ ...p, description: e.target.value }))} style={{ width: '100%', marginBottom: 6, minHeight: 60, padding: '7px 9px', borderRadius: 5, border: '1px solid #ccc' }} />
              <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <label style={{ fontSize: 12 }}>Deadline:</label>
                    {!newTaskData.noDeadline && <input type="datetime-local" value={newTaskData.deadline || ''} onChange={e => setNewTaskData(p => ({ ...p, deadline: e.target.value }))} required style={{ padding: 5 }} />}
                  </div>
                  <label style={{ fontSize: 11, color: '#666', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!newTaskData.noDeadline} onChange={e => setNewTaskData(p => ({ ...p, noDeadline: e.target.checked, deadline: e.target.checked ? '' : p.deadline }))} />
                    Fără termen
                  </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><label style={{ fontSize: 12 }}>Valoare (lei):</label><input type="number" value={newTaskData.value} onChange={e => setNewTaskData(p => ({ ...p, value: e.target.value }))} style={{ width: 100, padding: 5 }} step="0.01" min="0" /></div>
                <MultiAssignSelector profiles={profiles} selectedIds={newTaskData.assigned_to || []} onChange={v => setNewTaskData(p => ({ ...p, assigned_to: v }))} />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="submit" style={{ padding: '6px 12px', background: '#4caf50', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12 }}>➕ Adaugă</button>
                <button type="button" onClick={cancelAddTask} style={{ padding: '6px 12px', background: '#999', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12 }}>Anulează</button>
              </div>
            </form>
          ) : (
            jobTasks.length === 0 && <p style={{ fontSize: 13, color: '#6b7280', marginTop: 8 }}>Nu sunt taskuri. Adaugă primul task.</p>
          )}
        </div>
      </div>
    )
  }

  const renderSection = (filteredJobs, title, icon, defaultCat = '') => {
    const q = searchQuery.trim().toLowerCase()
    const displayed = q ? filteredJobs.filter(j => (j.client_name || '').toLowerCase().includes(q) || (j.name || '').toLowerCase().includes(q)) : filteredJobs
    return (
      <div>
        <div className="section-header">
          <h2 className="section-title">{icon} {title} <span style={{ fontSize: 14, fontWeight: 400, color: '#777' }}>({displayed.filter(j => j.status !== 'completed').length} în lucru)</span></h2>
          <button onClick={() => { setJobCategory(defaultCat); setShowCreateWithTasks(true) }} style={{ padding: '9px 18px', background: '#16213e', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>+ Crează Lucrare</button>
        </div>
        <div style={{ marginBottom: 12 }}>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="🔍 Caută după beneficiar sau tipul lucrării..." style={{ width: '100%', padding: '9px 13px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <JobExplorer jobs={displayed} tasks={tasks} dlBadge={dlBadge} storageKey={`jobs-admin-${defaultCat || 'toate'}`} onOpen={job => { setPreviousSection(activeSection); setSelectedJobId(job.id); setActiveSection('job_detail') }} renderCards={(rows, opts) => renderJobList(rows, opts)} responsibleName={responsibleName} />
      </div>
    )
  }

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
            <button onClick={() => navigateMonth(-1)} style={{ padding: '7px 14px', border: 'none', borderRadius: 6, cursor: 'pointer', background: '#374151', color: '#fff', fontWeight: 600 }}>◀ Prev</button>
            <h3 style={{ margin: 0, color: '#2196f3' }}>{monthNames[month]} {year}</h3>
            <button onClick={() => navigateMonth(1)} style={{ padding: '7px 14px', border: 'none', borderRadius: 6, cursor: 'pointer', background: '#374151', color: '#fff', fontWeight: 600 }}>Next ▶</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 8 }}>
            {dayNames.map(n => <div key={n} style={{ textAlign: 'center', fontWeight: 700, fontSize: 12, padding: 6, color: '#777' }}>{n}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>{days}</div>
          {selectedDate && (
            <div style={{ marginTop: 20, borderTop: '2px solid #eee', paddingTop: 16 }}>
              <h4 style={{ margin: '0 0 10px', color: '#2196f3' }}>📅 {selectedDate.toLocaleDateString('ro-RO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h4>
              {getJobsForDate(selectedDate).length > 0 && <div style={{ marginBottom: 12 }}><strong>Jobs ({getJobsForDate(selectedDate).length}):</strong>{getJobsForDate(selectedDate).map(j => <div key={j.id} style={{ fontSize: 13, marginLeft: 12, padding: '5px 8px', background: '#f5f5f5', borderRadius: 5, marginTop: 4 }}>• {j.name} - {j.client_name}</div>)}</div>}
              {getTasksForDate(selectedDate).length > 0 && <div><strong>Tasks ({getTasksForDate(selectedDate).length}):</strong>{getTasksForDate(selectedDate).map(t => { const j = jobs.find(jj => jj.id === t.job_id); return <div key={t.id} style={{ fontSize: 13, marginLeft: 12, padding: '5px 8px', background: t.status === 'completed' ? '#e8f5e9' : '#fff3e0', borderRadius: 5, marginTop: 4 }}>• {t.name} {j && `(${j.name})`} - <strong>{t.status}</strong></div> })}</div>}
              {getJobsForDate(selectedDate).length === 0 && getTasksForDate(selectedDate).length === 0 && <p style={{ color: '#6b7280', fontStyle: 'italic', fontSize: 13 }}>Nu sunt evenimente în această zi.</p>}
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderMonthlyReport = () => {
    const monthNames = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']
    const fullReport = buildMonthlyReportData({ tasks, profiles: myReportProfiles, users, month: reportMonth.getMonth(), year: reportMonth.getFullYear() })
    const myRows = fullReport.rows.filter(r => r.profile)
    const report = { ...fullReport, rows: myRows, overallTotal: myRows.reduce((sum, r) => sum + r.totalValue, 0), totalTasks: myRows.reduce((sum, r) => sum + r.count, 0) }
    const exportCSV = async () => {
      try {
        const csv = generateMonthlyReportCsv({ tasks, profiles: myReportProfiles, users, month: reportMonth.getMonth(), year: reportMonth.getFullYear() })
        downloadCsv(csv, `raport_${reportMonth.getFullYear()}_${String(reportMonth.getMonth()+1).padStart(2,'0')}.csv`)
      } catch (e) { setError(e.message) }
    }
    return (
      <div>
        <div className="section-header"><h2 className="section-title">📊 Raport Lunar</h2></div>
        <div style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <button onClick={() => navigateReportMonth(-1)} style={{ padding: '6px 12px', border: 'none', borderRadius: 6, cursor: 'pointer', background: '#374151', color: '#fff', fontWeight: 700 }}>◀</button>
            <h3 style={{ margin: 0 }}>{monthNames[reportMonth.getMonth()]} {reportMonth.getFullYear()}</h3>
            <button onClick={() => navigateReportMonth(1)} style={{ padding: '6px 12px', border: 'none', borderRadius: 6, cursor: 'pointer', background: '#374151', color: '#fff', fontWeight: 700 }}>▶</button>
            <span style={{ marginLeft: 12, fontSize: 13, color: '#555' }}>Total: <strong>{report.totalTasks}</strong> taskuri | <strong>{report.overallTotal.toFixed(2)} lei</strong></span>
            <button onClick={() => {
              const wb = XLSX.utils.book_new()
              const employees = myReportProfiles
              employees.forEach(emp => {
                const empTasks = tasks.filter(t => { const a = Array.isArray(t.assigned_to) ? t.assigned_to : []; const ae = Array.isArray(t.assigned_to_emails) ? t.assigned_to_emails : []; return a.includes(emp.id) || ae.includes(emp.email) })
                // Foaia fiecărui colaborator, pe luna aleasă: taskurile alocate lui (+ taskurile libere bifate de el).
                // „Finalizat” = taskurile lui terminate în luna aleasă (intră în TOTAL); „În lucru” = ce mai are deschis azi (informativ).
                const monthStart = new Date(reportMonth.getFullYear(), reportMonth.getMonth(), 1)
                const monthEnd = new Date(reportMonth.getFullYear(), reportMonth.getMonth() + 1, 1)
                const myShare = (t) => shareFor(t, emp)
                const doneAt = (t) => doneDateFor(t, emp)
                const doneInMonth = tasks.filter(t => isCreditedTo(t, emp) && doneAt(t) && doneAt(t) >= monthStart && doneAt(t) < monthEnd)
                const open = empTasks.filter(t => t.status !== 'completed')
                const byJob = (list) => [...new Set(list.map(t => t.job_id))].map(id => ({ j: jobs.find(jj => jj.id === id), myT: list.filter(t => t.job_id === id) })).filter(g => g.j)
                const doneLines = byJob(doneInMonth).map(g => ({ ...g, value: g.myT.reduce((s, t) => s + myShare(t), 0), date: g.myT.map(doneAt).sort((a, b) => b - a)[0] }))
                const openLines = byJob(open).map(g => ({ ...g, value: g.myT.reduce((s, t) => s + myShare(t), 0), date: g.myT.filter(t => t.deadline).map(t => new Date(t.deadline)).sort((a, b) => a - b)[0] }))
                const line = (tip, l) => [tip, l.j.name, l.j.client_name || '', responsibleName(l.j.responsible_id) || '', l.myT.length, parseFloat(l.value.toFixed(2)), l.date ? l.date.toLocaleDateString('ro-RO') : '']
                const rows = []
                rows.push([`Finalizate în ${reportMonth.toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' })}`])
                rows.push(['Tip', 'Lucrare', 'Client', 'Responsabil', 'Taskuri', 'Valoare (lei)', 'Finalizat la'])
                doneLines.forEach(l => rows.push(line('Finalizat', l)))
                rows.push(['', '', '', '', 'TOTAL LUNĂ:', parseFloat(doneLines.reduce((s, l) => s + l.value, 0).toFixed(2))])
                rows.push([])
                rows.push(['În lucru la zi (nu intră în total)'])
                rows.push(['Tip', 'Lucrare', 'Client', 'Responsabil', 'Taskuri deschise', 'Valoare (lei)', 'Deadline'])
                openLines.forEach(l => rows.push(line('În lucru', l)))
                const ws = XLSX.utils.aoa_to_sheet(rows)
                XLSX.utils.book_append_sheet(wb, ws, (emp.full_name || emp.email).slice(0, 31))
              })
              XLSX.writeFile(wb, `raport_${reportMonth.getFullYear()}_${String(reportMonth.getMonth()+1).padStart(2,'0')}.xlsx`)
            }} style={{ marginLeft: 'auto', padding: '7px 14px', background: '#1976d2', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>📊 Export Excel</button>
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>{['Colaborator','Email','Taskuri','Valoare (lei)'].map(h => <th key={h} style={{ textAlign: h === 'Taskuri' || h === 'Valoare (lei)' ? 'right' : 'left', padding: '8px 12px', borderBottom: '2px solid #eee', color: '#555' }}>{h}</th>)}</tr></thead>
              <tbody>{report.rows.map(row => <tr key={row.assigned_to || 'u'}><td style={{ padding: '8px 12px', borderBottom: '1px solid #f5f5f5' }}>{row.profile ? (row.profile.full_name || row.profile.email) : '(Neasignat)'}</td><td style={{ padding: '8px 12px', borderBottom: '1px solid #f5f5f5', color: '#666' }}>{row.profile?.email || 'N/A'}</td><td style={{ padding: '8px 12px', borderBottom: '1px solid #f5f5f5', textAlign: 'right' }}>{row.count}</td><td style={{ padding: '8px 12px', borderBottom: '1px solid #f5f5f5', textAlign: 'right', fontWeight: 700 }}>{row.totalValue.toFixed(2)}</td></tr>)}</tbody>
            </table>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 12 }}>
            {report.rows.length === 0 && <div style={{ color: '#6b7280', fontSize: 13 }}>Nu s-au găsit taskuri finalizate în luna selectată.</div>}
            {report.rows.map(row => (
              <div key={row.assigned_to || 'u'} style={{ padding: 12, border: '1px solid #e0e0e0', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div><div style={{ fontWeight: 700 }}>{row.profile ? displayUserLabel(row.profile) : '(Neasignat)'}</div><div style={{ fontSize: 12, color: '#666' }}>{row.count} taskuri</div></div>
                  <div style={{ fontWeight: 700 }}>{row.totalValue.toFixed(2)} lei</div>
                </div>
                <div style={{ borderTop: '1px dashed #eee', paddingTop: 8 }}>
                  {row.tasks.map(t => { const j = jobs.find(jj => jj.id === t.job_id); return <div key={t.id} style={{ marginBottom: 6, fontSize: 12 }}><div><strong>{t.name}</strong>{j && <span style={{ color: '#666' }}> — {j.name}</span>}</div><div style={{ color: '#777' }}>Valoare: {(parseFloat(t.value) || 0).toFixed(2)} lei | {new Date(t.completed_at).toLocaleString('ro-RO')}</div></div> })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const renderEchipa = () => {
    const employees = profiles.filter(p => p.role === 'employee' || p.role === 'admin' || p.role === 'ceo')
    const toggleEmp = (id) => setExpandedEmployees(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })


    const exportEchipaExcel = () => {
      const wb = XLSX.utils.book_new()
      employees.forEach(emp => {
        const empTasks = tasks.filter(t => { const a = Array.isArray(t.assigned_to) ? t.assigned_to : []; const ae = Array.isArray(t.assigned_to_emails) ? t.assigned_to_emails : []; return a.includes(emp.id) || ae.includes(emp.email) })
        const pending = empTasks.filter(isTaskOpen)
        const rows = [['Task', 'Lucrare', 'Client', 'Responsabil', 'Valoare (lei)', 'Deadline', 'Status']]
        pending.forEach(t => { const j = jobs.find(jj => jj.id === t.job_id); const statusLabel = t.status === 'stand_by' ? 'Stand By' : 'În lucru'; rows.push([t.name, j?.name || '', j?.client_name || '', responsibleName(j?.responsible_id) || '', t.value || '', t.deadline ? new Date(t.deadline).toLocaleDateString('ro-RO') : '', statusLabel]) })
        rows.push([], ['', '', '', 'Total valoare:', pending.reduce((s,t)=>s+(parseFloat(t.value)||0),0).toFixed(2), ''])
        const ws = XLSX.utils.aoa_to_sheet(rows)
        XLSX.utils.book_append_sheet(wb, ws, (emp.full_name || emp.email).slice(0, 31))
      })
      XLSX.writeFile(wb, `echipa_${new Date().toISOString().slice(0,10)}.xlsx`)
    }
    return (
      <div>
        <div className="section-header">
          <h2 className="section-title">👥 Echipă — Taskuri per Angajat</h2>
          <button onClick={exportEchipaExcel} style={{ padding: '9px 18px', background: '#1976d2', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>📊 Export Excel</button>
        </div>
        {employees.length === 0 && <p style={{ color: '#6b7280' }}>Nu sunt angajați.</p>}
        {employees.map(emp => {
          const empTasks = tasks.filter(t => { const a = Array.isArray(t.assigned_to) ? t.assigned_to : []; const ae = Array.isArray(t.assigned_to_emails) ? t.assigned_to_emails : []; return a.includes(emp.id) || ae.includes(emp.email) })
          const pending = empTasks.filter(isTaskOpen)
          const isOpen = expandedEmployees.has(emp.id)
          return (
            <div key={emp.id} style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', marginBottom: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
              <div onClick={() => toggleEmp(emp.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', cursor: 'pointer', userSelect: 'none' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{emp.full_name || emp.email}</div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{emp.email} · <span style={{ background: '#e3f2fd', color: '#1565c0', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>{emp.role}</span></div>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ textAlign: 'right', fontSize: 13 }}>
                    <span style={{ background: pending.length > 0 ? '#fff3e0' : '#e8f5e9', color: pending.length > 0 ? '#e65100' : '#2e7d32', padding: '2px 10px', borderRadius: 10, fontWeight: 700 }}>{pending.length} active</span>
                    <span style={{ marginLeft: 6, background: '#e8f5e9', color: '#2e7d32', padding: '2px 10px', borderRadius: 10, fontWeight: 700 }}>{empTasks.filter(t => !isTaskOpen(t)).length} finalizate</span>
                  </div>
                  <span style={{ fontSize: 18, color: '#374151' }}>{isOpen ? '▲' : '▼'}</span>
                </div>
              </div>
              {isOpen && (
                <div style={{ borderTop: '1px solid #f3f4f6', padding: '10px 16px 14px' }}>
                  {pending.length === 0 ? <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>Niciun task activ.</p> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {pending.sort((a,b) => { if (a.deadline && b.deadline) return new Date(a.deadline)-new Date(b.deadline); if (a.deadline) return -1; if (b.deadline) return 1; return 0 }).map(task => {
                        const job = jobs.find(j => j.id === task.job_id)
                        return (
                          <div key={task.id} onClick={() => { if (job) { setPreviousSection('echipa'); setSelectedJobId(job.id); setActiveSection('job_detail') } }} style={{ padding: '8px 12px', background: '#f9fafb', borderRadius: 7, border: '1px solid #e5e7eb', cursor: job ? 'pointer' : 'default', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{task.name}</div>
                              {job && <div style={{ fontSize: 12, color: '#1976d2' }}>📁 {job.name} {job.client_name && <strong style={{ color: '#333' }}>— {job.client_name}</strong>}</div>}
                            </div>
                            <div style={{ flexShrink: 0 }}>{task.deadline && dlBadge(task.deadline, true)}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const renderManageProfiles = () => (
    <div>
      <div className="section-header"><h2 className="section-title">👥 Profiluri & Angajați</h2><button onClick={() => setShowCreateProfile(s => !s)} style={{ padding: '9px 18px', background: '#16213e', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{showCreateProfile ? '✖ Anulează' : '+ Crează profil nou'}</button></div>

      {showCreateProfile && (
        <div style={{ marginBottom: 20, padding: 18, border: '2px solid #ff9800', borderRadius: 10, background: '#fff8f0' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Crează cont nou</h3>
          <form onSubmit={handleCreateNewProfile} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <input type="email" placeholder="Email" value={newProfileData.email} onChange={e => setNewProfileData(p => ({ ...p, email: e.target.value }))} required style={{ padding: '8px 11px', borderRadius: 6, border: '1px solid #ccc' }} />
            <input placeholder="Nume Complet" value={newProfileData.full_name} onChange={e => setNewProfileData(p => ({ ...p, full_name: e.target.value }))} required style={{ padding: '8px 11px', borderRadius: 6, border: '1px solid #ccc' }} />
            <input type="password" placeholder="Parolă" value={newProfileData.password} onChange={e => setNewProfileData(p => ({ ...p, password: e.target.value }))} required style={{ padding: '8px 11px', borderRadius: 6, border: '1px solid #ccc' }} />
            <input type="password" placeholder="Confirmă Parola" value={newProfileData.confirmPassword} onChange={e => setNewProfileData(p => ({ ...p, confirmPassword: e.target.value }))} required style={{ padding: '8px 11px', borderRadius: 6, border: '1px solid #ccc' }} />
            <select value={newProfileData.role} onChange={e => setNewProfileData(p => ({ ...p, role: e.target.value }))} style={{ padding: '8px 11px', borderRadius: 6, border: '1px solid #ccc' }}>
              <option value="employee">Colaborator</option><option value="admin">Admin</option><option value="ceo">CEO</option>
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={loading} style={{ flex: 1, padding: '9px', background: '#4caf50', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Crează</button>
              <button type="button" onClick={() => setShowCreateProfile(false)} style={{ flex: 1, padding: '9px', background: '#999', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Anulează</button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {profiles.length === 0 ? <p style={{ color: '#6b7280' }}>Nu sunt profiluri.</p> : profiles.map(profile => (
          <div key={profile.id} style={{ padding: 14, border: '1px solid #e0e0e0', borderRadius: 9, background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            {editingProfileId === profile.id ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="email" placeholder="Email" value={profileEdits.email || ''} onChange={e => setProfileEdits(p => ({ ...p, email: e.target.value }))} style={{ flex: '1 1 180px', padding: '6px 9px', borderRadius: 5, border: '1px solid #ccc' }} />
                <input placeholder="Nume" value={profileEdits.full_name || ''} onChange={e => setProfileEdits(p => ({ ...p, full_name: e.target.value }))} style={{ flex: '1 1 160px', padding: '6px 9px', borderRadius: 5, border: '1px solid #ccc' }} />
                <select value={profileEdits.role || 'employee'} onChange={e => setProfileEdits(p => ({ ...p, role: e.target.value }))} style={{ padding: '6px 9px', borderRadius: 5, border: '1px solid #ccc' }}><option value="employee">Colaborator</option><option value="admin">Admin</option><option value="ceo">CEO</option></select>
                <button onClick={() => saveProfile(profile.id)} style={{ padding: '6px 12px', background: '#4caf50', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12 }}>💾 Salvează</button>
                <button onClick={cancelEditProfile} style={{ padding: '6px 12px', background: '#999', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12 }}>Anulează</button>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{profile.full_name || '(Fără nume)'}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{profile.email}</div>
                  <div style={{ fontSize: 11, marginTop: 2 }}><span style={{ background: '#3949ab', color: '#fff', padding: '2px 7px', borderRadius: 8, fontWeight: 600 }}>{profile.role}</span></div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => startEditProfile(profile)} style={{ padding: '5px 11px', background: '#1976d2', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12, color: '#fff', fontWeight: 600 }}>✏️ Editează</button>
                  <button onClick={() => setProfileRole(profile.id, profile.role === 'admin' ? 'employee' : 'admin')} style={{ padding: '5px 11px', background: profile.role === 'admin' ? '#e65100' : '#2e7d32', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12, color: '#fff', fontWeight: 600 }}>{profile.role === 'admin' ? '⬇ Colaborator' : '⬆ Admin'}</button>
                  <button onClick={() => handleChangePassword(profile)} style={{ padding: '5px 11px', background: '#6a1b9a', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12, color: '#fff', fontWeight: 600 }}>🔑 Parolă</button>
                  <button onClick={() => deleteProfile(profile.id)} style={{ padding: '5px 11px', background: '#c62828', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12, color: '#fff', fontWeight: 600 }}>🗑️ Șterge</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <button onClick={fetchProfiles} style={{ padding: '7px 14px', background: '#374151', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>🔄 Reîmprospătează profile</button>
      </div>
    </div>
  )

  const renderCreateJobModal = () => (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowCreateWithTasks(false) }}>
      <div className="modal-box">
        <div className="modal-header">
          <span className="modal-title">Crează Lucrare Nouă</span>
          <button className="modal-close" onClick={() => setShowCreateWithTasks(false)}>✕</button>
        </div>
        <form onSubmit={handleCreateJob}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select value={jobNameType} onChange={e => setJobNameType(e.target.value)} required style={{ flex: '2 1 200px', padding: '8px 11px', borderRadius: 6, border: '1px solid #ccc' }}>
                <option value="">-- Tipul lucrării *</option>
                {JOB_NAME_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <select value={jobPriority} onChange={e => setJobPriority(e.target.value)} style={{ flex: '1 1 120px', padding: '8px 11px', borderRadius: 6, border: '1px solid #ccc' }}>
                <option value="normal">Normal</option><option value="repede">Repede</option><option value="urgent">Urgent</option>
              </select>
              <select value={jobCategory} onChange={e => setJobCategory(e.target.value)} style={{ flex: '1 1 150px', padding: '8px 11px', borderRadius: 6, border: '1px solid #ccc' }}>
                <option value="">Fără categorie</option>
                <option value="cadastru_sporadic">Cadastru Sporadic</option>
                <option value="cadastru_sistematic">Cadastru Sistematic</option>
                <option value="topografie">Topografie</option>
                <option value="administrativ">Administrativ</option>
              </select>
              <select value={jobResponsible} onChange={e => setJobResponsible(e.target.value)} style={{ flex: '1 1 200px', padding: '8px 11px', borderRadius: 6, border: '1px solid #ccc' }}>
                  <option value="">-- Responsabil lucrare</option>
                  {(profiles || []).map(p => <option key={p.id} value={p.id}>{displayUserLabel(p)}</option>)}
                </select>
            </div>
            {jobNameType === 'Altele' && (
              <input placeholder="Descrie tipul lucrării *" value={jobNameCustom} onChange={e => setJobNameCustom(e.target.value)} required style={{ padding: '8px 11px', borderRadius: 6, border: '1px solid #f59e0b', background: '#fffbeb' }} />
            )}
            <input placeholder="Nume client" value={clientname} onChange={e => setClientname(e.target.value)} style={{ padding: '8px 11px', borderRadius: 6, border: '1px solid #ccc' }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input placeholder="Serie buletin" value={clientIdSeries} onChange={e => setClientIdSeries(e.target.value)} style={{ flex: '1 1 110px', padding: '8px 11px', borderRadius: 6, border: '1px solid #ccc' }} />
              <input placeholder="CNP" value={clientCNP} onChange={e => setClientCNP(e.target.value)} style={{ flex: '1 1 110px', padding: '8px 11px', borderRadius: 6, border: '1px solid #ccc' }} />
              <input placeholder="Adresă" value={clientAddress} onChange={e => setClientAddress(e.target.value)} style={{ flex: '2 1 200px', padding: '8px 11px', borderRadius: 6, border: '1px solid #ccc' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input type="email" placeholder="Email client" value={clientemail} onChange={e => setClientemail(e.target.value)} style={{ flex: '1 1 170px', padding: '8px 11px', borderRadius: 6, border: '1px solid #ccc' }} />
              <input placeholder="Telefon client" value={clientPhone} onChange={e => setClientPhone(e.target.value)} style={{ flex: '1 1 130px', padding: '8px 11px', borderRadius: 6, border: '1px solid #ccc' }} />
              <input type="number" placeholder="Nr. ordine (opțional)" value={jobOrderNumber} onChange={e => setJobOrderNumber(e.target.value)} min="1" style={{ flex: '1 1 130px', padding: '8px 11px', borderRadius: 6, border: '1px solid #ccc' }} />
            </div>

            <div style={{ borderTop: '1px dashed #ddd', paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h4 style={{ margin: 0, fontSize: 14 }}>Taskuri (valoarea jobului = suma taskurilor)</h4>
                <button type="button" onClick={addNewJobTask} style={{ padding: '5px 11px', background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: 5, cursor: 'pointer', fontSize: 12, color: '#2e7d32' }}>+ Adaugă task</button>
              </div>
              {newJobTasks.map((t, i) => (
                <div key={i} style={{ marginBottom: 10, padding: 10, border: '1px solid #eee', borderRadius: 7, background: '#f9f9f9', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ flex: '1 1 280px' }}>
                    <input placeholder="Nume task *" value={t.name} onChange={e => updateNewJobTaskField(i, 'name', e.target.value)} required style={{ width: '100%', marginBottom: 5, padding: '7px 9px', borderRadius: 5, border: '1px solid #ccc' }} />
                    <textarea placeholder="Descriere" value={t.description || ''} onChange={e => updateNewJobTaskField(i, 'description', e.target.value)} style={{ width: '100%', minHeight: 70, padding: '7px 9px', borderRadius: 5, border: '1px solid #ccc' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 160 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><label style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Valoare:</label><input type="number" value={t.value} onChange={e => updateNewJobTaskField(i, 'value', e.target.value)} style={{ flex: 1, padding: '6px 8px', borderRadius: 5, border: '1px solid #ccc' }} step="0.01" min="0" /></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <label style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Deadline:</label>
                        {!t.noDeadline && <input type="datetime-local" value={t.deadline ? t.deadline.slice(0, 16) : ''} onChange={e => updateNewJobTaskField(i, 'deadline', e.target.value)} required style={{ flex: 1, padding: '6px 8px', borderRadius: 5, border: '1px solid #ccc' }} />}
                      </div>
                      <label style={{ fontSize: 11, color: '#666', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!t.noDeadline} onChange={e => { updateNewJobTaskField(i, 'noDeadline', e.target.checked); if (e.target.checked) updateNewJobTaskField(i, 'deadline', '') }} />
                        Fără termen
                      </label>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Asignare:</div>
                    <MultiAssignSelector profiles={profiles} selectedIds={t.assigned_to || []} onChange={v => updateNewJobTaskField(i, 'assigned_to', v)} />
                  </div>
                  <div style={{ width: '100%', borderTop: '1px solid #e5e7eb', paddingTop: 8, marginTop: 2, display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => removeNewJobTask(i)} style={{ fontSize: 12, color: '#c62828', background: '#ffebee', border: '1px solid #ffcdd2', borderRadius: 5, cursor: 'pointer', padding: '4px 12px', fontWeight: 600 }}>✕ Șterge task</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setShowCreateWithTasks(false)} style={{ padding: '9px 18px', background: '#f5f5f5', color: '#374151', border: '1px solid #ddd', borderRadius: 7, cursor: 'pointer', fontSize: 13 }}>Anulează</button>
            <button type="submit" disabled={loading} style={{ padding: '9px 22px', background: '#16213e', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Crează Lucrare</button>
          </div>
        </form>
      </div>
    </div>
  )

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
          {navItem('echipa', '👥', 'Echipă')}
          {navItem('calendar', '📅', 'Calendar')}
          {navItem('raport_lunar', '📊', 'Raport Lunar')}
          {navItem('profil_nou', '➕', 'Crează Profil Nou')}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user-name">{currentUserProfile?.full_name || user?.email || 'Admin'}</div>
          <div className="sidebar-user-role">{{ ceo: 'CEO', admin: 'Admin', employee: 'Colaborator' }[user?.role] || 'Admin'}</div>
          <button className="sidebar-logout-btn" onClick={handleLogout}>🚪 Ieși din cont</button>
        </div>
      </aside>

      <main className="app-main" onClick={() => { if (taskMenuOpen) setTaskMenuOpen(null) }}>
        {loading && <div style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>Se încarcă...</div>}
        {error && <div className="dash-alert dash-alert-error">{error}<button onClick={() => setError(null)}>✕</button></div>}
        {message && <div className="dash-alert dash-alert-success">{message}<button onClick={() => setMessage(null)}>✕</button></div>}

        {activeSection === 'home' && renderHome()}
        {activeSection === 'profil' && renderProfil()}
        {activeSection === 'lucrari' && renderSection(jobs, 'Toate Lucrările', '📁', '')}
        {activeSection === 'lucrari/cadastru_sporadic' && renderSection(jobs.filter(j => j.category === 'cadastru_sporadic'), 'Cadastru Sporadic', '📍', 'cadastru_sporadic')}
        {activeSection === 'lucrari/cadastru_sistematic' && renderSection(jobs.filter(j => j.category === 'cadastru_sistematic'), 'Cadastru Sistematic', '🗺️', 'cadastru_sistematic')}
        {activeSection === 'lucrari/topografie' && renderSection(jobs.filter(j => j.category === 'topografie'), 'Topografie', '⛰️', 'topografie')}
        {activeSection === 'lucrari_finalizate' && (
          <div>
            <div className="section-header"><h2 className="section-title">✅ Lucrări Finalizate <span style={{ fontSize: 14, fontWeight: 400, color: '#777' }}>({completedJobs.length})</span></h2></div>
            <JobExplorer jobs={jobs} tasks={tasks} dlBadge={dlBadge} storageKey={"jobs-admin-finalizate"} onOpen={job => { setPreviousSection(activeSection); setSelectedJobId(job.id); setActiveSection('job_detail') }} renderCards={(rows, opts) => renderJobList(rows, opts)} responsibleName={responsibleName} defaultStatus="completed" />
          </div>
        )}
        {activeSection === 'administrativ' && renderSection(jobs.filter(j => j.category === 'administrativ'), 'Administrativ', '📋', 'administrativ')}
        {activeSection === 'calendar' && renderCalendar()}
        {activeSection === 'echipa' && renderEchipa()}
        {activeSection === 'raport_lunar' && renderMonthlyReport()}
        {activeSection === 'profil_nou' && renderManageProfiles()}
        {activeSection === 'job_detail' && renderJobDetail()}
      </main>

      <button className="sidebar-mobile-toggle" onClick={() => setMobileSidebarOpen(s => !s)} style={{ display: isMobile ? 'flex' : 'none' }}>☰</button>

      {showCreateWithTasks && renderCreateJobModal()}
    </div>
  )
}

export default AdminDashboard
