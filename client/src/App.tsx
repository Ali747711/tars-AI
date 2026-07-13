import { useState } from "react"

import { ActivityCard } from "@/components/activity-card"
import { AppHeader } from "@/components/app-header"
import { RoutinesCard } from "@/components/routines-card"
import { StatusCard } from "@/components/status-card"
import { Composer } from "@/components/jarvis/composer"
import { MessageList } from "@/components/jarvis/message-list"
import { ToolPalette } from "@/components/jarvis/tool-palette"
import { useCoreState } from "@/hooks/use-core-state"
import { useJarvis } from "@/hooks/use-jarvis"
import { useSpeechRecognition } from "@/hooks/use-speech-recognition"

const JARVIS_URL = import.meta.env.VITE_JARVIS_URL ?? "ws://localhost:8787"
const HTTP_BASE = JARVIS_URL.replace(/^ws/, "http")

export function App() {
  const { status, entries, pending, busy, send, respondConfirm } = useJarvis(JARVIS_URL)
  const mic = useSpeechRecognition((text) => send(text))
  const coreState = useCoreState({ status, busy, pending, listening: mic.listening, entries })
  const [toolsOpen, setToolsOpen] = useState(false)

  return (
    <div className="flex h-svh flex-col bg-background text-foreground">
      <AppHeader status={status} coreState={coreState} onOpenTools={() => setToolsOpen(true)} />

      <main className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_22rem]">
        <section className="flex min-h-0 min-w-0 flex-col">
          <MessageList entries={entries} pending={pending} busy={busy} onConfirm={respondConfirm} />
          <Composer disabled={status !== "open"} onSend={send} mic={mic} />
        </section>

        <aside className="hidden min-h-0 flex-col gap-3 overflow-y-auto border-l border-border bg-sidebar/40 p-3 md:flex">
          <StatusCard httpBase={HTTP_BASE} />
          <RoutinesCard httpBase={HTTP_BASE} />
          <ActivityCard httpBase={HTTP_BASE} />
        </aside>
      </main>

      <ToolPalette open={toolsOpen} onClose={() => setToolsOpen(false)} httpBase={HTTP_BASE} />
    </div>
  )
}

export default App
