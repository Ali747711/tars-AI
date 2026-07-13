import { useCallback, useEffect, useState } from "react"

export type Routine = {
  id: string
  name: string
  cron: string
  prompt: string
  enabled: boolean
}

/** Fetch + mutate scheduled routines on the backend. */
export function useRoutines(httpBase: string) {
  const [routines, setRoutines] = useState<Routine[]>([])

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${httpBase}/routines`)
      if (r.ok) setRoutines(await r.json())
    } catch {
      /* backend may be down */
    }
  }, [httpBase])

  useEffect(() => {
    refresh()
  }, [refresh])

  const add = useCallback(
    async (body: { name: string; cron: string; prompt: string }) => {
      const r = await fetch(`${httpBase}/routines`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      await refresh()
      return r.ok
    },
    [httpBase, refresh]
  )

  const toggle = useCallback(
    async (id: string) => {
      await fetch(`${httpBase}/routines/${id}/toggle`, { method: "POST" })
      await refresh()
    },
    [httpBase, refresh]
  )

  const remove = useCallback(
    async (id: string) => {
      await fetch(`${httpBase}/routines/${id}`, { method: "DELETE" })
      await refresh()
    },
    [httpBase, refresh]
  )

  return { routines, add, toggle, remove, refresh }
}
