import React, { useMemo, useState } from 'react'

// Lista de taskuri din Profil, cu moduri de vizualizare ca în Explorer (Detalii / Pictograme mici / Listă),
// filtre pe status și urgență și sortare. Alegerile se țin minte în browser (localStorage).

const STATUS = {
  todo: { label: 'În lucru', bg: '#fff3e0', color: '#e65100' },
  stand_by: { label: 'Stand By', bg: '#e3f2fd', color: '#1565c0' },
  completed: { label: 'Finalizat', bg: '#e8f5e9', color: '#2e7d32' },
}
export const PRIORITY = {
  urgent: { label: 'Urgent', bg: '#f44336', rank: 0 },
  repede: { label: 'Repede', bg: '#ff9800', rank: 1 },
  normal: { label: 'Normal', bg: '#607d8b', rank: 2 },
}
const SORTS = {
  created: { label: 'Data adăugării' },
  deadline: { label: 'Deadline' },
  completed: { label: 'Data finalizării' },
  priority: { label: 'Urgență' },
  status: { label: 'Status (în lucru / finalizat)' },
  name: { label: 'Nume' },
}
export const VIEWS = [
  { key: 'details', icon: '☰', label: 'Detalii' },
  { key: 'icons', icon: '▦', label: 'Pictograme mici' },
  { key: 'list', icon: '≡', label: 'Listă' },
]

// „De făcut” = task nefinalizat într-o lucrare nefinalizată
const isOpenIn = (jobById, t) => statusOf(t) !== 'completed' && jobById[t.job_id]?.status !== 'completed'
const statusOf = (t) => (t.status === 'completed' || t.status === 'stand_by' ? t.status : 'todo')
const priorityOf = (job) => (PRIORITY[job?.priority] ? job.priority : 'normal')
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('ro-RO') : '—')
const time = (v) => (v ? new Date(v).getTime() : null)

export function loadPrefs(key) {
  try { return JSON.parse(localStorage.getItem(`taskExplorer:${key}`)) || {} } catch (e) { return {} }
}
export function savePrefs(key, prefs) {
  try { localStorage.setItem(`taskExplorer:${key}`, JSON.stringify(prefs)) } catch (e) {}
}

export const btn = (active) => ({
  padding: '6px 10px', fontSize: 12, border: '1px solid ' + (active ? '#1976d2' : '#d1d5db'), borderRadius: 6, cursor: 'pointer',
  background: active ? '#e3f2fd' : 'white', color: active ? '#1565c0' : '#374151', fontWeight: active ? 700 : 500, whiteSpace: 'nowrap',
})
export const selectStyle = { padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #d1d5db', background: 'white' }
export const pill = (bg, color) => ({ display: 'inline-block', padding: '2px 7px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: bg, color, whiteSpace: 'nowrap' })

export default function TaskExplorer({ tasks = [], jobs = [], dlBadge, onOpen, renderActions, storageKey = 'profil' }) {
  const prefsKey = `${storageKey}:v2`
  const initial = loadPrefs(prefsKey)
  const [view, setView] = useState(initial.view || 'details')
  const [statusFilter, setStatusFilter] = useState(initial.statusFilter || 'open')
  const [priorityFilter, setPriorityFilter] = useState(initial.priorityFilter || 'all')
  const [sortKey, setSortKey] = useState(initial.sortKey || 'created')
  const [sortDir, setSortDir] = useState(initial.sortDir || 'desc')

  const update = (patch) => {
    const next = { view, statusFilter, priorityFilter, sortKey, sortDir, ...patch }
    if ('view' in patch) setView(patch.view)
    if ('statusFilter' in patch) setStatusFilter(patch.statusFilter)
    if ('priorityFilter' in patch) setPriorityFilter(patch.priorityFilter)
    if ('sortKey' in patch) setSortKey(patch.sortKey)
    if ('sortDir' in patch) setSortDir(patch.sortDir)
    savePrefs(prefsKey, next)
  }
  // Click pe același criteriu inversează direcția; criteriu nou pornește cu direcția naturală.
  const sortBy = (key) => {
    if (key === sortKey) update({ sortDir: sortDir === 'asc' ? 'desc' : 'asc' })
    else update({ sortKey: key, sortDir: key === 'created' || key === 'completed' ? 'desc' : 'asc' })
  }

  const jobById = useMemo(() => Object.fromEntries((jobs || []).map(j => [j.id, j])), [jobs])

  const counts = useMemo(() => {
    const c = { all: tasks.length, open: 0, todo: 0, stand_by: 0, completed: 0 }
    tasks.forEach(t => { c[statusOf(t)] += 1; if (isOpenIn(jobById, t)) c.open += 1 })
    return c
  }, [tasks, jobById])

  const rows = useMemo(() => {
    const filtered = tasks.filter(t => {
      if (statusFilter === 'open' ? !isOpenIn(jobById, t) : (statusFilter !== 'all' && statusOf(t) !== statusFilter)) return false
      if (priorityFilter !== 'all' && priorityOf(jobById[t.job_id]) !== priorityFilter) return false
      return true
    })
    const dir = sortDir === 'asc' ? 1 : -1
    const value = (t) => {
      switch (sortKey) {
        case 'deadline': return time(t.deadline)
        case 'completed': return time(t.completed_at)
        case 'priority': return PRIORITY[priorityOf(jobById[t.job_id])].rank
        case 'status': return { todo: 0, stand_by: 1, completed: 2 }[statusOf(t)]
        case 'name': return (t.name || '').toLowerCase()
        default: return time(t.created_at)
      }
    }
    return filtered.sort((a, b) => {
      const va = value(a), vb = value(b)
      // Taskurile fără dată (fără deadline / nefinalizate) merg mereu la final
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (va < vb) return -1 * dir
      if (va > vb) return 1 * dir
      return 0
    })
  }, [tasks, statusFilter, priorityFilter, sortKey, sortDir, jobById])

  const open = (t) => { const job = jobById[t.job_id]; if (job && onOpen) onOpen(job, t) }
  const statusPill = (t) => { const s = STATUS[statusOf(t)]; return <span style={pill(s.bg, s.color)}>{s.label}</span> }
  const priorityPill = (job) => { const p = PRIORITY[priorityOf(job)]; return <span style={pill(p.bg, 'white')}>{p.label}</span> }
  const isOverdue = (t) => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'completed'
  const taskIcon = (t) => (statusOf(t) === 'completed' ? '✅' : isOverdue(t) ? '⚠️' : statusOf(t) === 'stand_by' ? '⏸️' : '📄')

  const toolbar = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12, padding: 10, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8 }}>
      <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Vizualizare">
        {VIEWS.map(v => (
          <button key={v.key} type="button" title={v.label} onClick={() => update({ view: v.key })} style={btn(view === v.key)}>
            <span style={{ marginRight: 4 }}>{v.icon}</span>{v.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} role="group" aria-label="Status">
        {[['open', 'De făcut'], ['todo', 'În lucru'], ['stand_by', 'Stand By'], ['completed', 'Finalizate'], ['all', 'Toate']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => update({ statusFilter: k })} style={btn(statusFilter === k)}>{l} ({counts[k]})</button>
        ))}
      </div>
      <label style={{ fontSize: 12, color: '#555', display: 'flex', alignItems: 'center', gap: 5 }}>
        Urgență
        <select value={priorityFilter} onChange={e => update({ priorityFilter: e.target.value })} style={selectStyle}>
          <option value="all">Toate</option>
          <option value="urgent">Urgent</option>
          <option value="repede">Repede</option>
          <option value="normal">Normal</option>
        </select>
      </label>
      <label style={{ fontSize: 12, color: '#555', display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
        Sortează
        <select value={sortKey} onChange={e => sortBy(e.target.value)} style={selectStyle}>
          {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
        </select>
        <button type="button" onClick={() => update({ sortDir: sortDir === 'asc' ? 'desc' : 'asc' })} title={sortDir === 'asc' ? 'Crescător' : 'Descrescător'} style={btn(false)}>
          {sortDir === 'asc' ? '↑' : '↓'}
        </button>
      </label>
    </div>
  )

  if (tasks.length === 0) return <p style={{ color: '#6b7280' }}>Nu ai taskuri asignate momentan.</p>

  const empty = rows.length === 0 && <p style={{ color: '#6b7280', fontSize: 13 }}>Niciun task nu corespunde filtrelor alese.</p>

  const th = (key, label, align = 'left') => (
    <th onClick={key ? () => sortBy(key) : undefined} style={{ textAlign: align, padding: '8px 10px', borderBottom: '2px solid #e5e7eb', color: '#555', fontSize: 12, fontWeight: 600, cursor: key ? 'pointer' : 'default', whiteSpace: 'nowrap', userSelect: 'none', background: '#fafafa' }}>
      {label}{key === sortKey && <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  )
  const td = { padding: '7px 10px', borderBottom: '1px solid #f0f0f0', fontSize: 13, verticalAlign: 'middle' }

  let body
  if (view === 'icons') {
    body = (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
        {rows.map(t => {
          const job = jobById[t.job_id]
          return (
            <div key={t.id} onClick={() => open(t)} title={`${t.name}${job ? ' — ' + job.name : ''}`}
              style={{ padding: 10, border: '1px solid #e5e7eb', borderTop: `3px solid ${PRIORITY[priorityOf(job)].bg}`, borderRadius: 8, background: isOverdue(t) ? '#fff8f8' : 'white', cursor: job ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 4, opacity: statusOf(t) === 'completed' ? 0.75 : 1 }}>
              <div style={{ fontSize: 26, lineHeight: 1 }}>{taskIcon(t)}</div>
              <div style={{ fontSize: 12, fontWeight: 600, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
              {job && <div style={{ fontSize: 11, color: '#1976d2', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.name}</div>}
              {t.deadline && t.status !== 'completed' && dlBadge ? dlBadge(t.deadline, true) : statusPill(t)}
              {renderActions && <div onClick={e => e.stopPropagation()}>{renderActions(t)}</div>}
            </div>
          )
        })}
      </div>
    )
  } else if (view === 'list') {
    body = (
      <div style={{ columnWidth: 280, columnGap: 16 }}>
        {rows.map(t => {
          const job = jobById[t.job_id]
          return (
            <div key={t.id} onClick={() => open(t)} title={`${t.name}${job ? ' — ' + job.name : ''}${job?.client_name ? ' — ' + job.client_name : ''}`}
              style={{ breakInside: 'avoid', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 4, cursor: job ? 'pointer' : 'default', fontSize: 13, color: statusOf(t) === 'completed' ? '#6b7280' : '#111827' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#e3f2fd' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              <span style={{ flexShrink: 0 }}>{taskIcon(t)}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {t.name}{job && <span style={{ color: '#9ca3af' }}> — {job.name}</span>}
              </span>
              <span title={PRIORITY[priorityOf(job)].label} style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY[priorityOf(job)].bg, flexShrink: 0 }} />
            </div>
          )
        })}
      </div>
    )
  } else {
    body = (
      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, background: 'white' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr>
              {th('name', 'Task')}
              {th(null, 'Lucrare / Client')}
              {th('priority', 'Urgență')}
              {th('status', 'Status')}
              {th('created', 'Adăugat')}
              {th('deadline', 'Deadline')}
              {th('completed', 'Finalizat')}
              {th(null, 'Valoare', 'right')}
              {renderActions && th(null, '')}
            </tr>
          </thead>
          <tbody>
            {rows.map(t => {
              const job = jobById[t.job_id]
              return (
                <tr key={t.id} onClick={() => open(t)} style={{ cursor: job ? 'pointer' : 'default', background: isOverdue(t) ? '#fff8f8' : undefined, opacity: statusOf(t) === 'completed' ? 0.8 : 1 }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#f0f7ff' }} onMouseLeave={e => { e.currentTarget.style.background = isOverdue(t) ? '#fff8f8' : '' }}>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{taskIcon(t)}</span>
                      <div>
                        <div style={{ fontWeight: 600 }}>{t.name}</div>
                        {t.description && <div style={{ fontSize: 11, color: '#777', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={td}>
                    <div style={{ color: '#1976d2' }}>{job?.name || '—'}</div>
                    {job?.client_name && <div style={{ fontSize: 11, color: '#555' }}>{job.client_name}</div>}
                  </td>
                  <td style={td}>{priorityPill(job)}</td>
                  <td style={td}>{statusPill(t)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(t.created_at)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{t.deadline ? (dlBadge ? dlBadge(t.deadline, true) : fmtDate(t.deadline)) : '—'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(t.completed_at)}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{t.value != null && t.value !== '' ? `${parseFloat(t.value).toFixed(2)} lei` : '—'}</td>
                  {renderActions && <td style={td} onClick={e => e.stopPropagation()}>{renderActions(t)}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div>
      {toolbar}
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>{rows.length} din {tasks.length} taskuri</div>
      {empty || body}
    </div>
  )
}
