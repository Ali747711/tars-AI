import { useCallback, useEffect, useState } from "react"

export type Memory = {
  id: string
  text: string
  ts: number
}

/**
 * Fetch + mutate Jarvis's long-term memories on the backend. State updates
 * only happen in promise callbacks (`loading` is derived), which keeps the
 * initial-load effect free of synchronous setState.
 */
export function useMemory(httpBase: string) {
  const [memories, setMemories] = useState<Memory[] | null>(null)

  const refresh = useCallback(() => {
    return fetch(`${httpBase}/memory`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Memory[]) => setMemories(data))
      .catch(() => setMemories((m) => m ?? []))
  }, [httpBase])

  useEffect(() => {
    refresh()
  }, [refresh])

  const add = useCallback(
    async (text: string) => {
      const r = await fetch(`${httpBase}/memory`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      })
      await refresh()
      return r.ok
    },
    [httpBase, refresh]
  )

  const remove = useCallback(
    async (id: string) => {
      await fetch(`${httpBase}/memory/${id}`, { method: "DELETE" })
      await refresh()
    },
    [httpBase, refresh]
  )

  return { memories: memories ?? [], loading: memories === null, add, remove, refresh }
}
