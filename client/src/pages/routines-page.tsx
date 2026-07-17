import { useState, type ChangeEvent } from "react"
import { CalendarClock, Plus, Trash2 } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { useRoutines } from "@/hooks/use-routines"
import { cn } from "@/lib/utils"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

type Preset = "daily" | "weekdays" | "weekends" | "weekly" | "hourly" | "custom"

const PRESETS: { id: Preset; label: string }[] = [
  { id: "daily", label: "Every day" },
  { id: "weekdays", label: "Weekdays" },
  { id: "weekends", label: "Weekends" },
  { id: "weekly", label: "Weekly" },
  { id: "hourly", label: "Every hour" },
  { id: "custom", label: "Custom cron" },
]

function buildCron(preset: Preset, time: string, weekday: number, custom: string): string {
  const [h = "9", m = "0"] = time.split(":")
  const hh = Number(h)
  const mm = Number(m)
  switch (preset) {
    case "daily":
      return `${mm} ${hh} * * *`
    case "weekdays":
      return `${mm} ${hh} * * 1-5`
    case "weekends":
      return `${mm} ${hh} * * 0,6`
    case "weekly":
      return `${mm} ${hh} * * ${weekday}`
    case "hourly":
      return `${mm} * * * *`
    case "custom":
      return custom.trim()
  }
}

/** Best-effort human description of a 5-field cron expression. */
function describeCron(cron: string): string {
  const m = /^(\d{1,2}) (\d{1,2}|\*) \* \* (\*|1-5|0,6|\d)$/.exec(cron.trim())
  if (!m) return cron
  const [, min, hour, dow] = m
  const at =
    hour === "*"
      ? `at :${min.padStart(2, "0")} every hour`
      : `at ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`
  const days =
    dow === "*" ? "every day"
    : dow === "1-5" ? "weekdays"
    : dow === "0,6" ? "weekends"
    : `every ${WEEKDAYS[Number(dow)] ?? dow}`
  return hour === "*" ? at : `${days} ${at}`
}

export function RoutinesPage({ httpBase }: { httpBase: string }) {
  const { routines, add, toggle, remove } = useRoutines(httpBase)
  const [name, setName] = useState("")
  const [prompt, setPrompt] = useState("")
  const [preset, setPreset] = useState<Preset>("daily")
  const [time, setTime] = useState("08:45")
  const [weekday, setWeekday] = useState(1)
  const [custom, setCustom] = useState("")
  const [saving, setSaving] = useState(false)

  const cron = buildCron(preset, time, weekday, custom)
  const valid = prompt.trim().length > 0 && /^\S+ \S+ \S+ \S+ \S+$/.test(cron)

  const submit = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      const ok = await add({ name: name.trim(), cron, prompt: prompt.trim() })
      if (ok) {
        setName("")
        setPrompt("")
      }
    } finally {
      setSaving(false)
    }
  }

  const input =
    "rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"

  return (
    <div className="mx-auto w-full max-w-3xl overflow-y-auto p-4 sm:p-6">
      <PageHeader
        title="Routines"
        description="Things Jarvis does on a schedule, without being asked."
      />

      {/* Create */}
      <section className="surface rounded-xl p-4 duration-500 animate-in fade-in slide-in-from-bottom-2">
        <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Plus className="size-4" /> New routine
        </h2>
        <div className="flex flex-col gap-2.5">
          <input
            value={prompt}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPrompt(e.target.value)}
            placeholder="What should Jarvis do? e.g. Give me a morning briefing: weather, calendar, top news"
            className={input}
          />
          <input
            value={name}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            placeholder="Name (optional)"
            className={cn(input, "max-w-64")}
          />

          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  preset === p.id
                    ? "border-primary/50 bg-accent text-accent-foreground"
                    : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {preset !== "custom" && preset !== "hourly" && (
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={cn(input, "w-fit")}
              />
            )}
            {preset === "weekly" && (
              <select
                value={weekday}
                onChange={(e) => setWeekday(Number(e.target.value))}
                className={cn(input, "w-fit")}
              >
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            )}
            {preset === "custom" && (
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="45 8 * * 1-5"
                className={cn(input, "w-40 font-mono")}
              />
            )}
            <code className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
              {cron || "…"}
            </code>
            <span className="text-xs text-muted-foreground">{cron && describeCron(cron)}</span>
            <div className="flex-1" />
            <Button size="sm" onClick={submit} disabled={!valid || saving}>
              {saving ? "Adding…" : "Add routine"}
            </Button>
          </div>
        </div>
      </section>

      {/* List */}
      <section className="mt-4 flex flex-col gap-2 delay-75 duration-500 animate-in fade-in slide-in-from-bottom-2">
        {routines.length === 0 && (
          <p className="px-1 text-sm text-muted-foreground">
            No routines yet — schedule your first one above.
          </p>
        )}
        {routines.map((r) => (
          <div key={r.id} className="surface flex items-center gap-3 rounded-xl px-3.5 py-2.5">
            <button
              type="button"
              role="switch"
              aria-checked={r.enabled}
              onClick={() => toggle(r.id)}
              title={r.enabled ? "Enabled — click to pause" : "Paused — click to enable"}
              className={cn(
                "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                r.enabled ? "bg-success" : "bg-muted-foreground/25"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform",
                  r.enabled ? "translate-x-4.5" : "translate-x-0.5"
                )}
              />
            </button>
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-sm", !r.enabled && "text-muted-foreground")}>
                {r.name || r.prompt}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                <CalendarClock className="mr-1 inline size-3 align-[-2px]" />
                {describeCron(r.cron)}
                <span className="ml-2 font-mono text-[10px] opacity-60">{r.cron}</span>
              </p>
              {r.name && <p className="mt-0.5 truncate text-xs text-muted-foreground/80">{r.prompt}</p>}
            </div>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => remove(r.id)}
              title="Delete routine"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </section>
    </div>
  )
}
