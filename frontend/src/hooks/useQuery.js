import { useEffect, useState } from 'react'

export function useQuery(load) {
  const [state, setState] = useState({ loading: true })
  useEffect(() => {
    const controller = new AbortController()
    setState({ loading: true })
    load(controller.signal)
      .then(data => { if (!controller.signal.aborted) setState({ data }) })
      .catch(error => { if (!controller.signal.aborted) setState({ error: error.message }) })
    return () => controller.abort()
  }, [load])
  return state
}
