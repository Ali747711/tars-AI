import { useState, type ChangeEvent } from "react"
import { Clock, Plus, Trash2 } from "lucide-react"

import { SectionCard } from "@/components/section-card"
import { Button } from "@/components/ui/button"
import { useRoutines } from "@/hooks/use-routines"
import { cn } from "@/lib/utils"

const EMPTY = { name: "", cron: "", prompt: "" }

export function RoutinesCard({ httpBase }: { httpBase: string }) {
  const { routines, add, toggle, remove } = useRoutines(httpBase)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(EMPTY)

  const submit = async () => {
    if (!form.cron.trim() || !form.prompt.trim()) return
    const ok = await add(form)
    if (ok) {
      setForm(EMPTY)
      setAdding(false)
    }
  }

  const field = (key: keyof typeof EMPTY) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <SectionCard
      title="Routines"
      icon={Clock}
      action={
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={() => setAdding((a) => !a)}
          title="Add routine"
          className="text-muted-foreground"
        >
          <Plus className="size-4" />
        </Button>
      }
    >
      {adding && (
        <div className="mb-2 flex flex-col gap-1.5 rounded-lg border border-border p-2">
          <input
            value={form.name}
            onChange={field("name")}
            placeholder="Name (optional)"
            className="rounded-md border border-input bg-transparent px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          <input
            value={form.cron}
            onChange={field("cron")}
            placeholder="Cron, e.g. 45 8 * * 1-5"
            className="rounded-md border border-input bg-transparent px-2 py-1 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          <input
            value={form.prompt}
            onChange={field("prompt")}
            placeholder="What should Jarvis do?"
            className="rounded-md border border-input bg-transparent px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          <Button size="xs" onClick={submit} disabled={!form.cron.trim() || !form.prompt.trim()}>
            Add routine
          </Button>
        </div>
      )}

      {routines.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground">No routines yet. Add one with +.</p>
      )}

      <div className="flex flex-col gap-1.5">
        {routines.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
            <button
              type="button"
              onClick={() => toggle(r.id)}
              title={r.enabled ? "Enabled — click to pause" : "Paused — click to enable"}
              className={cn(
                "size-2 shrink-0 rounded-full transition-colors",
                r.enabled ? "bg-success" : "bg-muted-foreground/40"
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{r.name}</p>
              <p className="truncate font-mono text-[10px] text-muted-foreground">{r.cron}</p>
            </div>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => remove(r.id)}
              title="Delete"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
