// Script: check-deadlines.js
// Usage: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and SMTP_* env vars, then run:
//   node scripts/check-deadlines.js

const { loadEnv } = require('../load-env')
loadEnv()
const nodemailer = require('nodemailer')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function buildTransport() {
  const host = process.env.SMTP_HOST
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const disableSmtp = String(process.env.DISABLE_SMTP || 'false').toLowerCase() === 'true'

  if (disableSmtp || !host || !user || !pass) {
    const testAccount = await nodemailer.createTestAccount()
    return { transporter: nodemailer.createTransport({ host: 'smtp.ethereal.email', port: 587, secure: false, auth: { user: testAccount.user, pass: testAccount.pass } }), preview: true }
  }
  const secure = port === 465 || String(process.env.SMTP_SECURE || 'false') === 'true'
  return { transporter: nodemailer.createTransport({ host, port, secure, auth: { user, pass } }), preview: false }
}

async function run() {
  try {
    const now = new Date().toISOString()
    // Find overdue tasks which are not completed and haven't had an alert sent
    const { data: tasks, error: tasksErr } = await supabase
      .from('tasks')
      .select('id,name,job_id,description,assigned_to,deadline')
      .lt('deadline', now)
      .neq('status', 'completed')
      .or('deadline_alert_sent.eq.false,deadline_alert_sent.is.null')

    if (tasksErr) throw tasksErr
    if (!tasks || tasks.length === 0) {
      console.log('No overdue tasks found')
      return
    }

    // Fetch related jobs
    const jobIds = Array.from(new Set(tasks.map(t => t.job_id).filter(Boolean)))
    const { data: jobs } = await supabase.from('jobs').select('id,name,client_email,client_name').in('id', jobIds)
    const jobsById = (jobs || []).reduce((acc, j) => { acc[j.id] = j; return acc }, {})

    // Get admin + CEO emails
    const { data: profiles } = await supabase.from('profiles').select('email,full_name,role').in('role', ['admin', 'ceo'])
    const recipients = (profiles || []).map(p => p.email).filter(Boolean)
    if (recipients.length === 0) {
      console.warn('No admin/CEO emails found in profiles; aborting notification')
      return
    }

    // Build email body
    const lines = []
    lines.push('Următoarele taskuri au depășit termenul:')
    lines.push('')
    tasks.forEach(t => {
      const job = jobsById[t.job_id]
      const jobName = job ? `${job.name}` : 'N/A'
      const deadline = t.deadline ? new Date(t.deadline).toLocaleString('ro-RO') : 'N/A'
      lines.push(`- Task: ${t.name} | Job: ${jobName} | Termen: ${deadline}`)
      if (t.description) lines.push(`    Descriere: ${t.description}`)
    })

    const text = lines.join('\n')
    const html = `<p>Următoarele taskuri au depășit termenul:</p><ul>${tasks.map(t => {
      const job = jobsById[t.job_id]
      const jobName = job ? `${job.name}` : 'N/A'
      const deadline = t.deadline ? new Date(t.deadline).toLocaleString('ro-RO') : 'N/A'
      return `<li><strong>${t.name}</strong> — Job: ${jobName} — Termen: ${deadline}<br/>${t.description ? `Descriere: ${t.description}` : ''}</li>`
    }).join('')}</ul>`

    // Send email
    const { transporter, preview } = await buildTransport()
    const mailOptions = {
      from: process.env.FROM_EMAIL || process.env.SMTP_USER,
      to: recipients.join(','),
      subject: 'Atenție: taskuri cu termen depășit',
      text,
      html
    }
    const info = await transporter.sendMail(mailOptions)
    console.log('Sent notification, messageId=', info.messageId)
    if (preview && nodemailer.getTestMessageUrl) console.log('Preview URL:', nodemailer.getTestMessageUrl(info))

    // Mark tasks as alerted
    const taskIds = tasks.map(t => t.id)
    const { error: updErr } = await supabase.from('tasks').update({ deadline_alert_sent: true }).in('id', taskIds)
    if (updErr) console.error('Failed to mark tasks as alerted', updErr)
    else console.log('Marked tasks as alerted')
  } catch (err) {
    console.error('check-deadlines failed', err)
    process.exitCode = 2
  }
}

run()
