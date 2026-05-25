import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import supabase from '../supabase-client'
import { sendJobCompletionEmail, sendTaskCompletionEmail, areAllTasksCompleted } from '../emailService'
import './AdminDashboard.css'

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

  // Stare pentru creare job + taskuri
  const [showCreateWithTasks, setShowCreateWithTasks] = useState(false)
  const [jobname, setJobname] = useState('')
  const [clientname, setClientname] = useState('')
  const [clientemail, setClientemail] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [jobPriority, setJobPriority] = useState('normal')
  const [jobValue, setJobValue] = useState('')
  const [jobOrderNumber, setJobOrderNumber] = useState('')
  const [clientIdSeries, setClientIdSeries] = useState('')
  const [clientCNP, setClientCNP] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [newJobTasks, setNewJobTasks] = useState([{ name: '', description: '', assigned_to: [], estimated_hours: '', deadline: '' }])

  // Stare pentru job expandat
  const [expandedJob, setExpandedJob] = useState(null)
  const [editingJobId, setEditingJobId] = useState(null)
  const [jobEdits, setJobEdits] = useState({})
  const [amountPaidDraft, setAmountPaidDraft] = useState({})

  // Stare pentru task expandat și editare
  const [expandedTask, setExpandedTask] = useState(null)
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [taskEdits, setTaskEdits] = useState({})
  // Stare pentru overflow (detalii lungi) per task
  const [overflowTask, setOverflowTask] = useState(null)
  // Meniu de actiuni per task (mobil) si detectare device mobil
  const [taskMenuOpen, setTaskMenuOpen] = useState(null)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 700 : false)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 700)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Stare pentru adăugare task la job existent
  const [addingTaskToJob, setAddingTaskToJob] = useState(null)
  const [newTaskData, setNewTaskData] = useState({ name: '', description: '', assigned_to: [], estimated_hours: '', deadline: '' })

  // Stare gestionare angajați
  const [showEmployeeManagement, setShowEmployeeManagement] = useState(false)
  const [editingProfileId, setEditingProfileId] = useState(null)
  const [profileEdits, setProfileEdits] = useState({})

  // Stare creare profil nou
  const [showCreateProfile, setShowCreateProfile] = useState(false)
  const [newProfileData, setNewProfileData] = useState({ email: '', password: '', confirmPassword: '', full_name: '', role: 'employee' })

  // Stare calendar
  const [showCalendar, setShowCalendar] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user: u } } = await supabase.auth.getUser()
      setUser(u)
    }
    getUser()
    fetchData()
  }, [])

  const handleLogout = () => {
    try { localStorage.removeItem('access_token') } catch (e) {}
    navigate('/')
    setTimeout(() => window.location.reload(), 50)
  }


  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [jobsRes, tasksRes, profilesRes, usersRes] = await Promise.all([
        supabase.from('jobs').select('*').order('created_at', { ascending: false }),
        supabase.from('tasks').select('*').order('created_at', { ascending: true }),
        supabase.from('profiles').select('id, email, full_name, role, created_at'),
        fetch('/api/users').then(async (response) => {
          if (!response.ok) return { data: [], error: new Error('Failed to load users') }
          const body = await response.json()
          return { data: body.users || [], error: null }
        })
      ])
      if (jobsRes.error) throw jobsRes.error
      if (tasksRes.error) throw tasksRes.error
      if (profilesRes.error) throw profilesRes.error
      if (usersRes.error) throw usersRes.error

      const profilesData = profilesRes.data || []
      const usersData = usersRes.data || []

      // Normalize assigned_to to always be an array (DB might have scalar or array)
      const tasksNormalized = (tasksRes.data || []).map(t => {
        let assigned = []
        if (Array.isArray(t.assigned_to)) assigned = t.assigned_to
        else if (t.assigned_to) assigned = [t.assigned_to]
        const assignedEmails = Array.isArray(t.assigned_to_emails) ? t.assigned_to_emails : (t.assigned_to_email ? [t.assigned_to_email] : assigned.map(pid => (profilesData.find(p => p.id === pid) || {}).email).filter(Boolean))
        return { ...t, assigned_to: assigned, assigned_to_emails: assignedEmails }
      })

      setJobs(jobsRes.data || [])
      setTasks(tasksNormalized)
      setProfiles(profilesData)
      setUsers(usersData)
    } catch (err) {
      console.error(err)
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
      setMessage('✅ Profile reîmprospătate!')
      setTimeout(() => setMessage(null), 2000)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Eroare la încărcare profile')
    } finally {
      setLoading(false)
    }
  }

  // Helper pentru formatare utilizator
  const displayUserLabel = (profile) => {
    if (!profile) return '(Neasignat)'
    return profile.full_name ? `${profile.full_name} (${profile.email})` : profile.email
  }

  // Multi-assign selector (checkbox list) to allow easy multi-selection
  const MultiAssignSelector = ({ profiles, selectedIds = [], onChange }) => {
    const toggle = (id) => {
      const curr = Array.isArray(selectedIds) ? [...selectedIds] : []
      const idx = curr.indexOf(id)
      if (idx === -1) curr.push(id)
      else curr.splice(idx, 1)
      onChange(curr)
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflow: 'auto' }}>
        {(profiles || []).map(p => (
          <label key={p?.id} style={{ fontSize: 13 }}>
            <input type="checkbox" checked={Array.isArray(selectedIds) && selectedIds.includes(p.id)} onChange={() => toggle(p.id)} />{' '}
            {displayUserLabel(p)}
          </label>
        ))}
      </div>
    )
  }

  // Helper pentru durata estimată
  const formatDuration = (hours) => {
    if (!hours || hours <= 0) return '0h'
    const days = Math.floor(hours / 8)
    const remainingHours = hours % 8
    const minutes = Math.round((remainingHours % 1) * 60)
    const wholeHours = Math.floor(remainingHours)
    
    let result = ''
    if (days > 0) result += `${days}z `
    if (wholeHours > 0) result += `${wholeHours}h `
    if (minutes > 0) result += `${minutes}m`
    return result.trim() || '0h'
  }

  const calculateEstimatedDate = (hours) => {
    if (!hours || hours <= 0) return null
    const now = new Date()
    let workingHours = hours
    let currentDate = new Date(now)
    
    while (workingHours > 0) {
      const dayOfWeek = currentDate.getDay()
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        workingHours -= 8
      }
      if (workingHours > 0) {
        currentDate.setDate(currentDate.getDate() + 1)
      }
    }
    return currentDate
  }

  const formatEstimatedDate = (hours) => {
    const date = calculateEstimatedDate(hours)
    if (!date) return ''
    return date.toLocaleDateString('ro-RO', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  // Creare job cu taskuri
  const handleCreateJob = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
        const fullClientName = clientname || ''

      const { data: newJob, error: jobErr } = await supabase.from('jobs').insert([{
        name: jobname,
        priority: jobPriority || 'normal',
        client_name: fullClientName,
        client_phone: clientPhone || null,
        client_id_series: clientIdSeries || null,
        client_cnp: clientCNP || null,
        client_address: clientAddress || null,
        client_email: clientemail || null,
        status: 'todo',
        created_by: user.id,
        total_value: jobValue ? parseFloat(jobValue) : 0,
        order_number: jobOrderNumber ? parseInt(jobOrderNumber, 10) : null
      }]).select()
      if (jobErr) throw jobErr

      const jobId = newJob[0].id
      const filteredTasks = newJobTasks.filter(t => t.name && t.name.trim())
      // Preserve client-side creation order for tasks inserted in bulk by
      // setting explicit incremental `created_at` timestamps (1ms increments).
      const baseCreatedAt = Date.now()
      const tasksToInsert = filteredTasks.map((t, i) => ({
        job_id: jobId,
        name: t.name,
        description: t.description || null,
        status: 'todo',
        // write assigned_to as array (Admin selects multiple)
        assigned_to: Array.isArray(t.assigned_to) ? t.assigned_to : (t.assigned_to ? [t.assigned_to] : []),
        // keep assigned_to_emails null for DB (can be populated by a trigger or later job)
        assigned_to_emails: null,
        estimated_hours: t.estimated_hours ? parseFloat(t.estimated_hours) : null,
        value: null,
        deadline: t.deadline ? (new Date(t.deadline)).toISOString() : null,
        created_by: user.id,
        created_at: new Date(baseCreatedAt + i).toISOString()
      }))

      // Safe insert: try inserting as-is (with arrays). If the DB still
      // has a scalar `assigned_to` column, Postgres may return a 22P02
      // invalid-input error (array sent to uuid). In that case, retry
      // by sending only the first assignee (backwards-compatible).
      const attemptInsertTasks = async (rows) => {
        try {
          const { data: insertedTasks, error: tasksErr } = await supabase.from('tasks').insert(rows).select()
          if (tasksErr) throw tasksErr
          return insertedTasks
        } catch (err) {
          // detect Postgres UUID array mismatch error
          if (err?.message && err.message.includes('invalid input syntax for type uuid')) {
            const transformed = rows.map(r => ({ ...r, assigned_to: Array.isArray(r.assigned_to) && r.assigned_to.length > 0 ? r.assigned_to[0] : r.assigned_to }))
            const { data: retried, error: retryErr } = await supabase.from('tasks').insert(transformed).select()
            if (retryErr) throw retryErr
            return retried
          }
          throw err
        }
      }

      if (tasksToInsert.length > 0) {
        await attemptInsertTasks(tasksToInsert)
      }

      setJobname('')
      setClientname('')
      setJobPriority('normal')
      setClientIdSeries('')
      setClientCNP('')
      setClientAddress('')
      setClientemail('')
      setClientPhone('')
      setNewJobTasks([{ name: '', description: '', assigned_to: [], estimated_hours: '' }])
      setJobOrderNumber('')
      setShowCreateWithTasks(false)
      setMessage('✅ Job și taskuri create!')
      setTimeout(() => setMessage(null), 3000)
      fetchData()
    } catch (err) {
      console.error(err)
      setError(err.message || 'Eroare la creare job')
    } finally {
      setLoading(false)
    }
  }

  const updateNewJobTaskField = (idx, field, value) => {
    setNewJobTasks(prev => {
      const copy = [...prev]
      copy[idx][field] = value
      return copy
    })
  }

  const addNewJobTask = () => {
    setNewJobTasks(prev => [...prev, { name: '', description: '', assigned_to: [], estimated_hours: '', deadline: '' }])
  }

  const removeNewJobTask = (idx) => {
    setNewJobTasks(prev => prev.filter((_, i) => i !== idx))
  }

  // Editare job
  const startEditJob = (job) => {
    setEditingJobId(job.id)
    setJobEdits({
      name: job.name,
      priority: job.priority || 'normal',
      client_name: job.client_name || '',
      client_phone: job.client_phone || '',
      client_id_series: job.client_id_series || '',
      client_cnp: job.client_cnp || '',
      client_address: job.client_address || '',
      client_email: job.client_email || '',
      status: job.status,
      total_value: job.total_value != null ? job.total_value : '',
      amount_paid: job.amount_paid != null ? job.amount_paid : '',
      order_number: job.order_number != null ? job.order_number : ''
    })
  }

  const cancelEditJob = () => {
    setEditingJobId(null)
    setJobEdits({})
  }

  const saveJob = async (jobId) => {
    setLoading(true)
    setError(null)
    try {
      const updates = {}
      if (jobEdits.name !== undefined) updates.name = jobEdits.name
      if (jobEdits.client_name !== undefined) updates.client_name = jobEdits.client_name
      if (jobEdits.client_email !== undefined) updates.client_email = jobEdits.client_email || null
      if (jobEdits.client_phone !== undefined) updates.client_phone = jobEdits.client_phone || null
      if (jobEdits.status !== undefined) updates.status = jobEdits.status
      /* Admin is not allowed to manually edit job total here; total_value is
         calculated from task values and updated automatically. */
      // Allow admins to set/override job total_value manually when editing
      // (will be persisted to `jobs.total_value`). Note: task updates still
      // recalculate total_value based on task.value and may overwrite this
      // manual value if tasks are edited afterwards.
      if (jobEdits.total_value !== undefined) updates.total_value = jobEdits.total_value !== '' ? parseFloat(jobEdits.total_value) : null
      if (jobEdits.amount_paid !== undefined) updates.amount_paid = jobEdits.amount_paid !== '' ? parseFloat(jobEdits.amount_paid) : 0
      if (jobEdits.order_number !== undefined) updates.order_number = jobEdits.order_number !== '' ? parseInt(jobEdits.order_number, 10) : null
        // client_first_name and client_last_name are no longer updated
      if (jobEdits.priority !== undefined) updates.priority = jobEdits.priority || 'normal'
      if (jobEdits.client_id_series !== undefined) updates.client_id_series = jobEdits.client_id_series || null
      if (jobEdits.client_cnp !== undefined) updates.client_cnp = jobEdits.client_cnp || null
      if (jobEdits.client_address !== undefined) updates.client_address = jobEdits.client_address || null
      // job-level description removed; task-level descriptions are used instead

      const { data, error: updErr } = await supabase.from('jobs').update(updates).eq('id', jobId).select()
      if (updErr) throw updErr
      setJobs(prev => prev.map(j => j.id === jobId ? data[0] : j))
      setEditingJobId(null)
      setJobEdits({})
      setMessage('✅ Job actualizat!')
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Eroare la actualizare job')
    } finally {
      setLoading(false)
    }
  }

  const deleteJob = async (jobId) => {
    if (!window.confirm('Sigur vrei să ștergi acest job? Toate taskurile asociate vor fi șterse!')) return
    setLoading(true)
    setError(null)
    try {
      await supabase.from('tasks').delete().eq('job_id', jobId)
      const { error: delErr } = await supabase.from('jobs').delete().eq('id', jobId)
      if (delErr) throw delErr
      setJobs(prev => prev.filter(j => j.id !== jobId))
      setTasks(prev => prev.filter(t => t.job_id !== jobId))
      setMessage('✅ Job șters!')
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Eroare la ștergere job')
    } finally {
      setLoading(false)
    }
  }

  const handleAmountPaidChange = (jobId, value) => {
    setAmountPaidDraft(prev => ({ ...prev, [jobId]: value }))
  }

  const saveAmountPaid = async (jobId) => {
    const raw = amountPaidDraft[jobId]
    const parsed = raw === '' || raw == null ? 0 : parseFloat(raw)
    setLoading(true)
    setError(null)
    try {
      const { data, error: updErr } = await supabase.from('jobs').update({ amount_paid: isNaN(parsed) ? 0 : parsed }).eq('id', jobId).select()
      if (updErr) throw updErr
      const updated = data && data[0] ? data[0] : null
      if (updated) setJobs(prev => prev.map(j => j.id === jobId ? updated : j))
      setMessage('✅ Bani încasați actualizați')
      setTimeout(() => setMessage(null), 2500)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Eroare la actualizare încasări')
    } finally {
      setLoading(false)
    }
  }

  // Editare task
  const startEditTask = (task) => {
    setEditingTaskId(task.id)
    setTaskEdits({
      name: task.name,
      description: task.description || '',
      status: task.status,
      assigned_to: Array.isArray(task.assigned_to) ? task.assigned_to : task.assigned_to ? [task.assigned_to] : [],
      estimated_hours: task.estimated_hours || '',
      deadline: task.deadline || ''
    })
  }

  const cancelEditTask = () => {
    setEditingTaskId(null)
    setTaskEdits({})
  }

  const saveTask = async (taskId) => {
    setLoading(true)
    setError(null)
    try {
      const updates = {}
      if (taskEdits.name !== undefined) updates.name = taskEdits.name
      if (taskEdits.description !== undefined) updates.description = taskEdits.description
      if (taskEdits.status !== undefined) updates.status = taskEdits.status
      // assignments are stored in tasks.assigned_to array column; include them in updates
      if (taskEdits.assigned_to !== undefined) {
        updates.assigned_to = Array.isArray(taskEdits.assigned_to) ? taskEdits.assigned_to : taskEdits.assigned_to ? [taskEdits.assigned_to] : []
      }
      if (taskEdits.estimated_hours !== undefined) {
        updates.estimated_hours = taskEdits.estimated_hours ? parseFloat(taskEdits.estimated_hours) : null
      }
      if (taskEdits.deadline !== undefined) {
        updates.deadline = taskEdits.deadline ? (new Date(taskEdits.deadline)).toISOString() : null
      }

      // Try update, if DB expects scalar uuid for `assigned_to` and errors,
      // retry with first element to remain compatible until migration runs.
      let data
      try {
        const res = await supabase.from('tasks').update(updates).eq('id', taskId).select()
        if (res.error) throw res.error
        data = res.data
      } catch (err) {
        if (err?.message && err.message.includes('invalid input syntax for type uuid')) {
          const backCompat = { ...updates }
          if (Array.isArray(backCompat.assigned_to)) backCompat.assigned_to = backCompat.assigned_to.length > 0 ? backCompat.assigned_to[0] : null
          const res2 = await supabase.from('tasks').update(backCompat).eq('id', taskId).select()
          if (res2.error) throw res2.error
          data = res2.data
        } else {
          throw err
        }
      }
      const { data: refreshedArr, error: refErr } = await supabase.from('tasks').select('*').eq('id', taskId).single()
      if (refErr) throw refErr
      const refreshedTask = refreshedArr
      const assignedIds = Array.isArray(refreshedTask.assigned_to) ? refreshedTask.assigned_to : (refreshedTask.assigned_to ? [refreshedTask.assigned_to] : [])
      const assignedEmails = assignedIds.map(pid => (profiles.find(p => p.id === pid) || {}).email).filter(Boolean)
      const newTaskObj = { ...refreshedTask, assigned_to: assignedIds, assigned_to_emails: assignedEmails }
      setTasks(prev => prev.map(t => t.id === taskId ? newTaskObj : t))
      setEditingTaskId(null)
      setTaskEdits({})
      setMessage('✅ Task actualizat!')
      setTimeout(() => setMessage(null), 3000)
      // recalc job total in case task value changed
      if (data && data[0] && data[0].job_id) {
        const jobId = data[0].job_id
        const { data: jobTasks, error } = await supabase.from('tasks').select('value').eq('job_id', jobId)
        if (!error) {
          const total = (jobTasks || []).reduce((s, t) => s + (parseFloat(t.value) || 0), 0)
          await supabase.from('jobs').update({ total_value: total }).eq('id', jobId)
          setJobs(prev => prev.map(j => j.id === jobId ? { ...j, total_value: total } : j))
        }
      }
    } catch (err) {
      console.error(err)
      setError(err.message || 'Eroare la actualizare task')
    } finally {
      setLoading(false)
    }
  }

  const deleteTask = async (taskId) => {
    if (!window.confirm('Sigur vrei să ștergi acest task?')) return
    setLoading(true)
    setError(null)
    try {
      const task = tasks.find(t => t.id === taskId)
      const { error: delErr } = await supabase.from('tasks').delete().eq('id', taskId)
      if (delErr) throw delErr
      setTasks(prev => prev.filter(t => t.id !== taskId))
      setMessage('✅ Task șters!')
      setTimeout(() => setMessage(null), 3000)
      if (task && task.job_id) {
        // recalc job total
        const { data: jobTasks, error } = await supabase.from('tasks').select('value').eq('job_id', task.job_id)
        if (!error) {
          const total = (jobTasks || []).reduce((s, t) => s + (parseFloat(t.value) || 0), 0)
          await supabase.from('jobs').update({ total_value: total }).eq('id', task.job_id)
          setJobs(prev => prev.map(j => j.id === task.job_id ? { ...j, total_value: total } : j))
        }
      }
    } catch (err) {
      console.error(err)
      setError(err.message || 'Eroare la ștergere task')
    } finally {
      setLoading(false)
    }
  }

  const toggleComplete = async (task) => {
    const newStatus = task.status === 'completed' ? 'todo' : 'completed'
    const job = jobs.find(j => j.id === task.job_id)

    if (newStatus === 'completed') {
      const existingCompleters = Array.isArray(task.completers) ? task.completers.slice() : (
        task.completed_by ? [{ id: task.completed_by, email: task.completed_by_email, completed_at: task.completed_at }] : []
      )
      const already = existingCompleters.find(c => c.id === user.id)
      if (already) {
        setMessage('✅ Ai marcat deja acest task ca finalizat')
        setTimeout(() => setMessage(null), 3000)
        return
      }
      if (existingCompleters.length >= 2) {
        setMessage('⚠️ Acest task are deja doi finalizatori')
        setTimeout(() => setMessage(null), 3000)
        return
      }
      const newCompleter = { id: user.id, email: user.email, completed_at: new Date().toISOString() }
      const newCompleters = existingCompleters.concat([newCompleter])
      const taskValue = task.value != null ? parseFloat(task.value) : null
      if (taskValue != null) {
        const share = parseFloat((taskValue / newCompleters.length).toFixed(2))
        newCompleters.forEach(c => { c.amount = share })
      }
      var updates = { status: 'completed', completed_at: newCompleters[0] ? newCompleters[0].completed_at : new Date().toISOString(), completers: newCompleters, completed_by: newCompleters[0] ? newCompleters[0].id : null, completed_by_email: newCompleters[0] ? newCompleters[0].email : null }
    } else {
      // undo: clear completers and legacy fields
      var updates = { status: 'todo', completed_at: null, completers: [], completed_by: null, completed_by_email: null }
    }
    setLoading(true)
    try {
      const { data, error: err } = await supabase.from('tasks').update(updates).eq('id', task.id).select()
      if (err) throw err
      
      // Actualizează lista de task-uri
      const updatedTasks = tasks.map(t => t.id === task.id ? data[0] : t)
      setTasks(updatedTasks)
      
      // Dacă e completat, trimite email pentru JOB doar când toate taskurile sunt finalizate
      if (newStatus === 'completed') {
        // Trimite email pentru TASK (fiecare task la finalizare)
        try {
          await sendTaskCompletionEmail({
            to: job && job.client_email ? job.client_email : null,
            clientName: job && job.client_name ? job.client_name : null,
            jobName: job ? job.name : null,
            taskName: data[0].name,
            taskDescription: data[0].description,
            taskValue: data[0].value,
            completedAt: data[0].completed_at
          })
        } catch (err) {
          console.warn('Task email failed', err)
        }

        const job = jobs.find(j => j.id === task.job_id)
        // use the updatedTasks array to determine completion state
        if (job && job.client_email) {
          const allCompleted = areAllTasksCompleted(updatedTasks, task.job_id)
          if (allCompleted) {
            const jobTasks = updatedTasks.filter(t => t.job_id === task.job_id)
            const totalValue = (jobTasks || []).reduce((s, t) => s + (parseFloat(t.value) || 0), 0)
            const completedAt = new Date().toISOString()
            // send job email (no PDF by default)
            // mark job as completed in DB (so UI can depend on job.status too)
            try {
              await supabase.from('jobs').update({ status: 'completed', completed_at: completedAt }).eq('id', job.id)
              setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'completed', completed_at: completedAt } : j))
            } catch (updErr) {
              console.warn('Could not update job status to completed', updErr)
            }

            sendJobCompletionEmail({
              to: job.client_email,
              clientName: job.client_name,
              jobName: job.name,
              tasks: jobTasks,
              totalValue,
              completedAt,
              // legacy first/last removed; frontend uses clientName only
              clientCNP: job.client_cnp,
              clientSeries: job.client_id_series,
              clientAddress: job.client_address
            }).then(res => {
              if (res && !res.ok) console.warn('⚠️ Job email failed', res)
            }).catch(err => console.error('Job email error', err))
          }
        }
      }
    } catch (err) {
      console.error(err)
      setError(err.message || 'Eroare la actualizare status')
    } finally {
      setLoading(false)
    }
  }

  // Adăugare task la job existent
  const startAddTaskToJob = (jobId) => {
    setAddingTaskToJob(jobId)
    setNewTaskData({ name: '', description: '', assigned_to: [], estimated_hours: '', deadline: '' })
  }

  const cancelAddTask = () => {
    setAddingTaskToJob(null)
    setNewTaskData({ name: '', description: '', assigned_to: [], estimated_hours: '', deadline: '' })
  }

  const handleAddTask = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const assignedArr = Array.isArray(newTaskData.assigned_to) ? newTaskData.assigned_to : newTaskData.assigned_to ? [newTaskData.assigned_to] : []
      const taskToInsert = {
        job_id: addingTaskToJob,
        name: newTaskData.name,
        status: 'todo',
        description: newTaskData.description || null,
        assigned_to: assignedArr.length > 0 ? assignedArr : null,
        assigned_to_emails: null,
        estimated_hours: newTaskData.estimated_hours ? parseFloat(newTaskData.estimated_hours) : null,
        value: null,
        deadline: newTaskData.deadline ? (new Date(newTaskData.deadline)).toISOString() : null,
        created_by: user.id
      }
      // Insert with same safe-retry logic as bulk insert
      try {
        const { data: inserted, error: addErr } = await supabase.from('tasks').insert([taskToInsert]).select()
        if (addErr) throw addErr
      } catch (err) {
        if (err?.message && err.message.includes('invalid input syntax for type uuid')) {
          const transformed = { ...taskToInsert, assigned_to: Array.isArray(taskToInsert.assigned_to) && taskToInsert.assigned_to.length > 0 ? taskToInsert.assigned_to[0] : taskToInsert.assigned_to }
          const { data: retried, error: retryErr } = await supabase.from('tasks').insert([transformed]).select()
          if (retryErr) throw retryErr
        } else {
          throw err
        }
      }

      setNewTaskData({ name: '', description: '', assigned_to: [], estimated_hours: '', deadline: '' })
      setAddingTaskToJob(null)
      setMessage('✅ Task adăugat!')
      setTimeout(() => setMessage(null), 3000)
      fetchData()
    } catch (err) {
      console.error('Add task error', err)
      setError(err.message || 'Eroare la adăugare task')
    } finally {
      setLoading(false)
    }
  }

  // Gestionare angajați (profiles)
  const startEditProfile = (profile) => {
    setEditingProfileId(profile.id)
    setProfileEdits({
      email: profile.email || '',
      full_name: profile.full_name || '',
      role: profile.role || 'employee'
    })
  }

  const cancelEditProfile = () => {
    setEditingProfileId(null)
    setProfileEdits({})
  }

  const saveProfile = async (profileId) => {
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('access_token')
      const payload = {}
      if (profileEdits.email !== undefined) payload.email = profileEdits.email
      if (profileEdits.full_name !== undefined) payload.full_name = profileEdits.full_name
      if (profileEdits.role !== undefined) payload.role = profileEdits.role

      const resp = await fetch(`/api/profiles/${profileId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify(payload)
      })
      const body = await resp.json()
      if (!resp.ok) throw new Error(body.error || 'Eroare la actualizare profil')

      setProfiles(prev => prev.map(p => p.id === profileId ? body.profile : p))
      setEditingProfileId(null)
      setProfileEdits({})
      setMessage('✅ Profil actualizat cu succes!')
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Eroare la actualizare profil')
    } finally {
      setLoading(false)
    }
  }

  const deleteProfile = async (profileId) => {
    const profile = profiles.find(p => p.id === profileId)

    // Protejează contul CEO principal
    if (profile?.email === 'overviewview8@gmail.com') {
      setError('❌ Nu poți șterge contul CEO principal!')
      setTimeout(() => setError(null), 3000)
      return
    }

    if (!window.confirm('Sigur vrei să ștergi acest angajat? Se va șterge și din auth.users!\n\nAceastă acțiune este ireversibilă!')) return

    setLoading(true)
    setError(null)
    try {
      // First, delete from auth.users using API endpoint
      const deleteAuthResponse = await fetch('/api/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profileId })
      })

      if (!deleteAuthResponse.ok) {
        const errData = await deleteAuthResponse.json()
        throw new Error(errData.error || 'Failed to delete from auth.users')
      }

      // Then delete from profiles table
      const { error: delErr } = await supabase.from('profiles').delete().eq('id', profileId)
      if (delErr) throw delErr

      setProfiles(prev => prev.filter(p => p.id !== profileId))
      setMessage('✅ Angajat șters cu succes din auth.users și profiles!')
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Eroare la ștergere angajat')
    } finally {
      setLoading(false)
    }
  }

  // Funcții creare profil nou
  const handleCreateNewProfile = async (e) => {
    e.preventDefault()
    setError(null)
    setMessage(null)

    // Normalize & validări
    const email = (newProfileData.email || '').trim().toLowerCase()
    const full_name = (newProfileData.full_name || '').trim()
    const password = newProfileData.password || ''
    const confirmPassword = newProfileData.confirmPassword || ''

    if (!email || !password || !full_name) {
      setError('❌ Email, parolă și nume sunt obligatorii!')
      return
    }

    if (password !== confirmPassword) {
      setError('❌ Parolele nu se potrivesc!')
      return
    }

    if (password.length < 6) {
      setError('❌ Parola trebuie să aibă cel puțin 6 caractere!')
      return
    }

    setLoading(true)

    try {
      const token = localStorage.getItem('access_token')
      const resp = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          email,
          password,
          full_name,
          role: newProfileData.role
        })
      })

      const body = await resp.json()
      if (!resp.ok) throw new Error(body.error || 'Eroare la crearea profilului')

      // Success
      setMessage('✅ Profil nou creat cu succes!')
      setNewProfileData({ email: '', password: '', confirmPassword: '', full_name: '', role: 'employee' })
      setShowCreateProfile(false)
      
      // Refresh profiles list
      await fetchProfiles()
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Eroare la crearea profilului')
    } finally {
      setLoading(false)
    }
  }

  // Funcții calendar
  const getDaysInMonth = (date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()
    
    return { daysInMonth, startingDayOfWeek, year, month }
  }

  const getTasksForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0]
    return tasks.filter(task => {
      if (task.completed_at) {
        const completedDate = new Date(task.completed_at).toISOString().split('T')[0]
        if (completedDate === dateStr) return true
      }
      if (task.created_at) {
        const createdDate = new Date(task.created_at).toISOString().split('T')[0]
        if (createdDate === dateStr) return true
      }
      if (task.estimated_hours) {
        const estimatedDate = calculateEstimatedDate(task.estimated_hours)
        if (estimatedDate && estimatedDate.toISOString().split('T')[0] === dateStr) return true
      }
      return false
    })
  }

  const getJobsForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0]
    return jobs.filter(job => {
      if (job.completed_at) {
        const completedDate = new Date(job.completed_at).toISOString().split('T')[0]
        if (completedDate === dateStr) return true
      }
      if (job.created_at) {
        const createdDate = new Date(job.created_at).toISOString().split('T')[0]
        if (createdDate === dateStr) return true
      }
      return false
    })
  }

  const downloadPdfForJob = async (job) => {
    try {
      // Try to assign a sequential order number via DB RPC. If it fails,
      // fall back to any existing job.order_number or omit.
      let assignedOrder = null
      try {
        const rpcRes = await supabase.rpc('assign_job_order', { p_job_id: job.id })
        if (rpcRes && rpcRes.data != null) {
          // rpc may return scalar or array; handle both
          if (Array.isArray(rpcRes.data)) assignedOrder = rpcRes.data[0]
          else assignedOrder = rpcRes.data
        }
      } catch (rpcErr) {
        console.warn('assign_job_order RPC failed', rpcErr)
      }

      const jobTasks = tasks.filter(t => t.job_id === job.id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      const totalValue = (jobTasks || []).reduce((s, t) => s + (parseFloat(t.value) || 0), 0)
      const pdfData = {
        template: 'blank',
        clientName: job.client_name,
        clientCNP: job.client_cnp || null,
        clientSeries: job.client_id_series || null,
        clientAddress: job.client_address || null,
        clientEmail: job.client_email || null,
        jobName: job.name,
        tasks: jobTasks,
        totalValue,
        completedAt: job.completed_at || new Date().toISOString(),
        receptionNumber: job.reception_number || job.receptionNumber || null,
        orderNumber: job.order_number != null ? job.order_number : (assignedOrder != null ? assignedOrder : null)
      }
      // generate client-side and download
      const { generateAndDownloadPdf } = await import('../utils/generatePdfClient')
      const res = await generateAndDownloadPdf(pdfData)
      if (!res || !res.ok) {
        setError(res && res.error ? res.error : 'Eroare generare PDF')
      }
    } catch (err) {
      console.error('downloadPdfForJob error', err)
      setError(err.message || 'Eroare la descarcare PDF')
    }
  }

  const hasEventsOnDate = (date) => {
    return getTasksForDate(date).length > 0 || getJobsForDate(date).length > 0
  }

  const navigateMonth = (direction) => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev)
      newDate.setMonth(newDate.getMonth() + direction)
      return newDate
    })
  }

  const renderCalendar = () => {
    const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentMonth)
    const monthNames = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie']
    const dayNames = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm']
    
    const days = []
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} style={{ padding: 8 }}></div>)
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day)
      const hasEvents = hasEventsOnDate(date)
      const isToday = new Date().toDateString() === date.toDateString()
      const isSelected = selectedDate && selectedDate.toDateString() === date.toDateString()
      
      days.push(
        <div
          key={day}
          onClick={() => setSelectedDate(date)}
          style={{
            padding: 16,
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: isSelected ? '#2196F3' : isToday ? '#e3f2fd' : hasEvents ? '#fff3e0' : 'transparent',
            color: isSelected ? 'white' : isToday ? '#1976d2' : 'black',
            fontWeight: isToday || hasEvents ? 'bold' : 'normal',
            fontSize: 16,
            borderRadius: 8,
            position: 'relative',
            border: hasEvents ? '3px solid #ff9800' : isToday ? '3px solid #2196F3' : '1px solid #eee',
            minHeight: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {day}
          {hasEvents && !isSelected && (
            <div style={{
              position: 'absolute',
              bottom: 4,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 8,
              height: 8,
              backgroundColor: '#ff9800',
              borderRadius: '50%'
            }}></div>
          )}
        </div>
      )
    }
    
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999
      }}>
        <div style={{
          backgroundColor: 'white',
          border: '3px solid #2196F3',
          borderRadius: 12,
          padding: 24,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          maxWidth: 600,
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <button onClick={() => navigateMonth(-1)} style={{ fontSize: 20, padding: '8px 16px' }}>◀ Prev</button>
            <h2 style={{ margin: 0, fontSize: 24, color: '#2196F3' }}>{monthNames[month]} {year}</h2>
            <button onClick={() => navigateMonth(1)} style={{ fontSize: 20, padding: '8px 16px' }}>Next ▶</button>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 12 }}>
            {dayNames.map(name => (
              <div key={name} style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 14, padding: 8, color: '#666' }}>
                {name}
              </div>
            ))}
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
            {days}
          </div>
          
          {selectedDate && (
            <div style={{ marginTop: 24, borderTop: '2px solid #ddd', paddingTop: 20 }}>
              <h3 style={{ margin: '0 0 12px 0', color: '#2196F3', fontSize: 18 }}>
                📅 {selectedDate.toLocaleDateString('ro-RO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </h3>
              
              {getJobsForDate(selectedDate).length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <strong style={{ fontSize: 16 }}>📋 Jobs ({getJobsForDate(selectedDate).length}):</strong>
                  {getJobsForDate(selectedDate).map(job => (
                    <div key={job.id} style={{ fontSize: 14, marginLeft: 12, padding: 8, backgroundColor: '#f5f5f5', borderRadius: 6, marginTop: 6, border: '1px solid #ddd' }}>
                      • {job.name} - {job.client_name}
                    </div>
                  ))}
                </div>
              )}
              
              {getTasksForDate(selectedDate).length > 0 && (
                <div>
                  <strong style={{ fontSize: 16 }}>✅ Tasks ({getTasksForDate(selectedDate).length}):</strong>
                  {getTasksForDate(selectedDate).map(task => {
                    const job = jobs.find(j => j.id === task.job_id)
                    return (
                      <div key={task.id} style={{ fontSize: 14, marginLeft: 12, padding: 8, backgroundColor: task.status === 'completed' ? '#e8f5e9' : '#fff3e0', borderRadius: 6, marginTop: 6, border: '1px solid #ddd' }}>
                        • {task.name} {job && `(${job.name})`} - <strong>{task.status}</strong>
                      </div>
                    )
                  })}
                </div>
              )}
              
              {getJobsForDate(selectedDate).length === 0 && getTasksForDate(selectedDate).length === 0 && (
                <p style={{ fontSize: 14, color: '#999', margin: 0, fontStyle: 'italic' }}>Nu sunt evenimente în această zi.</p>
              )}
            </div>
          )}
          
          <button 
            onClick={() => { setShowCalendar(false); setSelectedDate(null) }} 
            style={{ 
              marginTop: 24, 
              width: '100%', 
              padding: '12px', 
              fontSize: 16, 
              backgroundColor: '#f44336', 
              color: 'white', 
              border: 'none', 
              borderRadius: 8, 
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            ❌ Închide Calendar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/Sigla.svg" alt="Sigla" style={{ width: 56, height: 56, objectFit: 'contain' }} />
          <h1>Admin Dashboard</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setShowCalendar(s => !s)} className="btn btn-primary">
            📅 Calendar
          </button>
          <button onClick={async () => {
          try {
            const { generateMonthlyReportCsv, downloadCsv } = await import('../utils/generateMonthlyReportCsv')
            const m = currentMonth.getMonth()
            const y = currentMonth.getFullYear()
            const csv = generateMonthlyReportCsv({ tasks, profiles, users, month: m, year: y })
            const filename = `monthly_report_${y}_${String(m+1).padStart(2,'0')}.csv`
            downloadCsv(csv, filename)
          } catch (e) {
            console.error('Export CSV error', e)
            setError(e.message || 'Eroare export CSV')
          }
        }} className="btn btn-secondary">
            ⤓ Export CSV lună curentă
          </button>
          <button onClick={handleLogout} className="btn btn-outline-danger">
            🚪 Logout
          </button>
        </div>
        {showCalendar && renderCalendar()}
      </div>

      <section style={{ marginBottom: 20 }}>
        <h3>Creare job</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowCreateWithTasks(s => !s)}
              className="btn btn-primary"
              style={{
                padding: '10px 16px',
                fontSize: '14px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap'
              }}
            >
              {showCreateWithTasks ? '✖️ Închide formular' : '➕ Creează job + taskuri'}
            </button>
            <div style={{ fontSize: 14, fontWeight: 'bold', color: profiles.length > 0 ? 'green' : 'red' }}>
              👥 Profiles: {profiles.length}
            </div>
            <button onClick={fetchProfiles} className="btn btn-secondary" style={{ fontSize: 12, padding: '8px 12px' }}>🔄 Reîmprospătează</button>
            <button onClick={() => setShowEmployeeManagement(s => !s)} className="btn btn-secondary" style={{ fontSize: 12, padding: '8px 12px', marginLeft: 'auto' }}>
              👥 {showEmployeeManagement ? 'Ascunde' : 'Gestionează'} Angajați
            </button>
            {profiles.length === 0 && (
              <span style={{ fontSize: 12, color: '#c00', marginLeft: 8 }}>
                ⚠️ Nu sunt profile!
              </span>
            )}
          </div>

          {showEmployeeManagement && (
            <div style={{
              marginTop: 16,
              padding: 16,
              border: '2px solid #4CAF50',
              borderRadius: 8,
              backgroundColor: '#f0f8f0'
            }}>
              <h3 style={{ marginTop: 0 }}>👥 Gestionare Angajați</h3>
              {profiles.length === 0 ? (
                <p style={{ color: '#c00' }}>Nu sunt angajați în baza de date.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {profiles.map(profile => (
                    <div key={profile.id} style={{
                      padding: 12,
                      border: '1px solid #ddd',
                      borderRadius: 6,
                      backgroundColor: 'white'
                    }}>
                      {editingProfileId === profile.id ? (
                        // Mod editare
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input
                            type="email"
                            placeholder="Email"
                            value={profileEdits.email || ''}
                            onChange={e => setProfileEdits(prev => ({ ...prev, email: e.target.value }))}
                            style={{ flex: '1 1 200px', padding: 4 }}
                          />
                          <input
                            placeholder="Nume Complet"
                            value={profileEdits.full_name || ''}
                            onChange={e => setProfileEdits(prev => ({ ...prev, full_name: e.target.value }))}
                            style={{ flex: '1 1 200px', padding: 4 }}
                          />
                          <select
                            value={profileEdits.role || 'employee'}
                            onChange={e => setProfileEdits(prev => ({ ...prev, role: e.target.value }))}
                            style={{ padding: 4 }}
                          >
                            <option value="employee">Employee</option>
                            <option value="ceo">CEO</option>
                            <option value="admin">Admin</option>
                          </select>
                          <button onClick={() => saveProfile(profile.id)} style={{ fontSize: 12, backgroundColor: '#4CAF50', color: 'white' }}>
                            💾 Salvează
                          </button>
                          <button onClick={cancelEditProfile} style={{ fontSize: 12, backgroundColor: '#999', color: 'white' }}>
                            ❌ Anulează
                          </button>
                        </div>
                      ) : (
                        // Mod afișare
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 'bold', fontSize: 14 }}>{profile.full_name || '(Fără nume)'}</div>
                            <div style={{ fontSize: 12, color: '#666' }}>{profile.email}</div>
                            <div style={{ fontSize: 11, color: '#999' }}>
                              Rol: <span style={{ fontWeight: 'bold' }}>{profile.role}</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => startEditProfile(profile)} style={{ fontSize: 12, backgroundColor: '#2196F3', color: 'white' }}>
                              ✏️ Editează
                            </button>
                            <button onClick={() => deleteProfile(profile.id)} style={{ fontSize: 12, backgroundColor: '#f44336', color: 'white' }}>
                              🗑️ Șterge
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Secțiune creare profil nou */}
              <div style={{
                marginTop: 20,
                padding: 12,
                border: '2px dashed #2196F3',
                borderRadius: 8,
                backgroundColor: '#f0f8ff'
              }}>
                <button 
                  onClick={() => setShowCreateProfile(s => !s)}
                  style={{
                    fontSize: 14,
                    fontWeight: 'bold',
                    backgroundColor: '#2196F3',
                    color: 'white',
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    marginBottom: showCreateProfile ? 12 : 0
                  }}
                >
                  ➕ {showCreateProfile ? 'Ascunde Formular' : 'Creează Profil Nou'}
                </button>

                {showCreateProfile && (
                  <form onSubmit={handleCreateNewProfile} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10
                  }}>
                    <input
                      type="email"
                      placeholder="Email"
                      value={newProfileData.email}
                      onChange={e => setNewProfileData(prev => ({ ...prev, email: e.target.value }))}
                      required
                      style={{ padding: '8px', borderRadius: 4, border: '1px solid #ccc' }}
                    />
                    <input
                      type="text"
                      placeholder="Nume Complet"
                      value={newProfileData.full_name}
                      onChange={e => setNewProfileData(prev => ({ ...prev, full_name: e.target.value }))}
                      required
                      style={{ padding: '8px', borderRadius: 4, border: '1px solid #ccc' }}
                    />
                    <input
                      type="password"
                      placeholder="Parolă (min 6 caractere)"
                      value={newProfileData.password}
                      onChange={e => setNewProfileData(prev => ({ ...prev, password: e.target.value }))}
                      required
                      style={{ padding: '8px', borderRadius: 4, border: '1px solid #ccc' }}
                    />
                    <input
                      type="password"
                      placeholder="Confirmă Parola"
                      value={newProfileData.confirmPassword}
                      onChange={e => setNewProfileData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      required
                      style={{ padding: '8px', borderRadius: 4, border: '1px solid #ccc' }}
                    />
                    <select
                      value={newProfileData.role}
                      onChange={e => setNewProfileData(prev => ({ ...prev, role: e.target.value }))}
                      style={{ padding: '8px', borderRadius: 4, border: '1px solid #ccc' }}
                    >
                      <option value="employee">Employee</option>
                      <option value="ceo">CEO</option>
                      <option value="admin">Admin</option>
                    </select>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button 
                        type="submit" 
                        disabled={loading}
                        style={{
                          backgroundColor: '#4CAF50',
                          color: 'white',
                          padding: '8px 16px',
                          border: 'none',
                          borderRadius: 4,
                          cursor: loading ? 'not-allowed' : 'pointer',
                          opacity: loading ? 0.6 : 1
                        }}
                      >
                        ✅ Creează Profil
                      </button>
                      <button 
                        type="button"
                        onClick={() => setShowCreateProfile(false)}
                        style={{
                          backgroundColor: '#999',
                          color: 'white',
                          padding: '8px 16px',
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer'
                        }}
                      >
                        ❌ Anulează
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          {showCreateWithTasks && (
            <form onSubmit={handleCreateJob}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input placeholder="Job Name" value={jobname} onChange={e => setJobname(e.target.value)} required />
                  <select value={jobPriority} onChange={e => setJobPriority(e.target.value)} style={{ padding: 6, width: 140, minWidth: 120 }}>
                    <option value="normal">Normal</option>
                    <option value="repede">Repede</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <input placeholder="Client Name (full)" value={clientname} onChange={e => setClientname(e.target.value)} />
                {/* removed separate first/last name inputs; use single Client Name field */}
                <input placeholder="Serie buletin" value={clientIdSeries} onChange={e => setClientIdSeries(e.target.value)} style={{ marginTop: 6 }} />
                <input placeholder="CNP" value={clientCNP} onChange={e => setClientCNP(e.target.value)} style={{ marginTop: 6 }} />
                <input placeholder="Adresa" value={clientAddress} onChange={e => setClientAddress(e.target.value)} style={{ marginTop: 6 }} />
                <input type="email" placeholder="Client Email" value={clientemail} onChange={e => setClientemail(e.target.value)} />
                <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
                  <label style={{ fontSize: 12 }}>Telefon Client (opțional):</label>
                  <input placeholder="Telefon" value={clientPhone} onChange={e => setClientPhone(e.target.value)} style={{ width: 160, padding: 6 }} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
                  <label style={{ fontSize: 12 }}>Valoare Job (opțional):</label>
                  <input type="number" step="0.01" placeholder="Valoare totală" value={jobValue} onChange={e => setJobValue(e.target.value)} style={{ width: 160, padding: 6 }} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
                  <label style={{ fontSize: 12 }}>Număr de ordine (opțional):</label>
                  <input type="number" min="1" placeholder="Nr ordine" value={jobOrderNumber} onChange={e => setJobOrderNumber(e.target.value)} style={{ width: 140, padding: 6 }} />
                </div>
              </div>

              <div style={{ marginTop: 8, borderTop: '1px dashed #ddd', paddingTop: 8 }}>
                <h4>Taskuri pentru job</h4>
                {newJobTasks.map((t, i) => (
                  <div key={i} style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap', border: '1px solid #eee', padding: 8, borderRadius: 6, background: 'white' }}>
                    <div style={{ flex: '1 1 320px', minWidth: 260 }}>
                      <input placeholder="Nume task" value={t.name} onChange={e => updateNewJobTaskField(i, 'name', e.target.value)} required style={{ width: '100%', marginBottom: 6, padding: 8 }} />
                      <textarea placeholder="Descriere" value={t.description || ''} onChange={e => updateNewJobTaskField(i, 'description', e.target.value)} style={{ width: '100%', marginBottom: 6, minHeight: 80, padding: 8 }} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 140 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label style={{ fontSize: 12 }}>Ore:</label>
                        <input type="number" placeholder="Ore" value={t.estimated_hours} onChange={e => updateNewJobTaskField(i, 'estimated_hours', e.target.value)} style={{ width: 96, padding: 6 }} step="0.5" min="0" />
                      </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <label style={{ fontSize: 12 }}>Termen (deadline):</label>
                                      <input type="datetime-local" value={t.deadline ? t.deadline.slice(0,16) : ''} onChange={e => updateNewJobTaskField(i, 'deadline', e.target.value)} style={{ padding: 6 }} />
                                    </div>
                      {/* Admin: task value input removed on purpose */}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 200 }}>
                      <MultiAssignSelector profiles={profiles} selectedIds={t.assigned_to || []} onChange={v => updateNewJobTaskField(i, 'assigned_to', v)} />
                      <button type="button" onClick={() => removeNewJobTask(i)} style={{ fontSize: 12, color: 'red' }}>Șterge Task</button>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addNewJobTask} style={{ fontSize: 12 }}>+ Adaugă task</button>
              </div>

              <div style={{ marginTop: 8 }}>
                <button type="submit">Creează Job</button>
              </div>
            </form>
          )}
        </div>
      </section>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {message && <p style={{ color: 'green' }}>{message}</p>}

      <section>
        <h3>Joburi ({jobs.length})</h3>
        {jobs.map((job, idx) => {
          const jobTasks = tasks.filter(t => t.job_id === job.id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
          const totalHours = jobTasks.reduce((sum, t) => sum + (parseFloat(t.estimated_hours) || 0), 0)
          const isExpanded = expandedJob === job.id
          const isEditing = editingJobId === job.id

          return (
            <div key={job.id} style={{ marginBottom: 16, padding: 12, border: '1px solid #ccc', borderRadius: 8 }}>
              {isEditing ? (
                <div style={{ marginBottom: 8 }}>
                  <input
                    placeholder="Nume Job"
                    value={jobEdits.name || ''}
                    onChange={e => setJobEdits(prev => ({ ...prev, name: e.target.value }))}
                    style={{ marginRight: 8 }}
                  />
                  <input
                    placeholder="Nume Client (full)"
                    value={jobEdits.client_name || ''}
                    onChange={e => setJobEdits(prev => ({ ...prev, client_name: e.target.value }))}
                    style={{ marginRight: 8 }}
                  />
                  
                  {/* removed legacy first/last edit inputs; use client_name only */}
                  <input placeholder="Serie buletin" value={jobEdits.client_id_series || ''} onChange={e => setJobEdits(prev => ({ ...prev, client_id_series: e.target.value }))} style={{ marginTop: 6 }} />
                  <input placeholder="CNP" value={jobEdits.client_cnp || ''} onChange={e => setJobEdits(prev => ({ ...prev, client_cnp: e.target.value }))} style={{ marginTop: 6 }} />
                  <input placeholder="Adresa" value={jobEdits.client_address || ''} onChange={e => setJobEdits(prev => ({ ...prev, client_address: e.target.value }))} style={{ marginTop: 6 }} />
                  <input
                    type="email"
                    placeholder="Email Client"
                    value={jobEdits.client_email || ''}
                    onChange={e => setJobEdits(prev => ({ ...prev, client_email: e.target.value }))}
                    style={{ marginRight: 8 }}
                  />
                  <input
                    placeholder="Telefon Client"
                    value={jobEdits.client_phone || ''}
                    onChange={e => setJobEdits(prev => ({ ...prev, client_phone: e.target.value }))}
                    style={{ marginRight: 8 }}
                  />
                  <select value={jobEdits.priority || 'normal'} onChange={e => setJobEdits(prev => ({ ...prev, priority: e.target.value }))} style={{ marginRight: 8, width: 140, minWidth: 120 }}>
                    <option value="normal">Normal</option>
                    <option value="repede">Repede</option>
                    <option value="urgent">Urgent</option>
                  </select>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
                    <label style={{ fontSize: 12 }}>Valoare Job:</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Valoare totală"
                      value={jobEdits.total_value != null ? jobEdits.total_value : ''}
                      onChange={e => setJobEdits(prev => ({ ...prev, total_value: e.target.value }))}
                      style={{ width: 120, padding: 6 }}
                    />
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
                    <label style={{ fontSize: 12 }}>Bani încasați:</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Suma încasată"
                      value={jobEdits.amount_paid != null ? jobEdits.amount_paid : ''}
                      onChange={e => setJobEdits(prev => ({ ...prev, amount_paid: e.target.value }))}
                      style={{ width: 120, padding: 6 }}
                    />
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
                    <label style={{ fontSize: 12 }}>Nr. ordine:</label>
                    <input
                      type="number"
                      placeholder="Număr ordine"
                      value={jobEdits.order_number != null ? jobEdits.order_number : ''}
                      onChange={e => setJobEdits(prev => ({ ...prev, order_number: e.target.value }))}
                      style={{ width: 100, padding: 6 }}
                      min="1"
                    />
                  </div>
                  <select value={jobEdits.status || 'todo'} onChange={e => setJobEdits(prev => ({ ...prev, status: e.target.value }))} style={{ marginRight: 8 }}>
                    <option value="todo">Todo</option>
                    <option value="completed">Completed</option>
                  </select>
                  <button onClick={() => saveJob(job.id)} style={{ marginRight: 4, fontSize: 12 }}>💾 Salvează</button>
                  <button onClick={cancelEditJob} style={{ fontSize: 12 }}>❌ Anulează</button>
                </div>
              ) : (
                !isMobile ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <strong>{idx + 1}. {job.name}</strong>
                        {job.order_number && <span style={{ padding: '4px 8px', borderRadius: 6, fontSize: 12, color: 'white', backgroundColor: '#2196F3' }}>Nr. {job.order_number}</span>}
                        <span> - {job.client_name} ({job.status})</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#4CAF50', fontWeight: 'bold' }}>💵 Bani încasați: {job.amount_paid != null ? parseFloat(job.amount_paid).toFixed(2) + ' lei' : '0.00 lei'}</div>
                      <div style={{ fontSize: 11, color: '#666' }}>
                        ⏱️ Timp estimat: <strong>{formatDuration(totalHours)}</strong>
                        {(() => {
                          const earliestDeadline = jobTasks.filter(t => t.deadline).sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0];
                          return earliestDeadline ? ` → Termen limită: ${new Date(earliestDeadline.deadline).toLocaleDateString('ro-RO', { year: 'numeric', month: 'long', day: 'numeric' })}` : '';
                        })()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <label style={{ fontSize: 11, color: '#333' }}>💵 Încasat:</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={amountPaidDraft[job.id] !== undefined ? amountPaidDraft[job.id] : (job.amount_paid != null ? job.amount_paid : '')}
                          onChange={e => handleAmountPaidChange(job.id, e.target.value)}
                          style={{ width: 110, padding: 6 }}
                        />
                        <button onClick={() => saveAmountPaid(job.id)} style={{ fontSize: 12 }}>💾</button>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button onClick={() => setExpandedJob(isExpanded ? null : job.id)} style={{ fontSize: 12 }}>
                          {isExpanded ? '🔼 Ascunde' : '🔽 Detalii'}
                        </button>
                        <button onClick={() => startEditJob(job)} style={{ fontSize: 12 }}>✏️ Editează</button>
                        <button onClick={() => downloadPdfForJob(job)} style={{ fontSize: 12 }}>📄 Descarcă PDF</button>
                        <button onClick={() => deleteJob(job.id)} style={{ fontSize: 12, color: 'red' }}>🗑️ Șterge</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                    style={{ width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 10, border: '1px solid #d0d7de', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <strong style={{ display: 'block' }}>{idx + 1}. {job.name}</strong>
                      <span style={{ display: 'block', fontSize: 12, color: '#555' }}>{job.client_name} ({job.status})</span>
                    </span>
                    <span>{isExpanded ? '▲' : '▼'}</span>
                  </button>
                )
              )}

              {isExpanded && (
                <div style={{ marginTop: 8, paddingLeft: 16, borderLeft: '3px solid #4CAF50' }}>
                  {isMobile && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      <button onClick={() => startEditJob(job)} style={{ fontSize: 12 }}>✏️ Editează</button>
                      <button onClick={() => downloadPdfForJob(job)} style={{ fontSize: 12 }}>📄 Descarcă PDF</button>
                      <button onClick={() => deleteJob(job.id)} style={{ fontSize: 12, color: 'red' }}>🗑️ Șterge</button>
                      <div style={{ display: 'flex', gap: 6, width: '100%', alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ fontSize: 11, color: '#333' }}>💵 Încasat:</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={amountPaidDraft[job.id] !== undefined ? amountPaidDraft[job.id] : (job.amount_paid != null ? job.amount_paid : '')}
                          onChange={e => handleAmountPaidChange(job.id, e.target.value)}
                          style={{ width: 120, padding: 6 }}
                        />
                        <button onClick={() => saveAmountPaid(job.id)} style={{ fontSize: 12 }}>💾 Salvează încasat</button>
                      </div>
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>
                    <div>Client Email: {job.client_email || 'N/A'}</div>
                    <div>Client Telefon: {job.client_phone || 'N/A'}</div>
                    <div>Created at: {new Date(job.created_at).toLocaleString('ro-RO')}</div>
                  </div>

                  <h4 style={{ fontSize: 14, marginBottom: 8 }}>Taskuri ({jobTasks.length})</h4>
                  {jobTasks.map(task => {
                    const isTaskExpanded = expandedTask === task.id
                    const isTaskEditing = editingTaskId === task.id
                    const assignedProfiles = (profiles || []).filter(p => Array.isArray(task.assigned_to) ? task.assigned_to.includes(p.id) : task.assigned_to === p.id)

                    return (
                      <div key={task.id} style={{ marginBottom: 8, padding: 8, border: '1px solid #ddd', borderRadius: 4, backgroundColor: task.status === 'completed' ? '#e8f5e9' : 'white' }}>
                        {isTaskEditing ? (
                          <div>
                            <input
                              placeholder="Nume Task"
                              value={taskEdits.name || ''}
                              onChange={e => setTaskEdits(prev => ({ ...prev, name: e.target.value }))}
                              style={{ marginBottom: 4, width: '100%' }}
                            />
                            <textarea
                              placeholder="Descriere"
                              value={taskEdits.description || ''}
                              onChange={e => setTaskEdits(prev => ({ ...prev, description: e.target.value }))}
                              style={{ marginBottom: 4, width: '100%' }}
                            />
                            <div style={{ display: 'flex', gap: 8, marginBottom: 4, alignItems: 'center' }}>
                              <label style={{ fontSize: 12 }}>Ore:</label>
                              <input
                                type="number"
                                placeholder="Ore estimate"
                                value={taskEdits.estimated_hours || ''}
                                onChange={e => setTaskEdits(prev => ({ ...prev, estimated_hours: e.target.value }))}
                                style={{ width: 100 }}
                                step="0.5"
                                min="0"
                              />
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                              <label style={{ fontSize: 12 }}>Termen (deadline):</label>
                              <input
                                type="datetime-local"
                                value={taskEdits.deadline ? taskEdits.deadline.slice(0,16) : ''}
                                onChange={e => setTaskEdits(prev => ({ ...prev, deadline: e.target.value }))}
                                style={{ padding: 6 }}
                              />
                            </div>
                            {/* Admin: task value editing removed */}
                            <select value={taskEdits.status || 'todo'} onChange={e => setTaskEdits(prev => ({ ...prev, status: e.target.value }))} style={{ marginRight: 8 }}>
                              <option value="todo">Todo</option>
                              <option value="completed">Completed</option>
                            </select>
                            <div style={{ marginRight: 8 }}>
                              <MultiAssignSelector profiles={profiles} selectedIds={taskEdits.assigned_to || []} onChange={v => setTaskEdits(prev => ({ ...prev, assigned_to: v }))} />
                            </div>
                            <button onClick={() => saveTask(task.id)} style={{ fontSize: 11, marginRight: 4 }}>💾 Salvează</button>
                            <button onClick={cancelEditTask} style={{ fontSize: 11 }}>❌ Anulează</button>
                          </div>
                        ) : (
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <strong>{task.name}</strong> ({task.status})
                                <div style={{ fontSize: 11, color: '#666' }}>
                                  Asignat: {assignedProfiles.length > 0 ? assignedProfiles.map(p => displayUserLabel(p)).join(', ') : '(Neasignat)'}
                                  {task.estimated_hours && (
                                    <span> | ⏱️ {formatDuration(task.estimated_hours)}{task.deadline ? ` → Termen: ${new Date(task.deadline).toLocaleDateString('ro-RO', { year: 'numeric', month: 'long', day: 'numeric' })}` : ''}</span>
                                  )}
                                  {task.value != null && (
                                    <span> | 💰 Valoare: {parseFloat(task.value).toFixed(2)}</span>
                                  )}
                                </div>
                              </div>
                              <div style={{ position: 'relative' }}>
                                {!isMobile ? (
                                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <button onClick={() => setExpandedTask(isTaskExpanded ? null : task.id)} style={{ fontSize: 11 }}>
                                      {isTaskExpanded ? '🔼' : '🔽'}
                                    </button>
                                    <button onClick={() => toggleComplete(task)} style={{ fontSize: 11 }}>
                                      {task.status === 'completed' ? '↩️ Undo' : '✅ Done'}
                                    </button>
                                    <button onClick={() => startEditTask(task)} style={{ fontSize: 11 }}>✏️</button>
                                    <button onClick={() => deleteTask(task.id)} style={{ fontSize: 11, color: 'red' }}>🗑️</button>
                                    <button onClick={() => setOverflowTask(overflowTask === task.id ? null : task.id)} style={{ fontSize: 11 }}>
                                      {overflowTask === task.id ? '▲ Mai puțin' : '⋯ Mai mult'}
                                    </button>
                                  </div>
                                ) : (
                                  <div>
                                    <button onClick={() => setTaskMenuOpen(taskMenuOpen === task.id ? null : task.id)} style={{ fontSize: 16, padding: '6px 8px' }}>⋮</button>
                                    {taskMenuOpen === task.id && (
                                      <div style={{ position: 'absolute', right: 0, top: 32, background: 'white', border: '1px solid #ddd', borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.12)', zIndex: 60, minWidth: 180, padding: 8 }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                          <button onClick={() => { setExpandedTask(isTaskExpanded ? null : task.id); setTaskMenuOpen(null) }} style={{ textAlign: 'left' }}>{isTaskExpanded ? 'Ascunde detalii' : 'Vezi detalii'}</button>
                                          <button onClick={() => { toggleComplete(task); setTaskMenuOpen(null) }} style={{ textAlign: 'left' }}>{task.status === 'completed' ? '↩️ Undo' : '✅ Done'}</button>
                                          <button onClick={() => { startEditTask(task); setTaskMenuOpen(null) }} style={{ textAlign: 'left' }}>✏️ Edit</button>
                                          <button onClick={() => { deleteTask(task.id); setTaskMenuOpen(null) }} style={{ textAlign: 'left', color: 'red' }}>🗑️ Șterge</button>
                                          <button onClick={() => { setOverflowTask(overflowTask === task.id ? null : task.id); setTaskMenuOpen(null) }} style={{ textAlign: 'left' }}>{overflowTask === task.id ? 'Mai puțin' : 'Mai mult'}</button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {isTaskExpanded && (
                              <div style={{ marginTop: 8, fontSize: 12, color: '#555' }}>
                                <div>Descriere: {task.description || 'N/A'}</div>
                                <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
                                  {(Array.isArray(task.completers) && task.completers.length > 0) ? (
                                    <div>Done by: {task.completers.map((c, i) => {
                                      const prof = (profiles || []).find(p => p.id === c.id)
                                      const label = prof ? displayUserLabel(prof) : (c.email || c.id)
                                      return `${label}${c.amount != null ? ` (${c.amount} lei)` : ''}${i < task.completers.length - 1 ? ', ' : ''}`
                                    }).join('')}</div>
                                  ) : task.completed_by ? (
                                    <div>Done by: {(() => {
                                      const completer = (profiles || []).find(p => p.id === task.completed_by)
                                      return completer ? displayUserLabel(completer) : (task.completed_by_email || task.completed_by)
                                    })()}</div>
                                  ) : null}
                                </div>
                                {task.completed_at && <div style={{ marginTop: 6 }}>Completed at: {new Date(task.completed_at).toLocaleString('ro-RO')}</div>}
                                <div style={{ marginTop: 6 }}>Created at: {new Date(task.created_at).toLocaleString('ro-RO')}</div>
                                {task.deadline && <div style={{ marginTop: 6 }}>Termen limită: {new Date(task.deadline).toLocaleString('ro-RO')}</div>}
                              </div>
                            )}

                            {/* Overflow detailed panel for long content */}
                            {overflowTask === task.id && (
                              <div style={{ marginTop: 8, padding: 8, border: '1px solid var(--border-color)', borderRadius: 8, background: '#fafafa', maxHeight: 220, overflow: 'auto' }}>
                                <div><strong>Descriere completă:</strong><div style={{ marginTop: 6 }}>{task.description || 'N/A'}</div></div>
                                {(Array.isArray(task.completers) && task.completers.length > 0) && (
                                  <div style={{ marginTop: 8 }}><strong>Completat de:</strong> {task.completers.map((c, i) => {
                                    const prof = (profiles || []).find(p => p.id === c.id)
                                    const label = prof ? displayUserLabel(prof) : (c.email || c.id)
                                    return `${label}${c.amount != null ? ` (${c.amount} lei)` : ''}${i < task.completers.length - 1 ? ', ' : ''}`
                                  }).join('')}</div>
                                )}
                                {task.completed_at && <div style={{ marginTop: 8 }}><strong>Completed at:</strong> {new Date(task.completed_at).toLocaleString('ro-RO')}</div>}
                                <div style={{ marginTop: 8 }}><strong>Created at:</strong> {new Date(task.created_at).toLocaleString('ro-RO')}</div>
                                {task.deadline && <div style={{ marginTop: 8 }}><strong>Termen limită:</strong> {new Date(task.deadline).toLocaleString('ro-RO')}</div>}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {addingTaskToJob === job.id ? (
                    <form onSubmit={handleAddTask} style={{
                      marginTop: 12,
                      padding: 12,
                      backgroundColor: '#e3f2fd',
                      borderRadius: 6,
                      border: '2px solid #2196F3'
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <input
                          placeholder="Nume task nou"
                          value={newTaskData.name}
                          onChange={e => setNewTaskData(prev => ({ ...prev, name: e.target.value }))}
                          required
                          style={{ padding: '8px 12px', borderRadius: 4, border: '1px solid #ccc' }}
                        />
                        <textarea
                          placeholder="Descriere"
                          value={newTaskData.description || ''}
                          onChange={e => setNewTaskData(prev => ({ ...prev, description: e.target.value }))}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 4,
                            border: '1px solid #ccc',
                            minHeight: 80,
                            fontFamily: 'inherit'
                          }}
                        />
                        <div style={{
                          display: 'flex',
                          gap: 12,
                          flexWrap: 'wrap',
                          alignItems: 'center'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <label style={{ fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap' }}>Ore:</label>
                            <input
                              type="number"
                              placeholder="Ore"
                              value={newTaskData.estimated_hours}
                              onChange={e => setNewTaskData(prev => ({ ...prev, estimated_hours: e.target.value }))}
                              style={{ width: 80, padding: '6px 8px', borderRadius: 4, border: '1px solid #ccc' }}
                              step="0.5"
                              min="0"
                            />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <label style={{ fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap' }}>Termen:</label>
                            <input
                              type="datetime-local"
                              value={newTaskData.deadline || ''}
                              onChange={e => setNewTaskData(prev => ({ ...prev, deadline: e.target.value }))}
                              style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #ccc' }}
                            />
                          </div>
                          <div style={{ flex: 1, minWidth: '200px' }}>
                            <MultiAssignSelector
                              profiles={profiles}
                              selectedIds={newTaskData.assigned_to || []}
                              onChange={v => setNewTaskData(prev => ({ ...prev, assigned_to: v }))}
                            />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button type="submit" className="btn btn-success" style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 'bold' }}>
                            ➕ Adaugă Task
                          </button>
                          <button type="button" onClick={cancelAddTask} className="btn btn-outline-secondary" style={{ padding: '8px 16px', fontSize: '12px' }}>
                            Anulează
                          </button>
                        </div>
                      </div>
                    </form>
                  ) : (
                    <button
                      onClick={() => startAddTaskToJob(job.id)}
                      className="btn btn-secondary"
                      style={{
                        fontSize: 12,
                        marginTop: 12,
                        padding: '8px 12px',
                        fontWeight: 'bold',
                        width: isMobile ? '100%' : 'auto'
                      }}
                    >
                      ➕ Adaugă task la job
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}

export default AdminDashboard
