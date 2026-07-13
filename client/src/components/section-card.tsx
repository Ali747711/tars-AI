import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

/** A soft, minimal card used across the dashboard rail. */
export function SectionCard({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string
  icon?: LucideIcon
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="surface rounded-xl p-3">
      <header className="mb-2.5 flex items-center gap-2">
        {Icon && <Icon className="size-4 text-muted-foreground" />}
        <h2 className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  )
}
