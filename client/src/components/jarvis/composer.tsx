import { useState } from "react"
import { Mic, Send, Square } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type MicControls = {
  supported: boolean
  listening: boolean
  start: () => void
  stop: () => void
}

type ComposerProps = {
  disabled?: boolean
  onSend: (text: string) => void
  mic: MicControls
}

export function Composer({ disabled, onSend, mic }: ComposerProps) {
  const [text, setText] = useState("")

  const submit = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    onSend(trimmed)
    setText("")
  }

  return (
    <form
      className="border-t border-border px-4 py-3 sm:px-6"
      onSubmit={(e) => {
        e.preventDefault()
        submit(text)
      }}
    >
      <div className="surface mx-auto flex w-full max-w-3xl items-end gap-1.5 rounded-2xl p-1.5 transition-shadow focus-within:ring-2 focus-within:ring-ring/40">
        {mic.supported && (
          <Button
            type="button"
            size="icon"
            variant={mic.listening ? "default" : "ghost"}
            onClick={mic.listening ? mic.stop : mic.start}
            aria-pressed={mic.listening}
            className={cn("relative shrink-0 rounded-full", !mic.listening && "text-muted-foreground")}
            title={mic.listening ? "Stop listening" : "Speak"}
          >
            {mic.listening && (
              <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-primary/40" />
            )}
            {mic.listening ? <Square className="size-4" /> : <Mic className="size-4" />}
          </Button>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit(text)
            }
          }}
          rows={1}
          placeholder={mic.listening ? "Listening…" : "Message Jarvis…"}
          className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
        />

        <Button
          type="submit"
          size="icon"
          disabled={disabled || !text.trim()}
          className="shrink-0 rounded-full"
          title="Send"
        >
          <Send className="size-4" />
        </Button>
      </div>
    </form>
  )
}
