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

export function buildMonthlyReportData({ tasks = [], profiles = [], users = [], month, year }) {
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 1)
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

  const completedTasks = (tasks || []).filter(task => {
    const completionDate = getTaskCompletionDate(task)
    return completionDate ? completionDate >= start && completionDate < end : false
  })

  const agg = {}
  for (const task of completedTasks) {
    const completers = getTaskCompleters(task)
    const value = (task.value != null && !Number.isNaN(parseFloat(task.value))) ? parseFloat(task.value) : 0

    if (completers.length === 0) {
      agg['(unknown)'] = agg['(unknown)'] || { count: 0, total: 0 }
      agg['(unknown)'].count += 1
      agg['(unknown)'].total += value
      continue
    }

    for (const completer of completers) {
      const key = completer.id || completer.email || '(unknown)'
      agg[key] = agg[key] || { count: 0, total: 0 }
      agg[key].count += 1
      const amount = completer.amount != null ? parseFloat(completer.amount) : value
      agg[key].total += Number.isNaN(amount) ? 0 : amount
    }
  }

  const rows = []
  const matchedKeys = new Set()

  for (const profile of (profiles || [])) {
    const linkedUser = (users || []).find(user => user.email && user.email === profile.email) || null
    const possibleKeys = [profile.id, profile.email, linkedUser && linkedUser.id, linkedUser && linkedUser.email].filter(Boolean)
    const val = possibleKeys.map(key => agg[key]).find(Boolean) || { count: 0, total: 0 }
    rows.push({
      assigned_to: profile.id,
      profile,
      tasks: completedTasks.filter(task => {
        const completers = getTaskCompleters(task)
        return completers.some(c => possibleKeys.includes(c.id) || possibleKeys.includes(c.email))
      }),
      totalValue: val.total,
      count: val.count
    })
    possibleKeys.forEach(key => { if (agg[key]) matchedKeys.add(key) })
  }

  for (const [key, val] of Object.entries(agg)) {
    if (matchedKeys.has(key)) continue
    rows.push({
      assigned_to: null,
      profile: null,
      tasks: completedTasks.filter(task => getTaskCompleters(task).some(c => (c.id || c.email || '(unknown)') === key)),
      totalValue: val.total,
      count: val.count
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
