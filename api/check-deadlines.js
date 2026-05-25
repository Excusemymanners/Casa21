const nodemailer = require('nodemailer')
const { withClient } = require('./_db')

// Serverless endpoint for checking deadlines and notifying admins/CEOs
// Protect this endpoint with a secret header: `x-check-secret: <CHECK_DEADLINES_SECRET>`

module.exports = async (req, res) => {
  try {
    const CHECK_SECRET = process.env.CHECK_DEADLINES_SECRET

    // Verify secret header (if configured)
    if (CHECK_SECRET) {
      const provided = req.headers['x-check-secret'] || req.headers['x-check-secret']
      if (!provided || provided !== CHECK_SECRET) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' })
      }
    }

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

    // Query local Postgres for overdue tasks and notify admins
    const now = new Date().toISOString()
    const tasks = await withClient(async (client) => {
      const q = `SELECT id, name, job_id, description, assigned_to, assigned_to_emails, deadline FROM tasks WHERE deadline < $1 AND (status IS NULL OR status <> 'completed') AND (deadline_alert_sent IS FALSE OR deadline_alert_sent IS NULL)`
      const r = await client.query(q, [now])
      return r.rows
    })

    if (!tasks || tasks.length === 0) {
      return res.status(200).json({ ok: true, message: 'No overdue tasks' })
    }

    const jobIds = Array.from(new Set(tasks.map(t => t.job_id).filter(Boolean)))
    const jobs = await withClient(async (client) => {
      if (jobIds.length === 0) return []
      const q = `SELECT id, name, client_email, client_name FROM jobs WHERE id = ANY($1)`
      const r = await client.query(q, [jobIds])
      return r.rows
    })
    const jobsById = (jobs || []).reduce((acc, j) => { acc[j.id] = j; return acc }, {})

    // Fetch admin + CEO emails from local profiles
    const profiles = await withClient(async (client) => {
      const q = `SELECT email, full_name, role FROM profiles WHERE role = ANY($1)`
      const r = await client.query(q, [['admin','ceo']])
      return r.rows
    })
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
    await withClient(async (client) => {
      const q = `UPDATE tasks SET deadline_alert_sent = true WHERE id = ANY($1)`
      await client.query(q, [taskIds])
    })

    return res.status(200).json({ ok: true, sentTo: adminRecipients, alertedTasks: taskIds.length })
  } catch (err) {
    console.error('check-deadlines endpoint failed', err)
    return res.status(500).json({ ok: false, error: String(err) })
  }
}
