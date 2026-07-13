import { useEffect, useState } from "react"

export type HudData = {
  battery: string
  app: string
  tab: string
  music: string
}

const EMPTY: HudData = { battery: "—", app: "—", tab: "—", music: "—" }

function clean(out: string, max = 30): string {
  const t = out.trim()
  if (!t || /^ERROR/i.test(t) || /not running/i.test(t)) return ""
  return t.length > max ? t.slice(0, max) + "…" : t
}

/**
 * Polls the backend's direct-exec endpoint for live status readouts (battery,
 * frontmost app, active Chrome tab, now-playing). Pauses while the tab is
 * hidden so Jarvis isn't running AppleScript in the background all day.
 */
export function useHudData(httpBase: string, intervalMs = 20000): HudData {
  const [data, setData] = useState<HudData>(EMPTY)

  useEffect(() => {
    let active = true

    const call = async (name: string): Promise<string> => {
      try {
        const r = await fetch(`${httpBase}/tool`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, args: {} }),
        })
        const j = await r.json()
        return r.ok ? String(j.output ?? "") : ""
      } catch {
        return ""
      }
    }

    const tick = async () => {
      if (document.hidden) return
      const [battery, app, tab, music] = await Promise.all([
        call("system_get_battery_status"),
        call("system_get_frontmost_app"),
        call("chrome_get_active_tab"),
        call("music_current"),
      ])
      if (!active) return
      setData({
        battery: clean(battery, 18) || "—",
        app: clean(app, 22) || "—",
        tab: clean(tab.split(" | ")[0], 30) || "—",
        music: clean(music.replace(/^playing:\s*/i, ""), 30) || "—",
      })
    }

    tick()
    const iv = window.setInterval(tick, intervalMs)
    const onVis = () => {
      if (!document.hidden) tick()
    }
    document.addEventListener("visibilitychange", onVis)

    return () => {
      active = false
      window.clearInterval(iv)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [httpBase, intervalMs])

  return data
}
