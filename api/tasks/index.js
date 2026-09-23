const jwt = require('jsonwebtoken')
const { withClient } = require('../_db')

function authUser(req) {
  const auth = req.headers.authorization || ''
  const m = auth.match(/^Bearer (.+)$/)
  if (!m) return null
  try { return jwt.verify(m[1], process.env.JWT_SECRET) } catch (e) { return null }
}

module.exports = async (req, res) => {
  const user = authUser(req)
  const method = req.method
  const parts = (req.path || '').split('/').filter(Boolean)
  const id = parts[0]
  const q = req.query || {}

  try {
    if (method === 'GET') {
      return await withClient(async (client) => {
        if (id) {
          const { rows } = await client.query('SELECT * FROM public.tasks WHERE id = $1', [id])
          if (!rows.length) return res.status(404).json({ error: 'Not found' })
          return res.json({ data: rows[0] })
        }
        let sql = 'SELECT * FROM public.tasks'
        const params = []
        const where = []
        if (q.eqField && q.eqValue != null) { params.push(q.eqValue); where.push(`${q.eqField} = $${params.length}`) }
        if (q.ltField && q.ltValue != null) { params.push(q.ltValue); where.push(`${q.ltField} < $${params.length}`) }
        if (q.neqField && q.neqValue != null) { params.push(q.neqValue); where.push(`${q.neqField} <> $${params.length}`) }
        if (q.inField && q.inValue != null) {
          const values = String(q.inValue).split(',').filter(Boolean)
          const ph = values.map((_, i) => `$${params.length + i + 1}`).join(', ')
          params.push(...values)
          where.push(`${q.inField} IN (${ph})`)
        }
        if (where.length) sql += ' WHERE ' + where.join(' AND ')
        if (q.orderField) sql += ` ORDER BY ${q.orderField} ${q.orderDir === 'asc' ? 'ASC' : 'DESC'}`
        const { rows } = await client.query(sql, params)
        return res.json({ data: rows })
      })
    }

    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    if (method === 'POST') {
      return await withClient(async (client) => {
        const body = Array.isArray(req.body) ? req.body : [req.body || {}]
        const inserted = []
        for (const row of body) {
          // Normalize assigned_to: if values are emails (not UUIDs), move them to assigned_to_emails
          try {
            const isUuid = (s) => typeof s === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s)
            if (row.assigned_to) {
              if (Array.isArray(row.assigned_to)) {
                // if first element is not a uuid, treat array as emails
                if (row.assigned_to.length > 0 && !isUuid(row.assigned_to[0])) {
                  row.assigned_to_emails = row.assigned_to.map(String)
                  row.assigned_to = null
                }
              } else if (typeof row.assigned_to === 'string') {
                if (!isUuid(row.assigned_to)) {
                  row.assigned_to_emails = [row.assigned_to]
                  row.assigned_to = null
                } else {
                  // single uuid string -> store as array
                  row.assigned_to = [row.assigned_to]
                }
              }
            }
            // Also normalize assigned_to_email -> assigned_to_emails
            if (row.assigned_to_email && !row.assigned_to_emails) {
              row.assigned_to_emails = [String(row.assigned_to_email)]
              delete row.assigned_to_email
            }
          } catch (e) {
            // normalization shouldn't block inserts
          }
          // stringify JS objects/arrays for JSONB columns, but avoid double-encoding
          const jsonCols = []
          // Columns that are SQL arrays and should NOT be JSON-stringified
          const sqlArrayCols = new Set(['assigned_to', 'assigned_to_emails'])
          for (const k of Object.keys(row)) {
            const v = row[k]
            // If it's an object (but not an array) -> stringify for JSONB
            if (v != null && typeof v === 'object' && !Array.isArray(v)) {
              row[k] = JSON.stringify(v)
              jsonCols.push(k)
            } else if (Array.isArray(v)) {
              // If it's an array, only stringify it when it's NOT a SQL array column
              if (!sqlArrayCols.has(k)) {
                row[k] = JSON.stringify(v)
                jsonCols.push(k)
              }
            } else if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
              // assume already-serialized JSON string
              jsonCols.push(k)
            }
          }
          const cols = Object.keys(row)
          const vals = Object.values(row)
          const placeholders = cols.map((c, i) => `$${i + 1}${jsonCols.includes(c) ? '::jsonb' : ''}`).join(', ')
          const sql = `INSERT INTO public.tasks (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`
          const { rows } = await client.query(sql, vals)
          inserted.push(rows[0])
        }
        return res.json({ data: inserted })
      })
    }

    if ((method === 'PUT' || method === 'PATCH') && (id || (q.eqField && q.eqValue != null))) {
      return await withClient(async (client) => {
        const body = req.body || {}
        // sanitize assigned_to similarly to POST
        try {
          const isUuid = (s) => typeof s === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s)
          if (body.assigned_to) {
            if (Array.isArray(body.assigned_to)) {
              if (body.assigned_to.length > 0 && !isUuid(body.assigned_to[0])) {
                body.assigned_to_emails = body.assigned_to.map(String)
                body.assigned_to = null
              }
            } else if (typeof body.assigned_to === 'string') {
              if (!isUuid(body.assigned_to)) {
                body.assigned_to_emails = [body.assigned_to]
                body.assigned_to = null
              } else {
                body.assigned_to = [body.assigned_to]
              }
            }
          }
          if (body.assigned_to_email && !body.assigned_to_emails) {
            body.assigned_to_emails = [String(body.assigned_to_email)]
            delete body.assigned_to_email
          }
        } catch (e) {
          // ignore
        }
        // stringify JS objects/arrays for JSONB columns, but avoid double-encoding
        const jsonCols = []
        // Columns that are SQL arrays and should NOT be JSON-stringified
        const sqlArrayCols2 = new Set(['assigned_to', 'assigned_to_emails'])
        for (const k of Object.keys(body)) {
          const v = body[k]
          if (v != null && typeof v === 'object' && !Array.isArray(v)) {
            body[k] = JSON.stringify(v)
            jsonCols.push(k)
          } else if (Array.isArray(v)) {
            if (!sqlArrayCols2.has(k)) {
              body[k] = JSON.stringify(v)
              jsonCols.push(k)
            }
          } else if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
            // assume already-serialized JSON string
            jsonCols.push(k)
          }
        }
        const cols = Object.keys(body)
        const vals = Object.values(body)
        const set = cols.map((c, i) => `${c} = $${i + 1}${jsonCols.includes(c) ? '::jsonb' : ''}`).join(', ')
        const whereField = id ? 'id' : q.eqField
        const whereValue = id || q.eqValue
        const sql = `UPDATE public.tasks SET ${set} WHERE ${whereField} = $${cols.length + 1} RETURNING *`
        // Debug logging when updating completers to inspect SQL and params
        if (body.completers) console.log('[tasks:update] SQL:', sql, 'PARAMS:', [...vals, whereValue])
        const { rows } = await client.query(sql, [...vals, whereValue])
        if (!rows.length) return res.status(404).json({ error: 'Not found' })
        const updatedTask = rows[0]
        // Auto-complete job when all its tasks are completed
        if (updatedTask && updatedTask.status === 'completed' && updatedTask.job_id) {
          try {
            const { rows: rem } = await client.query(
              `SELECT COUNT(*) AS c FROM public.tasks WHERE job_id = $1 AND status <> 'completed'`,
              [updatedTask.job_id]
            )
            if (parseInt(rem[0].c, 10) === 0) {
              await client.query(
                `UPDATE public.jobs SET status = 'completed', completed_at = NOW() WHERE id = $1 AND (status IS NULL OR status <> 'completed')`,
                [updatedTask.job_id]
              )
            }
          } catch (autoErr) { console.warn('[tasks:patch] auto-complete job failed:', autoErr.message) }
        }
        // Auto-reopen job if a task is un-completed
        if (updatedTask && updatedTask.status !== 'completed' && updatedTask.job_id) {
          try {
            await client.query(
              `UPDATE public.jobs SET status = 'todo', completed_at = NULL WHERE id = $1 AND status = 'completed'`,
              [updatedTask.job_id]
            )
          } catch (autoErr) { console.warn('[tasks:patch] auto-reopen job failed:', autoErr.message) }
        }
        return res.json({ data: rows })
      })
    }

    if (method === 'DELETE' && (id || (q.eqField && q.eqValue != null))) {
      return await withClient(async (client) => {
        const whereField = id ? 'id' : q.eqField
        const whereValue = id || q.eqValue
        const { rows } = await client.query(`DELETE FROM public.tasks WHERE ${whereField} = $1 RETURNING *`, [whereValue])
        return res.json({ data: rows })
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('tasks handler error', err)
    return res.status(500).json({ error: err.message })
  }
}
