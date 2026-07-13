import type { CoreState } from "@/hooks/use-core-state"
import { cn } from "@/lib/utils"

/** A soft gradient sphere that gently reacts to the assistant's state. */
export function AssistantOrb({ state, size = 36 }: { state: CoreState; size?: number }) {
  const dim = state === "offline" || state === "connecting"

  const spin =
    state === "thinking"
      ? "orb-spin 2.6s linear infinite"
      : state === "speaking"
        ? "orb-breathe 0.9s ease-in-out infinite"
        : "orb-breathe 4.5s ease-in-out infinite"

  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      {state === "listening" && (
        <span
          aria-hidden
          className="orb-anim absolute rounded-full bg-primary/30"
          style={{ width: size, height: size, animation: "orb-ping 1.4s ease-out infinite" }}
        />
      )}
      <div
        aria-hidden
        className={cn("orb-anim rounded-full", dim && "opacity-50 grayscale")}
        style={{
          width: size,
          height: size,
          background:
            "conic-gradient(from 140deg, var(--primary), var(--chart-2), var(--chart-3), var(--primary))",
          animation: spin,
          boxShadow: dim ? "none" : "0 0 18px -6px var(--primary)",
        }}
      />
      {/* inner hole → glowing ring look */}
      <div
        className="absolute rounded-full bg-background"
        style={{ width: size * 0.4, height: size * 0.4 }}
      />
    </div>
  )
}
