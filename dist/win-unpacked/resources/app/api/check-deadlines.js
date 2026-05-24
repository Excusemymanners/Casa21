const nodemailer = require('nodemailer')
const { createClient } = require('@supabase/supabase-js')

// Serverless endpoint for checking deadlines and notifying admins/CEOs
// Protect this endpoint with a secret header: `x-check-secret: <CHECK_DEADLINES_SECRET>`

module.exports = async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    const CHECK_SECRET = process.env.CHECK_DEADLINES_SECRET

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment')
      return res.status(500).json({ ok: false, error: 'Server misconfigured' })
    }

    // Verify secret header
    const provided = req.headers['x-check-secret'] || req.headers['x-check-secret']
    if (!CHECK_SECRET || !provided || provided !== CHECK_SECRET) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Build mail transport (use Ethereal if SMTP not configured)
    async function buildTransport() {
      const host = process.env.SMTP_HOST
      const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587
      const user = process.env.SMTP_USER
      const pass = process.env.SMTP_PASS
      const disableSmtp = String(process.env.DISABLE_SMTP || 'false').toLowerCase() === 'true'

      if (disableSmtp || !host || !user || !pass) {
        const testAccount = await nodemailer.createTestAccount()
        const transporter = nodemailer.createTransport({ host: 'smtp.ethereal.email', port: 587, secure: false, auth: { user: testAccount.user, pass: testAccount.pass } })
        return { transporter, preview: true }
      }
      const secure = port === 465 || String(process.env.SMTP_SECURE || 'false') === 'true'
      const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } })
      return { transporter, preview: false }
    }

    const now = new Date().toISOString()
    const { data: tasks, error: tasksErr } = await supabase
      .from('tasks')
      .select('id,name,job_id,description,assigned_to,assigned_to_emails,deadline')
      .lt('deadline', now)
      .neq('status', 'completed')
      .or('deadline_alert_sent.eq.false,deadline_alert_sent.is.null')

    if (tasksErr) {
      console.error('Supabase tasks query error', tasksErr)
      return res.status(500).json({ ok: false, error: 'DB error' })
    }

    if (!tasks || tasks.length === 0) {
      return res.status(200).json({ ok: true, message: 'No overdue tasks' })
    }

    const jobIds = Array.from(new Set(tasks.map(t => t.job_id).filter(Boolean)))
    const { data: jobs } = await supabase.from('jobs').select('id,name,client_email,client_name').in('id', jobIds)
    const jobsById = (jobs || []).reduce((acc, j) => { acc[j.id] = j; return acc }, {})

    // Fetch admin + CEO emails
    const { data: profiles } = await supabase.from('profiles').select('email,full_name,role').in('role', ['admin', 'ceo'])
    const adminRecipients = (profiles || []).map(p => p.email).filter(Boolean)

    if (adminRecipients.length === 0) {
      console.warn('No admin/CEO emails found in profiles; aborting notification')
      return res.status(200).json({ ok: false, error: 'No admin/CEO recipients' })
    }

    // Compose email body
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

    const { transporter, preview } = await buildTransport()
    const mailOptions = {
      from: process.env.FROM_EMAIL || process.env.SMTP_USER,
      to: adminRecipients.join(','),
      subject: 'Atenție: taskuri cu termen depășit',
      text,
      html
    }

    const info = await transporter.sendMail(mailOptions)
    if (preview && nodemailer.getTestMessageUrl) console.log('Preview URL:', nodemailer.getTestMessageUrl(info))

    // Mark tasks as alerted
    const taskIds = tasks.map(t => t.id)
    const { error: updErr } = await supabase.from('tasks').update({ deadline_alert_sent: true }).in('id', taskIds)
    if (updErr) console.error('Failed to mark tasks as alerted', updErr)

    return res.status(200).json({ ok: true, sentTo: adminRecipients, alertedTasks: taskIds.length })
  } catch (err) {
    console.error('check-deadlines endpoint failed', err)
    return res.status(500).json({ ok: false, error: String(err) })
  }
}
