export function HudBackground() {
  return (
    <>
      <div aria-hidden className="hud-grid-bg fixed inset-0 -z-10" />
      <div aria-hidden className="hud-scanlines pointer-events-none fixed inset-0 z-50 opacity-40" />
    </>
  )
}
