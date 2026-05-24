const { withClient } = require('./_db')

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // function name from path /api/rpc/<name>
    const parts = (req.url || '').split('/').filter(Boolean)
    const fnName = parts[0] || (req.body && req.body.name)
    if (!fnName) return res.status(400).json({ error: 'Missing RPC function name' })

    // Params: either array or object. If object, use insertion order of values.
    const params = req.body && req.body.args !== undefined ? req.body.args : req.body || {}
    const values = Array.isArray(params) ? params : Object.values(params || {})
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ')
    const sql = `SELECT * FROM ${fnName}(${placeholders});`

    const result = await withClient(async (client) => {
      return await client.query(sql, values)
    })

    return res.status(200).json({ data: result.rows })
  } catch (err) {
    console.error('RPC error', err)
    return res.status(500).json({ error: err.message || 'RPC failed' })
  }
}
