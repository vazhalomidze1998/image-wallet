import { useEffect, useState } from 'react'

/** Current time, re-rendering every `intervalMs` while `active` (for countdowns). */
export function useNow(active = true, intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [active, intervalMs])
  return now
}
