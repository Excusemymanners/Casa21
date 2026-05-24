const { Client } = require('pg')

async function withClient(fn) {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

module.exports = { withClient }
