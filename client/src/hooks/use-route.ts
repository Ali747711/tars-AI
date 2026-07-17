import { useCallback, useEffect, useState } from "react"

export const PAGES = [
  "chat",
  "voice",
  "dashboard",
  "routines",
  "activity",
  "memory",
] as const
export type Page = (typeof PAGES)[number]

const parse = (): Page => {
  const hash = window.location.hash.replace(/^#\/?/, "")
  return (PAGES as readonly string[]).includes(hash) ? (hash as Page) : "chat"
}

/** Tiny hash router: `#/dashboard` ⇄ page state, back/forward supported. */
export function useRoute(): [Page, (page: Page) => void] {
  const [page, setPage] = useState<Page>(parse)

  useEffect(() => {
    const onHash = () => setPage(parse())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  const navigate = useCallback((next: Page) => {
    window.location.hash = next === "chat" ? "/" : `/${next}`
  }, [])

  return [page, navigate]
}
