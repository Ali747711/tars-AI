import { useCallback, useEffect, useState } from "react"

export type ToolProp = {
  type?: string
  description?: string
  enum?: string[]
  default?: unknown
}

export type ToolSchema = {
  type?: string
  properties?: Record<string, ToolProp>
  required?: string[]
}

export type ToolInfo = {
  name: string
  description: string
  inputSchema: ToolSchema
  confirm: boolean
}

export type RunResult = { ok: true; output: string } | { ok: false; error: string }

/**
 * Fetches the backend tool catalog and exposes a direct runner that hits
 * POST /tool (bypasses the LLM). Gated tools require confirm=true.
 */
export function useTools(httpBase: string) {
  const [tools, setTools] = useState<ToolInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetch(`${httpBase}/tools`)
      .then((r) => r.json())
      .then((data: ToolInfo[]) => {
        if (!active) return
        setTools(data)
        setError(null)
      })
      .catch((e) => active && setError(String(e?.message ?? e)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [httpBase])

  const runTool = useCallback(
    async (
      name: string,
      args: Record<string, unknown>,
      confirm: boolean
    ): Promise<RunResult> => {
      try {
        const res = await fetch(`${httpBase}/tool`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, args, confirm }),
        })
        // The backend may respond with an HTML error page (e.g. an old build
        // without this route). Parse defensively so we surface a clear message.
        const raw = await res.text()
        let data: { output?: unknown; error?: unknown } = {}
        try {
          data = raw ? JSON.parse(raw) : {}
        } catch {
          return {
            ok: false,
            error:
              res.status === 404
                ? "endpoint missing — restart the backend (node jarvis/server.mjs)"
                : `unexpected non-JSON response (HTTP ${res.status})`,
          }
        }
        if (!res.ok) return { ok: false, error: String(data.error ?? `HTTP ${res.status}`) }
        return { ok: true, output: String(data.output ?? "") }
      } catch (e) {
        return { ok: false, error: String((e as Error)?.message ?? e) }
      }
    },
    [httpBase]
  )

  return { tools, loading, error, runTool }
}
