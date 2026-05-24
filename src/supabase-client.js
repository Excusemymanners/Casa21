const API_BASE = ''

function getToken() {
  try { return localStorage.getItem('access_token') } catch (e) { return null }
}

async function apiFetch(path, options = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {})
  const token = getToken()
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`
  const resp = await fetch(`${API_BASE}${path}`, { ...options, headers })
  const text = await resp.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch (e) { body = { raw: text } }
  if (!resp.ok) {
    const err = new Error(body && body.error ? body.error : `Request failed: ${resp.status}`)
    err.status = resp.status
    err.body = body
    throw err
  }
  return body
}

function buildQuery(params) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, v)
  }
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}

function makeTable(table) {
  const state = { type: 'select', filters: [], orderField: null, orderDir: 'desc', single: false, payload: null, whereField: null, whereValue: null }

  const api = {
    select: (fields = '*') => {
      state.select = fields
      return api
    },
    order: (field, opts = {}) => { state.orderField = field; state.orderDir = opts.ascending ? 'asc' : 'desc'; return api },
    eq: (field, value) => {
      if (state.type !== 'select' && !state.whereField) { state.whereField = field; state.whereValue = value }
      else state.filters.push({ op: 'eq', field, value })
      return api
    },
    lt: (field, value) => { state.filters.push({ op: 'lt', field, value }); return api },
    neq: (field, value) => { state.filters.push({ op: 'neq', field, value }); return api },
    in: (field, value) => { state.filters.push({ op: 'in', field, value }); return api },
    or: (expr) => { state.or = expr; return api },
    single: () => { state.single = true; return api },
    limit: (n) => { if (n === 1) state.single = true; return api },
    insert: (rows) => { state.type = 'insert'; state.payload = rows; return api },
    update: (updates) => { state.type = 'update'; state.payload = updates; return api },
    delete: () => { state.type = 'delete'; return api },
    execute: async () => {
      if (state.type === 'insert') {
        const body = await apiFetch(`/api/${table}`, { method: 'POST', body: JSON.stringify(state.payload) })
        let data = body.data || body.profile || null
        if (state.single && Array.isArray(data)) data = data[0] || null
        return { data, error: null }
      }
      if (state.type === 'update') {
        const field = state.whereField || (state.filters.find(f => f.op === 'eq') || {}).field || 'id'
        const value = state.whereValue || (state.filters.find(f => f.op === 'eq') || {}).value
        if (value == null) return { data: null, error: new Error('Missing filter for update') }
        const path = field === 'id' ? `/api/${table}/${value}` : `/api/${table}${buildQuery({ eqField: field, eqValue: value })}`
        const body = await apiFetch(path, { method: 'PUT', body: JSON.stringify(state.payload) })
        let data = body.data || body.profile || null
        if (state.single && Array.isArray(data)) data = data[0] || null
        return { data, error: null }
      }
      if (state.type === 'delete') {
        const field = state.whereField || (state.filters.find(f => f.op === 'eq') || {}).field || 'id'
        const value = state.whereValue || (state.filters.find(f => f.op === 'eq') || {}).value
        if (value == null) return { data: null, error: new Error('Missing filter for delete') }
        const path = field === 'id' ? `/api/${table}/${value}` : `/api/${table}${buildQuery({ eqField: field, eqValue: value })}`
        const body = await apiFetch(path, { method: 'DELETE' })
        return { data: body.data || null, error: null }
      }

      const q = {}
      const firstEq = state.filters.find(f => f.op === 'eq')
      const firstLt = state.filters.find(f => f.op === 'lt')
      const firstNeq = state.filters.find(f => f.op === 'neq')
      const firstIn = state.filters.find(f => f.op === 'in')
      if (firstEq) { q.eqField = firstEq.field; q.eqValue = firstEq.value }
      if (firstLt) { q.ltField = firstLt.field; q.ltValue = firstLt.value }
      if (firstNeq) { q.neqField = firstNeq.field; q.neqValue = firstNeq.value }
      if (firstIn) { q.inField = firstIn.field; q.inValue = Array.isArray(firstIn.value) ? firstIn.value.join(',') : firstIn.value }
      if (state.orderField) { q.orderField = state.orderField; q.orderDir = state.orderDir }
      const path = `/api/${table}${buildQuery(q)}`
      const body = await apiFetch(path, { method: 'GET' })
      let data = body.data || body.profile || body.profiles || null
      if (state.single) {
        if (Array.isArray(data)) data = data[0] || null
        return { data, error: null }
      }
      return { data, error: null }
    },
    then: (resolve, reject) => api.execute().then(resolve, reject)
  }

  return api
}

const supabase = {
  auth: {
    signInWithPassword: async ({ email, password }) => {
      const body = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      try { localStorage.setItem('access_token', body.access_token) } catch (e) {}
      return { data: { user: body.user, session: { access_token: body.access_token } }, error: null }
    },
    signUp: async ({ email, password }) => {
      const body = await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) })
      return { data: { user: body.user }, error: null }
    },
    getUser: async () => {
      const token = getToken()
      if (!token) return { data: { user: null }, error: null }
      const body = await apiFetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      return { data: { user: body.user }, error: null }
    },
    admin: {
      deleteUser: async () => ({ data: null, error: new Error('Not implemented in local auth') })
    }
  },
  from: (table) => makeTable(table),
  rpc: async (name, params = {}) => {
    // POST to /api/rpc/<name> with params as body
    const body = await apiFetch(`/api/rpc/${encodeURIComponent(name)}`, { method: 'POST', body: JSON.stringify(params) })
    // API returns { data }
    return { data: body.data || null, error: null }
  }
}

export default supabase
