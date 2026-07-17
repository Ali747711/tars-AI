import { useCallback, useEffect, useState } from "react"

export type LogEntry = {
  ts: number
  user?: string
  reply?: string
  kind?: string
  steps?: { tool: string; args?: unknown; ms?: number }[]
}

/** Poll the backend activity log (newest first). Pauses while tab hidden. */
export function useLog(httpBase: string, intervalMs = 15000): LogEntry[] {
  const [entries, setEntries] = useState<LogEntry[]>([])

  useEffect(() => {
    let active = true
    const tick = async () => {
      if (document.hidden) return
      try {
        const r = await fetch(`${httpBase}/log?limit=40`)
        if (r.ok && active) {
          const data: LogEntry[] = await r.json()
          setEntries([...data].reverse())
        }
      } catch {
        /* ignore */
      }
    }
    tick()
    const iv = window.setInterval(tick, intervalMs)
    const onVis = () => !document.hidden && tick()
    document.addEventListener("visibilitychange", onVis)
    return () => {
      active = false
      window.clearInterval(iv)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [httpBase, intervalMs])

  return entries
}

/**
 * Fetch a full day of the activity log on demand (newest first). State updates
 * only happen in promise callbacks, and `loading` is derived from whether the
 * loaded day matches the requested one — no setState in the effect body.
 */
export function useDayLog(httpBase: string, day: string) {
  const [loaded, setLoaded] = useState<{
    day: string
    entries: LogEntry[]
  } | null>(null)

  const refresh = useCallback(() => {
    fetch(`${httpBase}/log?day=${encodeURIComponent(day)}&limit=500`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: LogEntry[]) =>
        setLoaded({ day, entries: [...data].reverse() })
      )
      .catch(() => setLoaded({ day, entries: [] }))
  }, [httpBase, day])

  useEffect(() => {
    refresh()
  }, [refresh])

  const current = loaded?.day === day ? loaded.entries : []
  return { entries: current, loading: loaded?.day !== day, refresh }
}
