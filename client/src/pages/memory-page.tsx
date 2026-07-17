import { useState } from "react"
import { Brain, Plus, Search, Trash2 } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { useMemory } from "@/hooks/use-memory"

const when = (ts: number) =>
  new Date(ts).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })

export function MemoryPage({ httpBase }: { httpBase: string }) {
  const { memories, loading, add, remove } = useMemory(httpBase)
  const [draft, setDraft] = useState("")
  const [query, setQuery] = useState("")
  const [saving, setSaving] = useState(false)

  const q = query.toLowerCase().trim()
  const filtered = q ? memories.filter((m) => m.text.toLowerCase().includes(q)) : memories

  const submit = async () => {
    const text = draft.trim()
    if (!text || saving) return
    setSaving(true)
    try {
      if (await add(text)) setDraft("")
    } finally {
      setSaving(false)
    }
  }

  const input =
    "rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"

  return (
    <div className="mx-auto w-full max-w-3xl overflow-y-auto p-4 sm:p-6">
      <PageHeader
        title="Memory"
        description={`Everything Jarvis remembers about you — ${memories.length} ${memories.length === 1 ? "fact" : "facts"}.`}
      />

      {/* Add */}
      <div className="flex gap-2 duration-500 animate-in fade-in">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Teach Jarvis a fact… e.g. I prefer tea over coffee after 6pm"
          className={`${input} flex-1`}
        />
        <Button size="sm" onClick={submit} disabled={!draft.trim() || saving} className="gap-1.5">
          <Plus className="size-3.5" /> {saving ? "Saving…" : "Remember"}
        </Button>
      </div>

      {/* Search */}
      <div className="relative mt-2 duration-500 animate-in fade-in">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search memories…"
          className={`${input} w-full pl-8`}
        />
      </div>

      <div className="mt-4 flex flex-col gap-2 delay-75 duration-500 animate-in fade-in slide-in-from-bottom-2">
        {loading ? (
          <p className="px-1 text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="surface flex flex-col items-center gap-2 rounded-xl px-4 py-10 text-center">
            <Brain className="size-6 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {q
                ? "No memories match that search."
                : "Nothing here yet. Tell Jarvis “remember that…” in chat, or add a fact above."}
            </p>
          </div>
        ) : (
          filtered.map((m) => (
            <div key={m.id} className="surface group flex items-start gap-3 rounded-xl px-3.5 py-2.5">
              <Brain className="mt-0.5 size-4 shrink-0 text-primary/60" />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug">{m.text}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{when(m.ts)}</p>
              </div>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => remove(m.id)}
                title="Forget this"
                className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
