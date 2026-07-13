import { useEffect, useState } from "react"

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
