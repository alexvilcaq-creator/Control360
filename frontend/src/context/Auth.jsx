import { createContext, useContext, useEffect, useState } from 'react'
import { request } from '../api/client'

const AuthContext = createContext(null)
const roles = new Set(['admin', 'seller', 'warehouse'])

function sessionUser(user) {
  if (!user?.id || !user.username || !roles.has(user.role)) {
    throw new Error('La API no devolvió una sesión válida.')
  }
  return user
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    const end = () => setUser(null)
    window.addEventListener('control360:session-ended', end)
    request('/auth/me/', { signal: controller.signal })
      .then(user => { if (!controller.signal.aborted) setUser(sessionUser(user)) })
      .catch(error => {
        if (error.name !== 'AbortError' && error.status !== 401) setError(error.message)
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => {
      controller.abort()
      window.removeEventListener('control360:session-ended', end)
    }
  }, [])

  async function login(credentials) {
    await request('/auth/csrf/')
    const data = await request('/auth/login/', { method: 'POST', body: credentials })
    setError('')
    setUser(sessionUser(data?.user))
  }

  async function logout() {
    await request('/auth/logout/', { method: 'POST' })
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, loading, error, login, logout }}>
    {children}
  </AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
