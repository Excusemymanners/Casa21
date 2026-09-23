/**
 * POST /api/send-daily-tasks
 * Trigger manual pentru email-urile zilnice de taskuri.
 * Util pentru testare fără a aștepta cron-ul.
 * Opțional: protejat cu header x-check-secret.
 */
const { sendDailyTasksEmails } = require('../server/daily-tasks-mailer')

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const secret = process.env.CHECK_DEADLINES_SECRET
  if (secret) {
    const provided = req.headers['x-check-secret']
    if (!provided || provided !== secret) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' })
    }
  }

  try {
    const results = await sendDailyTasksEmails()
    return res.status(200).json({ ok: true, results })
  } catch (err) {
    console.error('send-daily-tasks error', err)
    return res.status(500).json({ ok: false, error: err.message })
  }
}
