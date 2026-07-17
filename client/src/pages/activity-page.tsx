import { useState } from "react"
import { Bot, RefreshCw, Search, User } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { useDayLog } from "@/hooks/use-log"

const isoToday = () => new Date().toISOString().slice(0, 10)

const time = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

export function ActivityPage({ httpBase }: { httpBase: string }) {
  const [day, setDay] = useState(isoToday)
  const [query, setQuery] = useState("")
  const { entries, loading, refresh } = useDayLog(httpBase, day)

  const q = query.toLowerCase().trim()
  const filtered = q
    ? entries.filter((e) =>
        `${e.user ?? ""} ${e.reply ?? ""} ${(e.steps ?? []).map((s) => s.tool).join(" ")}`
          .toLowerCase()
          .includes(q)
      )
    : entries

  const input =
    "rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"

  return (
    <div className="mx-auto w-full max-w-3xl overflow-y-auto p-4 sm:p-6">
      <PageHeader
        title="Activity"
        description="Jarvis's diary — every command, tool call, and reply."
        action={
          <Button size="icon-sm" variant="ghost" onClick={refresh} title="Refresh">
            <RefreshCw className="size-4 text-muted-foreground" />
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 duration-500 animate-in fade-in">
        <input
          type="date"
          value={day}
          max={isoToday()}
          onChange={(e) => setDay(e.target.value || isoToday())}
          className={input}
        />
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this day…"
            className={`${input} w-full pl-8`}
          />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      {loading ? (
        <p className="px-1 text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">
          {q ? "Nothing matches that search." : "No activity on this day."}
        </p>
      ) : (
        <ol className="relative flex flex-col gap-3 border-l border-border pl-4 delay-75 duration-500 animate-in fade-in slide-in-from-bottom-2">
          {filtered.map((e, i) => (
            <li key={`${e.ts}-${i}`} className="relative">
              {/* timeline dot */}
              <span className="absolute -left-[21.5px] top-1.5 size-2.5 rounded-full border-2 border-background bg-primary/70" />
              <div className="surface rounded-xl px-3.5 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 text-sm">
                    <User className="mr-1.5 inline size-3.5 align-[-2px] text-muted-foreground" />
                    {e.user || (e.kind === "routine" ? "Scheduled routine" : "—")}
                  </p>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {time(e.ts)}
                  </span>
                </div>
                {e.steps && e.steps.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {e.steps.map((s, j) => (
                      <span
                        key={j}
                        className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                      >
                        {s.tool}
                      </span>
                    ))}
                  </div>
                )}
                {e.reply && (
                  <p className="mt-1.5 line-clamp-3 text-xs text-muted-foreground">
                    <Bot className="mr-1.5 inline size-3.5 align-[-2px]" />
                    {e.reply}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
