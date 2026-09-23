// Usage: node scripts/test-deadline-reminder.js
// Runs the deadline reminder mailer manually (useful for testing without waiting for cron).

const { loadEnv } = require('../load-env')
loadEnv()

const { sendDeadlineReminderEmails } = require('../server/deadline-reminder-mailer')

sendDeadlineReminderEmails()
  .then((results) => {
    console.log('Done:', results || 'no results')
    process.exit(0)
  })
  .catch((err) => {
    console.error('Error:', err)
    process.exit(1)
  })
