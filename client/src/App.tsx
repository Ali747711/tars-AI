import { useState } from "react"

import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { ToolPalette } from "@/components/jarvis/tool-palette"
import { ActivityPage } from "@/pages/activity-page"
import { ChatPage } from "@/pages/chat-page"
import { DashboardPage } from "@/pages/dashboard-page"
import { MemoryPage } from "@/pages/memory-page"
import { RoutinesPage } from "@/pages/routines-page"
import { useCoreState } from "@/hooks/use-core-state"
import { useJarvis } from "@/hooks/use-jarvis"
import { useRoute } from "@/hooks/use-route"
import { useSpeechRecognition } from "@/hooks/use-speech-recognition"

const JARVIS_URL = import.meta.env.VITE_JARVIS_URL ?? "ws://localhost:8787"
const HTTP_BASE = JARVIS_URL.replace(/^ws/, "http")

export function App() {
  const jarvis = useJarvis(JARVIS_URL)
  const mic = useSpeechRecognition((text) => jarvis.send(text))
  const coreState = useCoreState({
    status: jarvis.status,
    busy: jarvis.busy,
    pending: jarvis.pending,
    listening: mic.listening,
    entries: jarvis.entries,
  })
  const [page, navigate] = useRoute()
  const [toolsOpen, setToolsOpen] = useState(false)
  const openTools = () => setToolsOpen(true)

  return (
    <div className="flex h-svh flex-col bg-background text-foreground">
      <AppHeader status={jarvis.status} coreState={coreState} onOpenTools={openTools} />

      <div className="flex min-h-0 flex-1">
        <AppSidebar page={page} onNavigate={navigate} onOpenTools={openTools} />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {page === "chat" && <ChatPage jarvis={jarvis} mic={mic} />}
          {page === "dashboard" && (
            <DashboardPage httpBase={HTTP_BASE} onNavigate={navigate} onOpenTools={openTools} />
          )}
          {page === "routines" && <RoutinesPage httpBase={HTTP_BASE} />}
          {page === "activity" && <ActivityPage httpBase={HTTP_BASE} />}
          {page === "memory" && <MemoryPage httpBase={HTTP_BASE} />}
        </main>
      </div>

      <ToolPalette open={toolsOpen} onClose={() => setToolsOpen(false)} httpBase={HTTP_BASE} />
    </div>
  )
}

export default App
