import { useCallback, useEffect, useState } from 'react'

export default function useAsyncData(loader) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }))
    try {
      const data = await loader()
      setState({ data, error: null, loading: false })
    } catch (error) {
      setState({ data: null, error, loading: false })
    }
  }, [loader])

  useEffect(() => {
    const task = Promise.resolve().then(load)
    return () => { void task }
  }, [load])
  return { ...state, reload: load }
}
