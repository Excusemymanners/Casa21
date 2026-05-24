// scripts/set-role.js
// Usage (PowerShell):
// $env:SUPABASE_URL='https://your-project.supabase.co'
// $env:SUPABASE_SERVICE_ROLE_KEY='your_service_role_key'
// node .\scripts\set-role.js --email angajat@gmail.com --role admin
// or
// node .\scripts\set-role.js --id b4291fa9-d872-4292-959a-5b8eacd2e817 --role admin

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables')
  process.exit(1)
}

const args = require('minimist')(process.argv.slice(2))
const email = args.email || null
const id = args.id || null
const role = args.role || null

if (!role || (!email && !id)) {
  console.error('Usage: node scripts/set-role.js --email user@example.com --role admin')
  console.error('   or: node scripts/set-role.js --id <profile-id> --role employee')
  process.exit(1)
}

if (email === 'overviewview8@gmail.com' || (!email && id === 'a5948c36-3aca-4a60-ae7b-5d533bee339d')) {
  console.error('Protected: cannot change role of main CEO account (overviewview8@gmail.com)')
  process.exit(1)
}

const fetch = global.fetch || require('node-fetch')

async function patchProfiles(filterQuery) {
  const url = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/profiles${filterQuery}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ role })
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch (e) { json = text }
  if (!res.ok) {
    console.error('Supabase error:', res.status, json)
    process.exit(1)
  }
  return json
}

;(async () => {
  try {
    if (email) {
      const filter = `?email=eq.${encodeURIComponent(email)}`
      const updated = await patchProfiles(filter)
      console.log('Updated rows:', updated)
      process.exit(0)
    }
    if (id) {
      const filter = `?id=eq.${encodeURIComponent(id)}`
      const updated = await patchProfiles(filter)
      console.log('Updated rows:', updated)
      process.exit(0)
    }
  } catch (err) {
    console.error('Unexpected error:', err)
    process.exit(1)
  }
})()
