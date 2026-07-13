import type { CoreState } from "@/hooks/use-core-state"

const STATE_LABEL: Record<CoreState, string> = {
  offline: "LINK LOST — RETRYING",
  connecting: "ESTABLISHING LINK",
  idle: "STANDING BY",
  listening: "LISTENING",
  thinking: "PROCESSING",
  "awaiting-auth": "AWAITING AUTHORIZATION",
  speaking: "RESPONDING",
  error: "FAULT DETECTED",
}

export function HudCore({ state }: { state: CoreState }) {
  const label = STATE_LABEL[state]

  return (
    <div className="hud-core flex flex-col items-center" data-state={state}>
      <svg viewBox="0 0 200 200" role="img" aria-label={label} className="size-32 md:size-36">
        <defs>
          <radialGradient id="coreGlow">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.9" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
          <filter id="blurGlow">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        <g className="ring ring-outer">
          <circle cx="100" cy="100" r="92" stroke="currentColor" strokeWidth="6" strokeDasharray="2 7.63" opacity="0.5" fill="none" />
        </g>
        <g className="ring ring-mid">
          <circle cx="100" cy="100" r="72" stroke="currentColor" strokeWidth="3" strokeDasharray="90 23.1" strokeLinecap="round" opacity="0.8" fill="none" />
        </g>
        <g className="ring ring-inner">
          <circle cx="100" cy="100" r="52" stroke="currentColor" strokeWidth="1.5" strokeDasharray="12 15.2" opacity="0.6" fill="none" />
        </g>

        <circle className="ping" cx="100" cy="100" r="40" stroke="currentColor" strokeWidth="1.5" fill="none" aria-hidden="true" />
        <circle className="glow" cx="100" cy="100" r="34" fill="url(#coreGlow)" filter="url(#blurGlow)" aria-hidden="true" />

        <circle cx="100" cy="100" r="24" fill="currentColor" opacity="0.15" />
        <circle cx="100" cy="100" r="14" fill="currentColor" opacity="0.9" />
      </svg>

      <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground" aria-live="polite">
        {label}
      </p>
    </div>
  )
}
