import { Monitor, Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"

const ORDER = ["light", "dark", "system"] as const
const ICON = { light: Sun, dark: Moon, system: Monitor }

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const Icon = ICON[theme]
  const cycle = () => setTheme(ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length])

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      onClick={cycle}
      title={`Theme: ${theme}`}
      aria-label={`Theme: ${theme}. Click to change.`}
    >
      <Icon className="size-4" />
    </Button>
  )
}
