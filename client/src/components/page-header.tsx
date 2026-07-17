import type { ReactNode } from "react"

/** Shared heading for dashboard pages: title, quiet description, actions. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3 duration-500 animate-in fade-in slide-in-from-bottom-1">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </header>
  )
}
