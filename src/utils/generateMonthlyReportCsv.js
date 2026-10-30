const toDateOrNull = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const getTaskCompletionDate = (task) => {
  if (!task) return null

  const direct = toDateOrNull(task.completed_at)
  if (direct) return direct

  if (Array.isArray(task.completers)) {
    for (const completer of task.completers) {
      const fromCompleter = toDateOrNull(completer?.completed_at)
      if (fromCompleter) return fromCompleter
    }
  }

  if (task.status === 'completed') {
    const updated = toDateOrNull(task.updated_at)
    if (updated) return updated
  }

  return null
}

const getTaskCompleters = (task) => {
  if (Array.isArray(task?.completers) && task.completers.length > 0) return task.completers
  if (task?.completed_by) {
    return [{ id: task.completed_by, email: task.completed_by_email, completed_at: task.completed_at }]
  }
  return []
}

// Banii unui task se socotesc la persoanele CĂRORA LE-A FOST ALOCAT (nu la cine l-a bifat).
// Excepție: taskurile libere (fără nimeni alocat) rămân la cine le-a bifat.
// Aceleași funcții sunt folosite de tabelul Raport Lunar și de exportul Excel, ca să dea mereu același rezultat.
const sameEmail = (a, b) => !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase()
const assignedIds = (task) => Array.isArray(task?.assigned_to) ? task.assigned_to : (task?.assigned_to ? [task.assigned_to] : [])
const assignedEmails = (task) => Array.isArray(task?.assigned_to_emails) ? task.assigned_to_emails : []
const isFreeTask = (task) => assignedIds(task).length === 0 && assignedEmails(task).length === 0

export const isAssignedTo = (task, profile) => {
  if (!task || !profile) return false
  return assignedIds(task).includes(profile.id) || assignedEmails(task).some(e => sameEmail(e, profile.email))
}

const completerFor = (task, profile) =>
  profile ? getTaskCompleters(task).find(c => c.id === profile.id || sameEmail(c.email, profile.email)) : null

// Cui i se socotește taskul: celor alocați; la taskurile libere, celor care l-au bifat
export const isCreditedTo = (task, profile) => (isFreeTask(task) ? !!completerFor(task, profile) : isAssignedTo(task, profile))

// Partea persoanei: suma ei din împărțirea la finalizare, altfel valoarea împărțită la câți îl împart
export const shareFor = (task, profile) => {
  const mine = completerFor(task, profile)
  if (mine && mine.amount != null && !Number.isNaN(parseFloat(mine.amount))) return parseFloat(mine.amount)
  const people = isFreeTask(task) ? getTaskCompleters(task).length : Math.max(assignedIds(task).length, assignedEmails(task).length)
  const value = parseFloat(task.value)
  return (Number.isNaN(value) ? 0 : value) / Math.max(1, people)
}

export const doneDateFor = (task, profile) => toDateOrNull(completerFor(task, profile)?.completed_at) || getTaskCompletionDate(task)

export function buildMonthlyReportData({ tasks = [], profiles = [], users = [], month, year }) {
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 1)
  const inMonth = (d) => !!d && d >= start && d < end
  const profileMap = (profiles || []).reduce((map, profile) => {
    map[profile.id] = profile
    if (profile.email) map[profile.email] = profile
    return map
  }, {})
  const userMap = (users || []).reduce((map, user) => {
    map[user.id] = user
    if (user.email) map[user.email] = user
    return map
  }, {})
  const resolveIdentity = (idOrEmail) => profileMap[idOrEmail] || userMap[idOrEmail] || null

  const profileLabel = (idOrEmail) => {
    if (!idOrEmail) return ''
    const profile = resolveIdentity(idOrEmail)
    if (profile) return profile.full_name ? `${profile.full_name} (${profile.email})` : profile.email
    return String(idOrEmail)
  }

  const completedTasks = (tasks || []).filter(task => inMonth(getTaskCompletionDate(task)))

  const rows = []
  for (const profile of (profiles || [])) {
    const mine = (tasks || []).filter(task => isCreditedTo(task, profile) && inMonth(doneDateFor(task, profile)))
    rows.push({
      assigned_to: profile.id,
      profile,
      tasks: mine,
      totalValue: mine.reduce((sum, task) => sum + shareFor(task, profile), 0),
      count: mine.length
    })
  }

  // Taskuri finalizate în lună care nu se pot socoti nimănui din lista de profile primită
  const unassigned = completedTasks.filter(task => !(profiles || []).some(p => isCreditedTo(task, p)))
  if (unassigned.length > 0) {
    rows.push({
      assigned_to: null,
      profile: null,
      tasks: unassigned,
      totalValue: unassigned.reduce((sum, task) => sum + (parseFloat(task.value) || 0), 0),
      count: unassigned.length
    })
  }

  rows.sort((a, b) => b.totalValue - a.totalValue)

  return {
    rows,
    completedTasks,
    overallTotal: rows.reduce((sum, row) => sum + row.totalValue, 0),
    totalTasks: completedTasks.length,
    profileLabel
  }
}

export function generateMonthlyReportCsv({ tasks = [], profiles = [], users = [], month, year }) {
  const report = buildMonthlyReportData({ tasks, profiles, users, month, year })

  const lines = []
  lines.push('Employee,Completed Tasks Count,Total Value')
  for (const row of report.rows) {
    const label = row.profile ? (row.profile.full_name ? `${row.profile.full_name} (${row.profile.email})` : row.profile.email) : report.profileLabel(row.assigned_to) || '(unknown)'
    lines.push(`"${label}",${row.count},${row.totalValue.toFixed(2)}`)
  }

  lines.push('')
  lines.push('All Completed Tasks:')
  lines.push('Task ID,Task Name,Job ID,Job Name,Completed By,Completed At,Value')
  for (const task of report.completedTasks) {
    const completers = getTaskCompleters(task)
    const completedBy = completers.length > 0
      ? completers.map(c => (c.email ? (c.full_name ? `${c.full_name} (${c.email})` : c.email) : (c.id || ''))).join(' | ')
      : (task.completed_by_email || task.completed_by || '')
    const completedDate = getTaskCompletionDate(task)
    const completedAt = completedDate ? completedDate.toLocaleString('ro-RO') : ''
    const value = (task.value != null && !Number.isNaN(parseFloat(task.value))) ? parseFloat(task.value).toFixed(2) : ''
    const jobName = task.job_name || ''
    lines.push(`"${task.id}","${(task.name || '').replace(/"/g, '""')}","${task.job_id || ''}","${(jobName || '').replace(/"/g, '""')}","${(completedBy || '').replace(/"/g, '""')}","${completedAt}",${value}`)
  }

  return lines.join('\n')
}

export function downloadCsv(content, filename = 'report.csv') {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
