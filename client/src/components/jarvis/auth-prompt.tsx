import { ShieldQuestion } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ConfirmRequest } from "@/hooks/use-jarvis"

export function AuthPrompt({
  pending,
  onConfirm,
}: {
  pending: ConfirmRequest
  onConfirm: (allow: boolean) => void
}) {
  return (
    <div className="surface rounded-xl p-4">
      <div className="mb-2 flex items-center gap-2">
        <ShieldQuestion className="size-4 text-primary" />
        <span className="text-sm font-medium">Approve this action?</span>
      </div>
      <p className="text-xs text-muted-foreground">Jarvis wants to run</p>
      <p className="font-mono text-sm">{pending.tool}</p>
      <pre className="my-3 max-h-32 overflow-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap text-muted-foreground">
        {JSON.stringify(pending.args, null, 2)}
      </pre>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onConfirm(true)}>
          Approve
        </Button>
        <Button size="sm" variant="outline" onClick={() => onConfirm(false)} autoFocus>
          Deny
        </Button>
      </div>
    </div>
  )
}
