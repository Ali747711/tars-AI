import { useMemo } from "react"
import { Check, Loader2, Wrench, X } from "lucide-react"
import type { Room } from "livekit-client"
import {
  AgentControlBar,
  type AgentControlBarControls,
} from "@/components/agents-ui/agent-control-bar"
import { AgentAudioVisualizerAura } from "@/components/agents-ui/agent-audio-visualizer-aura"
import {
  useAgent,
  useSessionContext,
  useSessionMessages,
  useVoiceAssistant,
  type ReceivedMessage,
} from "@livekit/components-react"
import { useToolEvents, type ToolEvent } from "@/hooks/use-tool-events"
import { cn } from "@/lib/utils"

const COPPER = "#d97757"

const CONTROLS: AgentControlBarControls = {
  leave: true,
  microphone: true,
  chat: true,
  camera: false,
  screenShare: false,
}

const STATE_LABEL: Record<string, string> = {
  initializing: "Warming up…",
  idle: "Ready",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  connecting: "Connecting…",
}

/** Human-friendly tool name: system_get_battery_status → "get battery status". */
function prettyTool(name: string): string {
  const parts = name.split("_")
  return (parts.length > 1 ? parts.slice(1) : parts).join(" ")
}

type TimelineItem =
  | { kind: "message"; ts: number; id: string; msg: ReceivedMessage }
  | { kind: "tool"; ts: number; id: string; tool: ToolEvent }

/**
 * The live conversation surface: an aura visualizer + agent-state pill on one
 * side, and a streaming transcript (both speakers) with Jarvis's tool calls
 * woven in by time on the other. All state comes from the live LiveKit session.
 */
export function ConversationView({ themeMode }: { themeMode: "dark" | "light" }) {
  const session = useSessionContext()
  const { state, audioTrack } = useVoiceAssistant()
  const { state: agentState } = useAgent()
  const { messages } = useSessionMessages(session)
  const tools = useToolEvents(session.room as Room | undefined)

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...messages.map((msg) => ({
        kind: "message" as const,
        ts: new Date(msg.timestamp).getTime(),
        id: msg.id,
        msg,
      })),
      ...tools.map((tool) => ({
        kind: "tool" as const,
        ts: tool.ts,
        id: tool.callId,
        tool,
      })),
    ]
    return items.sort((a, b) => a.ts - b.ts)
  }, [messages, tools])

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* Presence: visualizer + state */}
      <div className="flex shrink-0 flex-col items-center justify-center gap-4 p-6 lg:w-[42%]">
        <AgentAudioVisualizerAura
          size="xl"
          state={state}
          audioTrack={audioTrack}
          color={COPPER}
          themeMode={themeMode}
        />
        <StatePill state={agentState} />
      </div>

      {/* Transcript + tool activity */}
      <div className="flex min-h-0 flex-1 flex-col border-t border-border lg:border-l lg:border-t-0">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {timeline.length === 0 ? (
              <p className="mt-10 text-center text-sm text-muted-foreground">
                Say hello — your conversation will appear here.
              </p>
            ) : (
              timeline.map((item) =>
                item.kind === "message" ? (
                  <MessageRow key={item.id} msg={item.msg} />
                ) : (
                  <ToolRow key={item.id} tool={item.tool} />
                )
              )
            )}
          </div>
        </div>

        <div className="border-t border-border p-3">
          <div className="mx-auto max-w-2xl">
            <AgentControlBar
              variant="livekit"
              controls={CONTROLS}
              isConnected={session.isConnected}
              onDisconnect={session.end}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function StatePill({ state }: { state: string }) {
  const active = state === "listening" || state === "speaking" || state === "thinking"
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-sm">
      <span
        className={cn(
          "size-2 rounded-full",
          state === "speaking" && "bg-primary",
          state === "listening" && "bg-success",
          state === "thinking" && "bg-chart-3 animate-pulse",
          !active && "bg-muted-foreground/40"
        )}
      />
      <span className={cn(active ? "text-foreground" : "text-muted-foreground")}>
        {STATE_LABEL[state] ?? state}
      </span>
    </div>
  )
}

function MessageRow({ msg }: { msg: ReceivedMessage }) {
  const isUser = msg.from?.isLocal === true
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-snug",
          isUser
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md bg-muted text-foreground"
        )}
      >
        {msg.message}
      </div>
    </div>
  )
}

function ToolRow({ tool }: { tool: ToolEvent }) {
  const running = tool.status === "running"
  const failed = tool.status === "error" || tool.status === "cancelled"
  return (
    <div className="flex justify-start">
      <div
        className={cn(
          "flex items-center gap-2 rounded-full border px-3 py-1 text-xs",
          running
            ? "border-primary/40 bg-accent/40 text-accent-foreground"
            : failed
              ? "border-destructive/40 text-destructive"
              : "border-border text-muted-foreground"
        )}
      >
        {running ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : failed ? (
          <X className="size-3.5" />
        ) : (
          <Check className="size-3.5 text-success" />
        )}
        <Wrench className="size-3 opacity-60" />
        <span className="font-mono">{prettyTool(tool.name)}</span>
      </div>
    </div>
  )
}
