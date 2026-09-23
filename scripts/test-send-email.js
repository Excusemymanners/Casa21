const { loadEnv } = require('../load-env');
loadEnv();

async function main() {
  const to = process.argv[2] || process.env.SMTP_USER;
  if (!to) {
    console.error('Usage: node scripts/test-send-email.js <recipient@email>');
    process.exit(1);
  }

  const payload = {
    to,
    subject: 'Test SMTP - Overview',
    text: 'Acesta este un email de test pentru configurarea SMTP. Daca il primesti, setup-ul functioneaza.',
    html: '<p>Acesta este un email de test pentru configurarea <strong>SMTP</strong>.</p><p>Daca il primesti, setup-ul functioneaza.</p>'
  };

  const res = await fetch('http://localhost:3001/api/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));
  console.log('HTTP', res.status);
  console.log(JSON.stringify(data, null, 2));

  if (!res.ok) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
