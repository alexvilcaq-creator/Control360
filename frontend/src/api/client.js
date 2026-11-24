const base = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '')
let csrfToken

function errorMessages(payload) {
  return Object.values(payload).flatMap(value =>
    typeof value === 'string' ? [value] : value && typeof value === 'object' ? errorMessages(value) : [])
}

export class ApiError extends Error {
  constructor(status, payload) {
    const fields = payload && typeof payload === 'object'
      ? errorMessages(payload) : []
    const unavailable = [502, 503, 504].includes(status) || (status === 500 && !payload)
    const message = unavailable
      ? 'Django no responde. Si estás en tu PC, inicia el backend de Control360 y vuelve a intentar.'
      : `La solicitud falló (HTTP ${status}).`
    super(payload?.detail || fields.join(' ') || message)
    this.status = status
  }
}

export async function request(path, { method = 'GET', body, signal, download = false } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (!csrfToken) await request('/auth/csrf/')
    headers['X-CSRFToken'] = csrfToken
  }
  const response = await fetch(`${base}${path}`, {
    method, headers, signal, credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(error => {
    if (error.name === 'AbortError') throw error
    throw new Error('No fue posible conectar con la API. Intenta de nuevo.')
  })
  if (response.ok && download) return response.blob()
  const payload = response.headers.get('Content-Type')?.includes('application/json')
    ? await response.json() : null
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login/') {
      csrfToken = undefined
      window.dispatchEvent(new Event('control360:session-ended'))
    }
    throw new ApiError(response.status, payload)
  }
  if (payload?.csrfToken) csrfToken = payload.csrfToken
  if (path === '/auth/logout/') csrfToken = undefined
  return payload
}
