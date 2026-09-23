/**
 * daily-tasks-mailer.js
 *
 * Sends each employee an email with:
 *  - their own active (non-completed) tasks
 *  - active tasks that are unassigned (no assigned_to, no assigned_to_emails)
 *
 * Called by the node-cron scheduler in server.js at 09:00, 12:00, 17:00.
 */

const nodemailer = require('nodemailer')
const { withClient } = require('../api/_db')

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

async function sendDailyTasksEmails() {
  const label = new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })
  console.log(`[daily-tasks-mailer] Sending daily task emails at ${label}...`)

  try {
    // 1. Fetch all employees
    const employees = await withClient(async (client) => {
      const r = await client.query(
        `SELECT id, email, full_name FROM profiles WHERE role = 'employee' AND email IS NOT NULL AND email <> ''`
      )
      return r.rows
    })

    if (!employees || employees.length === 0) {
      console.log('[daily-tasks-mailer] No employee profiles found, skipping.')
      return
    }

    // 2. Fetch all active (non-completed) tasks with their job info
    const activeTasks = await withClient(async (client) => {
      const r = await client.query(`
        SELECT
          t.id, t.name, t.description, t.status, t.deadline, t.value,
          t.job_id, t.assigned_to, t.assigned_to_emails,
          j.name AS job_name, j.client_name, j.priority
        FROM tasks t
        LEFT JOIN jobs j ON j.id = t.job_id
        WHERE t.status <> 'completed'
          AND (j.status IS NULL OR j.status <> 'completed')
        ORDER BY t.deadline ASC NULLS LAST, t.created_at ASC
      `)
      return r.rows
    })

    const { transporter, preview } = await buildTransport()
    const from = process.env.FROM_EMAIL || process.env.SMTP_USER || 'noreply@overview.local'
    const results = []

    for (const emp of employees) {
      if (!emp.email) continue

      // Normalize employee id/email
      const empId = String(emp.id)
      const empEmail = (emp.email || '').toLowerCase()

      const myTasks = []
      const unassignedTasks = []

      for (const task of activeTasks) {
        // Parse assigned_to — Postgres may return array or null
        let assignedArr = []
        if (Array.isArray(task.assigned_to)) {
          assignedArr = task.assigned_to.map(String)
        } else if (task.assigned_to) {
          assignedArr = [String(task.assigned_to)]
        }

        let assignedEmails = []
        if (Array.isArray(task.assigned_to_emails)) {
          assignedEmails = task.assigned_to_emails.map(s => (s || '').toLowerCase())
        }

        const isAssignedToMe = assignedArr.includes(empId) || assignedEmails.includes(empEmail)
        const isUnassigned = assignedArr.length === 0 && assignedEmails.length === 0

        if (isAssignedToMe) {
          myTasks.push(task)
        } else if (isUnassigned) {
          unassignedTasks.push(task)
        }
      }

      if (myTasks.length === 0 && unassignedTasks.length === 0) {
        console.log(`[daily-tasks-mailer] No tasks for ${empEmail}, skipping.`)
        continue
      }

      const displayName = emp.full_name || empEmail
      const now = new Date()
      const dateStr = now.toLocaleDateString('ro-RO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      const timeStr = now.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })

      // Build HTML email
      const taskRowHtml = (task) => {
        const deadlineStr = task.deadline
          ? `<span style="color:${new Date(task.deadline) < now ? '#c62828' : '#555'}">📅 ${new Date(task.deadline).toLocaleDateString('ro-RO')}</span>`
          : '<span style="color:#999">Fără termen</span>'
        const valueStr = task.value != null ? `<span style="color:#2e7d32">💰 ${parseFloat(task.value).toFixed(2)} lei</span>` : ''
        const priorityColor = task.priority === 'urgent' ? '#f44336' : task.priority === 'repede' ? '#ff9800' : '#607d8b'
        return `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;vertical-align:top">
              <div style="font-weight:600;font-size:14px">${task.name}</div>
              ${task.description ? `<div style="font-size:12px;color:#666;margin-top:3px">${task.description}</div>` : ''}
              <div style="font-size:12px;margin-top:4px;display:flex;gap:12px;flex-wrap:wrap">
                <span>📁 ${task.job_name || 'N/A'}</span>
                ${task.client_name ? `<span>👤 ${task.client_name}</span>` : ''}
                <span style="background:${priorityColor};color:white;padding:1px 6px;border-radius:4px;font-size:11px">${task.priority || 'normal'}</span>
              </div>
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;vertical-align:top;white-space:nowrap">
              ${deadlineStr}<br/>${valueStr}
            </td>
          </tr>`
      }

      const mySection = myTasks.length > 0 ? `
        <h3 style="color:#1a1a2e;margin:24px 0 10px;font-size:16px">✅ Taskurile tale (${myTasks.length})</h3>
        <table style="width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.07)">
          <thead>
            <tr style="background:#16213e;color:white">
              <th style="padding:10px 12px;text-align:left;font-size:13px">Task / Lucrare</th>
              <th style="padding:10px 12px;text-align:left;font-size:13px;white-space:nowrap">Termen / Valoare</th>
            </tr>
          </thead>
          <tbody>${myTasks.map(taskRowHtml).join('')}</tbody>
        </table>` : ''

      const unassignedSection = unassignedTasks.length > 0 ? `
        <h3 style="color:#1a1a2e;margin:24px 0 10px;font-size:16px">📋 Taskuri neasignate disponibile (${unassignedTasks.length})</h3>
        <p style="font-size:12px;color:#888;margin:0 0 8px">Aceste taskuri nu sunt asignate nimănui — le poți prelua.</p>
        <table style="width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.07)">
          <thead>
            <tr style="background:#455a64;color:white">
              <th style="padding:10px 12px;text-align:left;font-size:13px">Task / Lucrare</th>
              <th style="padding:10px 12px;text-align:left;font-size:13px;white-space:nowrap">Termen / Valoare</th>
            </tr>
          </thead>
          <tbody>${unassignedTasks.map(taskRowHtml).join('')}</tbody>
        </table>` : ''

      const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif">
  <div style="max-width:680px;margin:24px auto;background:#f0f2f5">

    <!-- Header -->
    <div style="background:#16213e;padding:22px 28px;border-radius:10px 10px 0 0">
      <div style="color:white;font-size:20px;font-weight:700">Overview — Taskuri zilnice</div>
      <div style="color:rgba(255,255,255,0.6);font-size:13px;margin-top:4px">${dateStr} · ${timeStr}</div>
    </div>

    <!-- Body -->
    <div style="padding:20px 28px 28px;background:#f0f2f5">
      <p style="margin:0 0 4px;font-size:15px">Bună ziua, <strong>${displayName}</strong>!</p>
      <p style="margin:0 0 18px;font-size:13px;color:#666">Mai jos găsești situația taskurilor tale active pentru azi.</p>

      ${mySection}
      ${unassignedSection}

      ${myTasks.length === 0 && unassignedTasks.length === 0
        ? '<p style="color:#999;font-style:italic;text-align:center;padding:20px 0">Nu ai taskuri active momentan.</p>'
        : ''}
    </div>

    <!-- Footer -->
    <div style="background:#e8eaf6;padding:14px 28px;border-radius:0 0 10px 10px;text-align:center">
      <span style="font-size:11px;color:#999">Generat automat de Overview · Nu răspunde la acest email</span>
    </div>

  </div>
</body>
</html>`

      const text = [
        `Bună ziua, ${displayName}! Situația taskurilor tale active — ${dateStr} ${timeStr}`,
        '',
        myTasks.length > 0 ? `TASKURILE TALE (${myTasks.length}):` : '',
        ...myTasks.map(t => `  - ${t.name} [${t.job_name || 'N/A'}] ${t.deadline ? '| Termen: ' + new Date(t.deadline).toLocaleDateString('ro-RO') : ''} ${t.value != null ? '| ' + t.value + ' lei' : ''}`),
        '',
        unassignedTasks.length > 0 ? `TASKURI NEASIGNATE (${unassignedTasks.length}):` : '',
        ...unassignedTasks.map(t => `  - ${t.name} [${t.job_name || 'N/A'}] ${t.deadline ? '| Termen: ' + new Date(t.deadline).toLocaleDateString('ro-RO') : ''}`),
      ].filter(l => l !== '').join('\n')

      try {
        const info = await transporter.sendMail({
          from,
          to: emp.email,
          subject: `📋 Taskuri zilnice Overview — ${timeStr}`,
          text,
          html
        })
        const previewUrl = preview && nodemailer.getTestMessageUrl ? nodemailer.getTestMessageUrl(info) : null
        console.log(`[daily-tasks-mailer] Sent to ${emp.email}${previewUrl ? ' | Preview: ' + previewUrl : ''}`)
        results.push({ email: emp.email, ok: true, myTasks: myTasks.length, unassigned: unassignedTasks.length })
      } catch (mailErr) {
        console.error(`[daily-tasks-mailer] Failed to send to ${emp.email}:`, mailErr.message)
        results.push({ email: emp.email, ok: false, error: mailErr.message })
      }
    }

    console.log(`[daily-tasks-mailer] Done. Sent to ${results.filter(r => r.ok).length}/${results.length} employees.`)
    return results
  } catch (err) {
    console.error('[daily-tasks-mailer] Fatal error:', err)
    throw err
  }
}

module.exports = { sendDailyTasksEmails }
