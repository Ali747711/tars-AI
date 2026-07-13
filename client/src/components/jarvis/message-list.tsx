import { useEffect, useRef } from "react"
import { TriangleAlert, Wrench } from "lucide-react"

import { AuthPrompt } from "@/components/jarvis/auth-prompt"
import { BrandLogo, hasBrandLogo } from "@/components/brand-logo"
import type { ConfirmRequest, Entry } from "@/hooks/use-jarvis"

type MessageListProps = {
  entries: Entry[]
  pending: ConfirmRequest | null
  busy: boolean
  onConfirm: (allow: boolean) => void
}

export function MessageList({ entries, pending, busy, onConfirm }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [entries, pending, busy])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {entries.length === 0 && <EmptyState />}

        {entries.map((entry) => (
          <div key={entry.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <EntryRow entry={entry} />
          </div>
        ))}

        {busy && !pending && <Thinking />}

        {pending && (
          <div className="animate-in fade-in zoom-in-95 duration-200">
            <AuthPrompt pending={pending} onConfirm={onConfirm} />
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <BrandLogo name="claude" className="size-10" />
      <p className="text-lg font-medium">How can I help?</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Ask me to open apps, find files, message someone, control music, or just chat.
      </p>
    </div>
  )
}

function Thinking() {
  return (
    <div className="surface w-fit rounded-2xl rounded-bl-md px-4 py-3">
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

function EntryRow({ entry }: { entry: Entry }) {
  if (entry.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {entry.text}
        </div>
      </div>
    )
  }

  if (entry.kind === "jarvis") {
    return (
      <div className="flex justify-start">
        <div className="surface max-w-[80%] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed">
          {entry.text}
        </div>
      </div>
    )
  }

  if (entry.kind === "step") {
    return (
      <div className="flex justify-start">
        <div
          className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
          title={JSON.stringify(entry.args)}
        >
          {hasBrandLogo(entry.tool.split("_")[0]) ? (
            <BrandLogo name={entry.tool.split("_")[0]} className="size-3.5" />
          ) : (
            <Wrench className="size-3 shrink-0" />
          )}
          <span className="font-medium text-foreground/70">{entry.tool}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      <TriangleAlert className="size-4 shrink-0" />
      {entry.text}
    </div>
  )
}
