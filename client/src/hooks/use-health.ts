import { useEffect, useState } from "react"

export type Health = {
  ok: boolean
  provider?: string
  model?: string
  tools?: number
  sessions?: number
  routines?: number
}

const OFFLINE: Health = { ok: false }

/** Poll the backend /health endpoint. Pauses while the tab is hidden. */
export function useHealth(httpBase: string, intervalMs = 15000): Health {
  const [health, setHealth] = useState<Health>(OFFLINE)

  useEffect(() => {
    let active = true
    const tick = async () => {
      if (document.hidden) return
      try {
        const r = await fetch(`${httpBase}/health`)
        if (active) setHealth(r.ok ? await r.json() : OFFLINE)
      } catch {
        if (active) setHealth(OFFLINE)
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

  return health
}
