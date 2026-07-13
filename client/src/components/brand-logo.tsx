import { cn } from "@/lib/utils"

/**
 * Real brand/app logos (from the @aliimam registry, in /public/logos).
 * Keyed by tool-category name plus a few explicit aliases. `mono` logos are
 * solid black, so they get inverted in dark mode to stay visible.
 */
const LOGOS: Record<string, { src: string; mono?: boolean }> = {
  claude: { src: "/logos/Claude-AI.svg" },
  chrome: { src: "/logos/Chrome.svg" },
  telegram: { src: "/logos/Telegram.svg" },
  telegramapi: { src: "/logos/Telegram.svg" },
  music: { src: "/logos/Spotify.svg" },
  spotify: { src: "/logos/Spotify.svg" },
  youtube: { src: "/logos/YouTube.svg", mono: true },
  iterm: { src: "/logos/iterm2.svg", mono: true },
  system: { src: "/logos/Apple.svg", mono: true },
  mail: { src: "/logos/google-gmail.svg" },
  messages: { src: "/logos/imessage.webp" },
  notes: { src: "/logos/notes.webp" },
  calendar: { src: "/logos/google-calendar.svg" },
  contacts: { src: "/logos/contacts.svg" },
  shortcuts: { src: "/logos/apple-shortcuts.svg", mono: true },
  pages: { src: "/logos/pages.webp" },
  files: { src: "/logos/apple-files.webp" },
  finder: { src: "/logos/finder-svgrepo-com.svg" },
  clipboard: { src: "/logos/clipboard-alt-outline.svg", mono: true },
  notifications: { src: "/logos/notification-alert-remix.svg", mono: true },
  screen: { src: "/logos/screen.svg", mono: true },
  tools: { src: "/logos/tools-circle-filled.svg", mono: true },
}

export function hasBrandLogo(name: string): boolean {
  return name in LOGOS
}

export function BrandLogo({ name, className }: { name: string; className?: string }) {
  const logo = LOGOS[name]
  if (!logo) return null
  return (
    <img
      src={logo.src}
      alt=""
      aria-hidden
      className={cn("shrink-0 object-contain", logo.mono && "dark:invert", className)}
    />
  )
}
