const jwt = require('jsonwebtoken')
const nodemailer = require('nodemailer')
const { withClient } = require('./_db')

function authUser(req) {
  const auth = req.headers.authorization || ''
  const m = auth.match(/^Bearer (.+)$/)
  if (!m) return null
  try { return jwt.verify(m[1], process.env.JWT_SECRET) } catch (e) { return null }
}

async function buildTransport() {
  const host = process.env.SMTP_HOST
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const disableSmtp = String(process.env.DISABLE_SMTP || 'false').toLowerCase() === 'true'

  if (disableSmtp || !host || !user || !pass) {
    const testAccount = await nodemailer.createTestAccount()
    const transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email', port: 587, secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass }
    })
    return { transporter, preview: true }
  }

  const secure = port === 465 || String(process.env.SMTP_SECURE || 'false') === 'true'
  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } })
  return { transporter, preview: false }
}

function daysUntil(deadlineStr) {
  if (!deadlineStr) return null
  const now = new Date()
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dl = new Date(deadlineStr)
  const dlMidnight = new Date(dl.getFullYear(), dl.getMonth(), dl.getDate())
  return Math.round((dlMidnight - todayMidnight) / (24 * 60 * 60 * 1000))
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const caller = authUser(req)
  if (!caller) return res.status(401).json({ error: 'Unauthorized' })
  if (!['admin', 'ceo'].includes(caller.role)) return res.status(403).json({ error: 'Forbidden' })

  const { employeeId, employeeEmail } = req.body || {}
  if (!employeeId && !employeeEmail) return res.status(400).json({ error: 'Missing employeeId or employeeEmail' })

  try {
    // Fetch employee profile
    const profile = await withClient(async (client) => {
      let r
      if (employeeId) {
        r = await client.query(`SELECT id, email, full_name FROM profiles WHERE id = $1`, [employeeId])
      } else {
        r = await client.query(`SELECT id, email, full_name FROM profiles WHERE email = $1`, [employeeEmail])
      }
      return r.rows[0] || null
    })

    if (!profile || !profile.email) return res.status(404).json({ error: 'Employee not found or has no email' })

    const empId = String(profile.id)
    const empEmail = (profile.email || '').toLowerCase()

    // Fetch pending tasks assigned to this employee
    const tasks = await withClient(async (client) => {
      const r = await client.query(`
        SELECT
          t.id, t.name, t.description, t.status, t.deadline, t.value,
          t.job_id, t.assigned_to, t.assigned_to_emails,
          j.name AS job_name, j.client_name, j.priority
        FROM tasks t
        LEFT JOIN jobs j ON j.id = t.job_id
        WHERE t.status NOT IN ('completed')
          AND (j.status IS NULL OR j.status <> 'completed')
          AND (
            $1::uuid = ANY(COALESCE(t.assigned_to, ARRAY[]::uuid[]))
            OR lower($2) = ANY(COALESCE(t.assigned_to_emails, ARRAY[]::text[]))
          )
        ORDER BY t.deadline ASC NULLS LAST
      `, [empId, empEmail])
      return r.rows
    })

    if (tasks.length === 0) {
      return res.json({ ok: true, sent: false, reason: 'no_pending_tasks' })
    }

    const displayName = profile.full_name || profile.email
    const now = new Date()
    const dateStr = now.toLocaleDateString('ro-RO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const timeStr = now.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })

    const urgBadge = (days) => {
      if (days === null) return { text: 'fără termen', color: '#9e9e9e' }
      if (days < 0) return { text: `⚠ ${Math.abs(days)}z întârziere`, color: '#b71c1c' }
      if (days === 0) return { text: '🔴 AZI', color: '#c62828' }
      if (days === 1) return { text: '🔴 MÂINE', color: '#c62828' }
      if (days <= 3) return { text: `🟠 ${days} zile`, color: '#e65100' }
      if (days <= 7) return { text: `🟡 ${days} zile`, color: '#f57f17' }
      return { text: `📅 ${days} zile`, color: '#1565c0' }
    }

    const taskRowHtml = (task) => {
      const days = daysUntil(task.deadline)
      const urg = urgBadge(days)
      const deadlineFormatted = task.deadline
        ? new Date(task.deadline).toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' })
        : '—'
      const statusColor = task.status === 'stand_by' ? '#1565c0' : '#e65100'
      const statusLabel = task.status === 'stand_by' ? 'Stand By' : 'În lucru'
      const priorityColor = task.priority === 'urgent' ? '#f44336' : task.priority === 'repede' ? '#ff9800' : '#607d8b'
      return `
        <tr>
          <td style="padding:12px 14px;border-bottom:1px solid #f0f0f0;vertical-align:top">
            <div style="font-weight:700;font-size:14px">${task.name}</div>
            ${task.description ? `<div style="font-size:12px;color:#555;margin-top:2px">${task.description}</div>` : ''}
            <div style="margin-top:5px;font-size:12px;display:flex;gap:6px;flex-wrap:wrap">
              <span>📁 ${task.job_name || 'N/A'}</span>
              ${task.client_name ? `<span>· 👤 <strong>${task.client_name}</strong></span>` : ''}
              <span style="background:${statusColor};color:white;padding:1px 7px;border-radius:4px">${statusLabel}</span>
              <span style="background:${priorityColor};color:white;padding:1px 7px;border-radius:4px">${task.priority || 'normal'}</span>
            </div>
          </td>
          <td style="padding:12px 14px;border-bottom:1px solid #f0f0f0;vertical-align:top;white-space:nowrap;text-align:center">
            <div style="font-weight:700;font-size:13px;color:${urg.color}">${urg.text}</div>
            <div style="font-size:12px;color:#777;margin-top:2px">${deadlineFormatted}</div>
            ${task.value != null ? `<div style="font-size:12px;color:#2e7d32;margin-top:3px">💰 ${parseFloat(task.value).toFixed(2)} lei</div>` : ''}
          </td>
        </tr>`
    }

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif">
  <div style="max-width:680px;margin:24px auto;background:#f0f2f5">

    <div style="background:#e65100;padding:22px 28px;border-radius:10px 10px 0 0">
      <div style="color:white;font-size:20px;font-weight:700">📋 Overview — Taskuri ce necesită atenție</div>
      <div style="color:rgba(255,255,255,0.75);font-size:13px;margin-top:4px">${dateStr} · ${timeStr}</div>
    </div>

    <div style="padding:20px 28px 28px;background:#f0f2f5">
      <p style="margin:0 0 4px;font-size:15px">Bună ziua, <strong>${displayName}</strong>!</p>
      <p style="margin:0 0 18px;font-size:13px;color:#555">
        Echipa de management a solicitat revizuirea taskurilor tale active.
        Ai <strong>${tasks.length}</strong> ${tasks.length === 1 ? 'task activ' : 'taskuri active'} care necesită atenție:
      </p>

      <table style="width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.07)">
        <thead>
          <tr style="background:#e65100;color:white">
            <th style="padding:10px 14px;text-align:left;font-size:13px">Task / Lucrare</th>
            <th style="padding:10px 14px;text-align:center;font-size:13px;white-space:nowrap">Deadline</th>
          </tr>
        </thead>
        <tbody>${tasks.map(taskRowHtml).join('')}</tbody>
      </table>

      <p style="margin:18px 0 0;font-size:13px;color:#555">
        Te rugăm să actualizezi statusul taskurilor sau să contactezi managerul dacă ai nevoie de suport.
      </p>
    </div>

    <div style="background:#fff3e0;padding:14px 28px;border-radius:0 0 10px 10px;text-align:center;border-top:2px solid #ffcc80">
      <span style="font-size:11px;color:#bf360c;font-weight:600">⚠ Notificare trimisă de echipa de management · Nu răspunde la acest email</span>
    </div>

  </div>
</body>
</html>`

    const textLines = [
      `Taskuri ce necesită atenție — ${dateStr} ${timeStr}`,
      `Bună ziua, ${displayName}! Ai ${tasks.length} taskuri active care necesită atenție:`,
      '',
      ...tasks.map(t => {
        const days = daysUntil(t.deadline)
        const dlStr = t.deadline ? new Date(t.deadline).toLocaleDateString('ro-RO') : 'fără termen'
        return `  - ${t.name} | ${t.job_name || 'N/A'} | ${dlStr}${days !== null && days <= 3 ? ` ← URGENT (${days}z)` : ''}`
      })
    ]

    const { transporter, preview } = await buildTransport()
    const from = process.env.FROM_EMAIL || process.env.SMTP_USER || 'noreply@overview.local'

    const info = await transporter.sendMail({
      from,
      to: profile.email,
      subject: `📋 Taskuri ce necesită atenția ta — ${tasks.length} active`,
      text: textLines.join('\n'),
      html
    })

    const previewUrl = preview && nodemailer.getTestMessageUrl ? nodemailer.getTestMessageUrl(info) : null
    console.log(`[notify-employee] Sent to ${profile.email} (${tasks.length} tasks)${previewUrl ? ' | ' + previewUrl : ''}`)

    return res.json({ ok: true, sent: true, taskCount: tasks.length, to: profile.email, previewUrl })
  } catch (err) {
    console.error('[notify-employee] error:', err)
    return res.status(500).json({ error: err.message })
  }
}
