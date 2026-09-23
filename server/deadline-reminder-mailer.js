/**
 * deadline-reminder-mailer.js
 *
 * Sends reminder emails to collaborators when a task deadline is
 * exactly 5, 3, 2 or 1 calendar days away.
 *
 * Called by node-cron at 10:00, 12:00, 14:00, 16:00 (Europe/Bucharest).
 */

const nodemailer = require('nodemailer')
const { withClient } = require('../api/_db')

const REMINDER_DAYS = [5, 3, 2, 1]

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

function daysUntilDeadline(deadlineStr) {
  const now = new Date()
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dl = new Date(deadlineStr)
  const dlMidnight = new Date(dl.getFullYear(), dl.getMonth(), dl.getDate())
  return Math.round((dlMidnight - todayMidnight) / (24 * 60 * 60 * 1000))
}

async function sendDeadlineReminderEmails() {
  const label = new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })
  console.log(`[deadline-reminder] Running at ${label}...`)

  try {
    // Fetch all employees
    const employees = await withClient(async (client) => {
      const r = await client.query(
        `SELECT id, email, full_name FROM profiles WHERE email IS NOT NULL AND email <> ''`
      )
      return r.rows
    })

    if (!employees || employees.length === 0) {
      console.log('[deadline-reminder] No profiles found, skipping.')
      return
    }

    // Fetch all active tasks with upcoming deadlines
    const upcomingTasks = await withClient(async (client) => {
      const r = await client.query(`
        SELECT
          t.id, t.name, t.description, t.status, t.deadline, t.value,
          t.job_id, t.assigned_to, t.assigned_to_emails,
          j.name AS job_name, j.client_name, j.priority
        FROM tasks t
        LEFT JOIN jobs j ON j.id = t.job_id
        WHERE t.status NOT IN ('completed')
          AND (j.status IS NULL OR j.status <> 'completed')
          AND t.deadline IS NOT NULL
          AND t.deadline >= NOW()
          AND t.deadline <= NOW() + INTERVAL '6 days'
        ORDER BY t.deadline ASC
      `)
      return r.rows
    })

    // Filter only tasks with exactly 1, 2, 3, or 5 days until deadline
    const reminderTasks = upcomingTasks.filter(t => REMINDER_DAYS.includes(daysUntilDeadline(t.deadline)))

    if (reminderTasks.length === 0) {
      console.log('[deadline-reminder] No tasks with matching deadlines today, skipping.')
      return
    }

    const { transporter, preview } = await buildTransport()
    const from = process.env.FROM_EMAIL || process.env.SMTP_USER || 'noreply@overview.local'
    const results = []

    for (const emp of employees) {
      if (!emp.email) continue

      const empId = String(emp.id)
      const empEmail = (emp.email || '').toLowerCase()

      // Find reminder tasks assigned to this employee (or unassigned)
      const myReminders = reminderTasks.filter(task => {
        let assignedArr = []
        if (Array.isArray(task.assigned_to)) assignedArr = task.assigned_to.map(String)
        else if (task.assigned_to) assignedArr = [String(task.assigned_to)]

        let assignedEmails = []
        if (Array.isArray(task.assigned_to_emails)) assignedEmails = task.assigned_to_emails.map(s => (s || '').toLowerCase())

        const isUnassigned = assignedArr.length === 0 && assignedEmails.length === 0
        return assignedArr.includes(empId) || assignedEmails.includes(empEmail) || isUnassigned
      })

      if (myReminders.length === 0) continue

      const displayName = emp.full_name || empEmail
      const now = new Date()
      const dateStr = now.toLocaleDateString('ro-RO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      const timeStr = now.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })

      const urgencyLabel = (days) => {
        if (days === 1) return { text: '🔴 MÂINE', color: '#c62828' }
        if (days === 2) return { text: '🟠 2 zile', color: '#e65100' }
        if (days === 3) return { text: '🟡 3 zile', color: '#f57f17' }
        return { text: `📅 ${days} zile`, color: '#1565c0' }
      }

      const taskRowHtml = (task) => {
        const days = daysUntilDeadline(task.deadline)
        const urg = urgencyLabel(days)
        const deadlineFormatted = new Date(task.deadline).toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' })
        const priorityColor = task.priority === 'urgent' ? '#f44336' : task.priority === 'repede' ? '#ff9800' : '#607d8b'
        return `
          <tr>
            <td style="padding:12px 14px;border-bottom:1px solid #f0f0f0;vertical-align:top">
              <div style="font-weight:700;font-size:14px">${task.name}</div>
              ${task.description ? `<div style="font-size:12px;color:#666;margin-top:3px">${task.description}</div>` : ''}
              <div style="font-size:12px;margin-top:5px">
                <span>📁 ${task.job_name || 'N/A'}</span>
                ${task.client_name ? `&nbsp;·&nbsp;<span>👤 ${task.client_name}</span>` : ''}
                &nbsp;·&nbsp;<span style="background:${priorityColor};color:white;padding:1px 6px;border-radius:4px;font-size:11px">${task.priority || 'normal'}</span>
              </div>
            </td>
            <td style="padding:12px 14px;border-bottom:1px solid #f0f0f0;vertical-align:top;white-space:nowrap;text-align:center">
              <div style="font-weight:700;font-size:13px;color:${urg.color}">${urg.text}</div>
              <div style="font-size:12px;color:#555;margin-top:3px">${deadlineFormatted}</div>
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

    <div style="background:#b71c1c;padding:22px 28px;border-radius:10px 10px 0 0">
      <div style="color:white;font-size:20px;font-weight:700">⏰ Overview — Reminder Termene</div>
      <div style="color:rgba(255,255,255,0.7);font-size:13px;margin-top:4px">${dateStr} · ${timeStr}</div>
    </div>

    <div style="padding:20px 28px 28px;background:#f0f2f5">
      <p style="margin:0 0 4px;font-size:15px">Bună ziua, <strong>${displayName}</strong>!</p>
      <p style="margin:0 0 18px;font-size:13px;color:#666">
        Ai <strong>${myReminders.length}</strong> ${myReminders.length === 1 ? 'task cu termen' : 'taskuri cu termene'} care se apropie. Te rugăm să acționezi la timp.
      </p>

      <table style="width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.07)">
        <thead>
          <tr style="background:#b71c1c;color:white">
            <th style="padding:10px 14px;text-align:left;font-size:13px">Task / Lucrare</th>
            <th style="padding:10px 14px;text-align:center;font-size:13px;white-space:nowrap">Termen rămas</th>
          </tr>
        </thead>
        <tbody>${myReminders.map(taskRowHtml).join('')}</tbody>
      </table>
    </div>

    <div style="background:#ffebee;padding:14px 28px;border-radius:0 0 10px 10px;text-align:center;border-top:2px solid #ef9a9a">
      <span style="font-size:11px;color:#c62828;font-weight:600">⚠ Reminder automat Overview · Nu răspunde la acest email</span>
    </div>

  </div>
</body>
</html>`

      const textLines = [
        `Reminder termene — ${dateStr} ${timeStr}`,
        `Bună ziua, ${displayName}! Ai ${myReminders.length} taskuri cu termene apropiate:`,
        '',
        ...myReminders.map(t => {
          const days = daysUntilDeadline(t.deadline)
          return `  - [${days === 1 ? 'MÂINE' : days + ' zile'}] ${t.name} | ${t.job_name || 'N/A'} | ${new Date(t.deadline).toLocaleDateString('ro-RO')}`
        })
      ]

      try {
        const info = await transporter.sendMail({
          from,
          to: emp.email,
          subject: `⏰ Reminder termene Overview — ${myReminders.length} task${myReminders.length > 1 ? 'uri' : ''} cu deadline apropiat`,
          text: textLines.join('\n'),
          html
        })
        const previewUrl = preview && nodemailer.getTestMessageUrl ? nodemailer.getTestMessageUrl(info) : null
        console.log(`[deadline-reminder] Sent to ${emp.email} (${myReminders.length} tasks)${previewUrl ? ' | Preview: ' + previewUrl : ''}`)
        results.push({ email: emp.email, ok: true, count: myReminders.length })
      } catch (mailErr) {
        console.error(`[deadline-reminder] Failed to send to ${emp.email}:`, mailErr.message)
        results.push({ email: emp.email, ok: false, error: mailErr.message })
      }
    }

    console.log(`[deadline-reminder] Done. Sent to ${results.filter(r => r.ok).length}/${results.length} users.`)
    return results
  } catch (err) {
    console.error('[deadline-reminder] Fatal error:', err)
    throw err
  }
}

module.exports = { sendDeadlineReminderEmails }
