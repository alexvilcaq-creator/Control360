import { useEffect, useState } from 'react'

export function usePolling(load, delay = 15000) {
  const [state, setState] = useState({ loading: true })
  useEffect(() => {
    let controller
    function refresh() {
      controller?.abort()
      controller = new AbortController()
      const { signal } = controller
      load(signal).then(data => {
        if (!signal.aborted) setState({ data })
      }).catch(error => {
        if (!signal.aborted) setState(previous => ({ ...previous, loading: false, error: error.message }))
      })
    }
    refresh()
    const timer = delay ? setInterval(refresh, delay) : undefined
    if (delay) window.addEventListener('control360:notifications', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('control360:notifications', refresh)
      controller?.abort()
    }
  }, [load, delay])
  return state
}
