import { useEffect, useRef, useState } from "react"

import type { ConfirmRequest, Entry, JarvisStatus } from "@/hooks/use-jarvis"

export type CoreState =
  | "offline"
  | "connecting"
  | "idle"
  | "listening"
  | "thinking"
  | "awaiting-auth"
  | "speaking"
  | "error"

type UseCoreStateArgs = {
  status: JarvisStatus
  busy: boolean
  pending: ConfirmRequest | null
  listening: boolean
  entries: Entry[]
}

/**
 * Derives a single "core state" from the raw connection/session signals so the
 * arc-reactor visual and its caption always agree on what JARVIS is doing.
 */
export function useCoreState({ status, busy, pending, listening, entries }: UseCoreStateArgs): CoreState {
  const [speaking, setSpeaking] = useState(false)
  const [errored, setErrored] = useState(false)

  const lastSpeakingId = useRef<string | null>(null)
  const speakingTimer = useRef<number | null>(null)
  const lastErrorId = useRef<string | null>(null)
  const errorTimer = useRef<number | null>(null)

  useEffect(() => {
    const last = entries[entries.length - 1]
    if (last && last.kind === "jarvis" && last.id !== lastSpeakingId.current) {
      lastSpeakingId.current = last.id
      setSpeaking(true)
      if (speakingTimer.current) window.clearTimeout(speakingTimer.current)
      speakingTimer.current = window.setTimeout(() => setSpeaking(false), 2500)
    }
    return () => {
      if (speakingTimer.current) window.clearTimeout(speakingTimer.current)
    }
  }, [entries])

  useEffect(() => {
    const last = entries[entries.length - 1]
    if (last && last.kind === "error" && last.id !== lastErrorId.current) {
      lastErrorId.current = last.id
      setErrored(true)
      if (errorTimer.current) window.clearTimeout(errorTimer.current)
      errorTimer.current = window.setTimeout(() => setErrored(false), 4000)
    }
    return () => {
      if (errorTimer.current) window.clearTimeout(errorTimer.current)
    }
  }, [entries])

  if (status === "closed") return "offline"
  if (status === "connecting") return "connecting"
  if (pending) return "awaiting-auth"
  if (listening) return "listening"
  if (busy) return "thinking"
  if (speaking) return "speaking"
  if (errored) return "error"
  return "idle"
}
