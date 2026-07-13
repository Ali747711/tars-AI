import { cn } from "@/lib/utils"

export function BootOverlay({ done }: { done: boolean }) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-background",
        done && "pointer-events-none opacity-0 transition-opacity duration-500"
      )}
    >
      <svg aria-hidden className="size-16 text-hud-cyan" viewBox="0 0 100 100">
        <g className="hud-anim origin-[50px_50px] animate-[hud-spin_2s_linear_infinite]">
          <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="3" strokeDasharray="30 12" fill="none" opacity="0.7" />
          <circle cx="50" cy="50" r="26" stroke="currentColor" strokeWidth="2" strokeDasharray="10 8" fill="none" opacity="0.9" />
        </g>
      </svg>

      <div className="flex flex-col items-center gap-1.5">
        <p
          className="animate-in fade-in slide-in-from-bottom-1 font-mono text-xs uppercase tracking-[0.3em] text-hud-cyan"
          style={{ animationDelay: "0ms", animationFillMode: "both" }}
        >
          J.A.R.V.I.S OS v4.2.1
        </p>
        <p
          className="animate-in fade-in slide-in-from-bottom-1 font-mono text-xs uppercase tracking-[0.3em] text-foreground"
          style={{ animationDelay: "400ms", animationFillMode: "both" }}
        >
          CALIBRATING INTERFACE …
        </p>
        <p
          className="animate-in fade-in slide-in-from-bottom-1 font-mono text-xs uppercase tracking-[0.3em] text-foreground"
          style={{ animationDelay: "800ms", animationFillMode: "both" }}
        >
          ALL SYSTEMS NOMINAL
          <span aria-hidden className="hud-anim ml-0.5 animate-[hud-caret_1s_step-end_infinite]">
            ▌
          </span>
        </p>
      </div>
    </div>
  )
}
