import React, { useMemo, useState } from 'react'
import { PRIORITY, VIEWS, loadPrefs, savePrefs, btn, selectStyle, pill } from './TaskExplorer'

// Listele de lucrări: filtru status / urgență, sortare și moduri de vizualizare ca în Explorer.
// Modul „Carduri” folosește cardurile existente ale dashboard-ului (renderCards), cu ordonare prin tragere.

const JOB_STATUS = {
  todo: { label: 'În lucru', bg: '#fff3e0', color: '#e65100' },
  completed: { label: 'Finalizat', bg: '#e8f5e9', color: '#2e7d32' },
}
const SORTS = {
  manual: { label: 'Ordine manuală' },
  created: { label: 'Data adăugării' },
  deadline: { label: 'Deadline cel mai apropiat' },
  completed: { label: 'Data finalizării' },
  priority: { label: 'Urgență' },
  status: { label: 'Status (în lucru / finalizat)' },
  client: { label: 'Client' },
  value: { label: 'Valoare' },
}
const JOB_VIEWS = [{ key: 'cards', icon: '▤', label: 'Carduri' }, ...VIEWS]

const statusOf = (j) => (j.status === 'completed' ? 'completed' : 'todo')
const priorityOf = (j) => (PRIORITY[j?.priority] ? j.priority : 'normal')
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('ro-RO') : '—')
const time = (v) => (v ? new Date(v).getTime() : null)
const manualOrder = (a, b) => {
  if (a.sort_order != null && b.sort_order != null) return a.sort_order - b.sort_order
  if (a.sort_order != null) return -1
  if (b.sort_order != null) return 1
  return new Date(a.created_at) - new Date(b.created_at)
}

export default function JobExplorer({ jobs = [], tasks = [], dlBadge, onOpen, renderCards, responsibleName, storageKey, defaultStatus = 'todo', emptyText = 'Nu sunt lucrări în această categorie.' }) {
  const initial = loadPrefs(storageKey)
  const [view, setView] = useState(initial.view || 'cards')
  const [statusFilter, setStatusFilter] = useState(initial.statusFilter || defaultStatus)
  const [priorityFilter, setPriorityFilter] = useState(initial.priorityFilter || 'all')
  const [sortKey, setSortKey] = useState(initial.sortKey || 'manual')
  const [sortDir, setSortDir] = useState(initial.sortDir || 'asc')

  const update = (patch) => {
    const next = { view, statusFilter, priorityFilter, sortKey, sortDir, ...patch }
    if ('view' in patch) setView(patch.view)
    if ('statusFilter' in patch) setStatusFilter(patch.statusFilter)
    if ('priorityFilter' in patch) setPriorityFilter(patch.priorityFilter)
    if ('sortKey' in patch) setSortKey(patch.sortKey)
    if ('sortDir' in patch) setSortDir(patch.sortDir)
    savePrefs(storageKey, next)
  }
  const sortBy = (key) => {
    if (key === sortKey) update({ sortDir: sortDir === 'asc' ? 'desc' : 'asc' })
    else update({ sortKey: key, sortDir: ['created', 'completed', 'value'].includes(key) ? 'desc' : 'asc' })
  }

  // Progres + cel mai apropiat deadline deschis, per lucrare
  const info = useMemo(() => {
    const m = {}
    for (const t of tasks || []) {
      const i = m[t.job_id] || (m[t.job_id] = { total: 0, done: 0, deadline: null })
      i.total += 1
      if (t.status === 'completed') i.done += 1
      else if (t.deadline && (!i.deadline || new Date(t.deadline) < new Date(i.deadline))) i.deadline = t.deadline
    }
    return m
  }, [tasks])
  const infoOf = (j) => info[j.id] || { total: 0, done: 0, deadline: null }

  const counts = useMemo(() => {
    const c = { all: jobs.length, todo: 0, completed: 0 }
    jobs.forEach(j => { c[statusOf(j)] += 1 })
    return c
  }, [jobs])

  const rows = useMemo(() => {
    const filtered = jobs.filter(j => {
      if (statusFilter !== 'all' && statusOf(j) !== statusFilter) return false
      if (priorityFilter !== 'all' && priorityOf(j) !== priorityFilter) return false
      return true
    })
    if (sortKey === 'manual') {
      const s = filtered.sort(manualOrder)
      return sortDir === 'desc' ? s.reverse() : s
    }
    const dir = sortDir === 'asc' ? 1 : -1
    const value = (j) => {
      switch (sortKey) {
        case 'deadline': return time((info[j.id] || {}).deadline)
        case 'completed': return time(j.completed_at)
        case 'priority': return PRIORITY[priorityOf(j)].rank
        case 'status': return statusOf(j) === 'completed' ? 1 : 0
        case 'client': return (j.client_name || '').toLowerCase()
        case 'value': return j.total_value != null ? parseFloat(j.total_value) : null
        default: return time(j.created_at)
      }
    }
    return filtered.sort((a, b) => {
      const va = value(a), vb = value(b)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (va < vb) return -1 * dir
      if (va > vb) return 1 * dir
      return 0
    })
  }, [jobs, statusFilter, priorityFilter, sortKey, sortDir, info])

  const open = (j) => onOpen && onOpen(j)
  const statusPill = (j) => { const s = JOB_STATUS[statusOf(j)]; return <span style={pill(s.bg, s.color)}>{s.label}</span> }
  const priorityPill = (j) => { const p = PRIORITY[priorityOf(j)]; return <span style={pill(p.bg, 'white')}>{p.label}</span> }
  const isLate = (j) => statusOf(j) !== 'completed' && infoOf(j).deadline && new Date(infoOf(j).deadline) < new Date()
  const jobIcon = (j) => (statusOf(j) === 'completed' ? '✅' : isLate(j) ? '⚠️' : '📁')
  const money = (v) => (v != null && v !== '' ? `${parseFloat(v).toFixed(2)} lei` : '—')

  const toolbar = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12, padding: 10, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8 }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} role="group" aria-label="Vizualizare">
        {JOB_VIEWS.map(v => (
          <button key={v.key} type="button" title={v.label} onClick={() => update({ view: v.key })} style={btn(view === v.key)}>
            <span style={{ marginRight: 4 }}>{v.icon}</span>{v.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} role="group" aria-label="Status">
        {[['all', 'Toate'], ['todo', 'În lucru'], ['completed', 'Finalizate']].map(([k, l]) => (
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

  const th = (key, label, align = 'left') => (
    <th onClick={key ? () => sortBy(key) : undefined} style={{ textAlign: align, padding: '8px 10px', borderBottom: '2px solid #e5e7eb', color: '#555', fontSize: 12, fontWeight: 600, cursor: key ? 'pointer' : 'default', whiteSpace: 'nowrap', userSelect: 'none', background: '#fafafa' }}>
      {label}{key === sortKey && <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  )
  const td = { padding: '7px 10px', borderBottom: '1px solid #f0f0f0', fontSize: 13, verticalAlign: 'middle' }

  let body
  if (rows.length === 0) {
    body = <p style={{ color: '#6b7280', fontSize: 14 }}>{jobs.length === 0 ? emptyText : 'Nicio lucrare nu corespunde filtrelor alese.'}</p>
  } else if (view === 'cards' && renderCards) {
    // Tragerea pentru reordonare are sens doar în ordinea manuală
    body = renderCards(rows, { keepOrder: true, draggable: sortKey === 'manual' && sortDir === 'asc' })
  } else if (view === 'icons') {
    body = (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
        {rows.map(j => {
          const i = infoOf(j)
          return (
            <div key={j.id} onClick={() => open(j)} title={`${j.name}${j.client_name ? ' — ' + j.client_name : ''}`}
              style={{ padding: 10, border: '1px solid #e5e7eb', borderTop: `3px solid ${PRIORITY[priorityOf(j)].bg}`, borderRadius: 8, background: isLate(j) ? '#fff8f8' : 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 4, opacity: statusOf(j) === 'completed' ? 0.8 : 1 }}>
              <div style={{ fontSize: 26, lineHeight: 1 }}>{jobIcon(j)}</div>
              <div style={{ fontSize: 12, fontWeight: 600, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.client_name || j.name}</div>
              <div style={{ fontSize: 11, color: '#1976d2', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>{i.done}/{i.total} taskuri</div>
              {i.deadline && statusOf(j) !== 'completed' && dlBadge ? dlBadge(i.deadline, true) : statusPill(j)}
            </div>
          )
        })}
      </div>
    )
  } else if (view === 'list') {
    body = (
      <div style={{ columnWidth: 280, columnGap: 16 }}>
        {rows.map(j => (
          <div key={j.id} onClick={() => open(j)} title={`${j.name}${j.client_name ? ' — ' + j.client_name : ''}`}
            style={{ breakInside: 'avoid', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 4, cursor: 'pointer', fontSize: 13, color: statusOf(j) === 'completed' ? '#6b7280' : '#111827' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#e3f2fd' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
            <span style={{ flexShrink: 0 }}>{jobIcon(j)}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {j.client_name || '—'}<span style={{ color: '#9ca3af' }}> — {j.name}</span>
            </span>
            <span title={PRIORITY[priorityOf(j)].label} style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY[priorityOf(j)].bg, flexShrink: 0 }} />
          </div>
        ))}
      </div>
    )
  } else {
    body = (
      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, background: 'white' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
          <thead>
            <tr>
              {th('client', 'Client / Lucrare')}
              {responsibleName && th(null, 'Responsabil')}
              {th('priority', 'Urgență')}
              {th('status', 'Status')}
              {th(null, 'Taskuri')}
              {th('created', 'Adăugat')}
              {th('deadline', 'Deadline')}
              {th('completed', 'Finalizat')}
              {th('value', 'Valoare', 'right')}
            </tr>
          </thead>
          <tbody>
            {rows.map(j => {
              const i = infoOf(j)
              return (
                <tr key={j.id} onClick={() => open(j)} style={{ cursor: 'pointer', background: isLate(j) ? '#fff8f8' : undefined, opacity: statusOf(j) === 'completed' ? 0.85 : 1 }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#f0f7ff' }} onMouseLeave={e => { e.currentTarget.style.background = isLate(j) ? '#fff8f8' : '' }}>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{jobIcon(j)}</span>
                      <div>
                        <div style={{ fontWeight: 600 }}>{j.client_name || '—'}</div>
                        <div style={{ fontSize: 11, color: '#1976d2' }}>{j.name}{j.order_number ? ` · Nr. ${j.order_number}` : ''}</div>
                      </div>
                    </div>
                  </td>
                  {responsibleName && <td style={td}>{responsibleName(j.responsible_id) || '—'}</td>}
                  <td style={td}>{priorityPill(j)}</td>
                  <td style={td}>{statusPill(j)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{i.done}/{i.total}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(j.created_at)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{i.deadline && statusOf(j) !== 'completed' ? (dlBadge ? dlBadge(i.deadline, true) : fmtDate(i.deadline)) : '—'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(j.completed_at)}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{money(j.total_value)}</td>
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
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>{rows.length} din {jobs.length} lucrări</div>
      {body}
    </div>
  )
}
