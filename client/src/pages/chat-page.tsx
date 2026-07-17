import { Composer } from "@/components/jarvis/composer"
import { MessageList } from "@/components/jarvis/message-list"
import type { useJarvis } from "@/hooks/use-jarvis"
import type { useSpeechRecognition } from "@/hooks/use-speech-recognition"

/**
 * The conversation view. Jarvis state lives in App (useJarvis) so switching
 * pages never drops the WebSocket or an in-flight streamed reply.
 */
export function ChatPage({
  jarvis,
  mic,
}: {
  jarvis: ReturnType<typeof useJarvis>
  mic: ReturnType<typeof useSpeechRecognition>
}) {
  const { status, entries, pending, busy, send, respondConfirm } = jarvis
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <MessageList entries={entries} pending={pending} busy={busy} onConfirm={respondConfirm} />
      <Composer disabled={status !== "open"} onSend={send} mic={mic} />
    </section>
  )
}
