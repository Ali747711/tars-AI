import { History } from "lucide-react"

import { SectionCard } from "@/components/section-card"
import { useLog } from "@/hooks/use-log"

const time = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

export function ActivityCard({ httpBase }: { httpBase: string }) {
  const entries = useLog(httpBase)
  return (
    <SectionCard title="Activity" icon={History}>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No activity yet.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {entries.slice(0, 12).map((e, i) => (
            <div key={i} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-foreground/80">
                  {e.user || (e.kind === "routine" ? "Routine" : "—")}
                </span>
                <span className="shrink-0 text-muted-foreground">{time(e.ts)}</span>
              </div>
              {e.steps && e.steps.length > 0 && (
                <p className="truncate font-mono text-[10px] text-muted-foreground">
                  {e.steps.map((s) => s.tool).join(", ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
