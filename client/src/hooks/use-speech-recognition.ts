import { useCallback, useEffect, useRef, useState } from "react"

type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}

/**
 * Thin wrapper over the browser SpeechRecognition API (Chrome: webkit-prefixed).
 * Calls onResult with the final transcript. No-op where unsupported.
 */
export function useSpeechRecognition(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const recRef = useRef<SpeechRecognitionLike | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  const supported = Boolean(Ctor)

  const stop = useCallback(() => {
    recRef.current?.stop()
    setListening(false)
  }, [])

  const start = useCallback(() => {
    if (!Ctor) return
    const rec: SpeechRecognitionLike = new Ctor()
    rec.lang = "en-GB"
    rec.interimResults = false
    rec.continuous = false
    rec.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ""
      if (transcript) onResult(transcript)
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    setListening(true)
    rec.start()
  }, [Ctor, onResult])

  useEffect(() => () => recRef.current?.stop(), [])

  return { supported, listening, start, stop }
}
