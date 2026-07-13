import { useState } from "react"
import {
  Check,
  ChevronRight,
  CircleCheck,
  CircleX,
  Copy,
  Loader,
  Play,
  Search,
  ShieldQuestion,
  Terminal,
  X,
} from "lucide-react"

import { BrandLogo } from "@/components/brand-logo"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTools, type RunResult, type ToolInfo, type ToolProp } from "@/hooks/use-tools"

type RunTool = (
  name: string,
  args: Record<string, unknown>,
  confirm: boolean
) => Promise<RunResult>

type ToolPaletteProps = {
  open: boolean
  onClose: () => void
  httpBase: string
}

export function ToolPalette({ open, onClose, httpBase }: ToolPaletteProps) {
  const { tools, loading, error, runTool } = useTools(httpBase)
  const [query, setQuery] = useState("")

  const q = query.trim().toLowerCase()
  const filtered = q
    ? tools.filter(
        (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
      )
    : tools
  const groups = groupByCategory(filtered)

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      )}

      <aside
        aria-hidden={!open}
        className={cn(
          "fixed inset-y-0 right-0 z-40 flex w-[24rem] max-w-[90vw] flex-col border-l border-border bg-card shadow-xl transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <BrandLogo name="tools" className="size-4" />
          <span className="flex-1 text-sm font-semibold">Tools</span>
          <span className="text-xs text-muted-foreground">{tools.length}</span>
          <Button size="icon-xs" variant="ghost" onClick={onClose} title="Close">
            <X className="size-4" />
          </Button>
        </div>

        <div className="border-b border-border p-2">
          <div className="flex items-center gap-2 rounded-lg border border-input px-2">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tools…"
              className="w-full bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading && <p className="p-4 text-center text-sm text-muted-foreground">Loading tools…</p>}
          {error && <p className="p-4 text-sm text-destructive">Backend offline — {error}</p>}
          {!loading && !error && filtered.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">No matching tools.</p>
          )}

          {q ? (
            <div className="flex flex-col gap-1">
              {filtered.map((t) => (
                <ToolRow key={t.name} tool={t} runTool={runTool} showFullName />
              ))}
            </div>
          ) : (
            groups.map(([cat, list]) => (
              <ToolGroup key={cat} category={cat} tools={list} runTool={runTool} />
            ))
          )}
        </div>
      </aside>
    </>
  )
}

function ToolGroup({
  category,
  tools,
  runTool,
}: {
  category: string
  tools: ToolInfo[]
  runTool: RunTool
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted"
      >
        <ChevronRight
          className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-90")}
        />
        <BrandLogo name={category} className="size-4" />
        <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {categoryLabel(category)}
        </span>
        <span className="text-[10px] text-muted-foreground">{tools.length}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-1 py-1">
          {tools.map((t) => (
            <ToolRow key={t.name} tool={t} runTool={runTool} />
          ))}
        </div>
      )}
    </div>
  )
}

function ToolRow({
  tool,
  runTool,
  showFullName = false,
}: {
  tool: ToolInfo
  runTool: RunTool
  showFullName?: boolean
}) {
  const props = tool.inputSchema?.properties ?? {}
  const propNames = Object.keys(props)
  const required = tool.inputSchema?.required ?? []
  const expandable = propNames.length > 0 || tool.confirm
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string | boolean>>({})
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)

  const missing = required.filter((k) => {
    if (props[k]?.type === "boolean") return false
    const v = values[k]
    return !(typeof v === "string" && v.trim() !== "")
  })
  const canRun = missing.length === 0

  const run = async () => {
    if (running || !canRun) return
    setRunning(true)
    setResult(null)
    setResult(await runTool(tool.name, coerceArgs(props, values), tool.confirm))
    setRunning(false)
  }

  const label = showFullName
    ? tool.name
    : tool.name.includes("_")
      ? tool.name.slice(tool.name.indexOf("_") + 1)
      : tool.name

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <button
          type="button"
          onClick={() => (expandable ? setOpen((o) => !o) : run())}
          className="flex flex-1 items-center gap-2 overflow-hidden text-left"
        >
          {expandable ? (
            <ChevronRight
              className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
            />
          ) : (
            <Terminal className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-sm">{label}</span>
          {tool.confirm && <ShieldQuestion className="size-3.5 shrink-0 text-amber-500" />}
        </button>
        {!expandable && (
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={run}
            disabled={running}
            className="shrink-0 text-primary"
            title={`Run ${tool.name}`}
          >
            {running ? <Loader className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          </Button>
        )}
      </div>

      {open && expandable && (
        <div className="border-t border-border px-2.5 py-2">
          <p className="mb-2 text-xs leading-relaxed text-muted-foreground">{tool.description}</p>
          {propNames.map((key) => (
            <ArgField
              key={key}
              name={key}
              prop={props[key]}
              required={required.includes(key)}
              value={values[key]}
              onChange={(v) => setValues((s) => ({ ...s, [key]: v }))}
            />
          ))}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="xs" onClick={run} disabled={running || !canRun}>
              {running ? "Running…" : tool.confirm ? "Approve & run" : "Run"}
            </Button>
            {!canRun && (
              <span className="text-[10px] text-muted-foreground">Fill: {missing.join(", ")}</span>
            )}
            {canRun && tool.confirm && (
              <span className="text-[10px] text-amber-500">Real action</span>
            )}
          </div>
        </div>
      )}

      {result && <ResultPanel result={result} onDismiss={() => setResult(null)} />}
    </div>
  )
}

function ResultPanel({ result, onDismiss }: { result: RunResult; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false)
  const body = result.ok ? prettyOutput(result.output) : result.error

  const copy = () => {
    navigator.clipboard
      ?.writeText(body)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1200)
      })
      .catch(() => {})
  }

  return (
    <div className="border-t border-border bg-muted/40">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        {result.ok ? (
          <CircleCheck className="size-3.5 text-success" />
        ) : (
          <CircleX className="size-3.5 text-destructive" />
        )}
        <span className={cn("flex-1 text-xs", result.ok ? "text-muted-foreground" : "text-destructive")}>
          {result.ok ? "Result" : "Error"}
        </span>
        <button type="button" onClick={copy} className="text-muted-foreground hover:text-foreground" title="Copy">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground"
          title="Dismiss"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <pre
        className={cn(
          "max-h-56 overflow-auto px-2.5 pb-2 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap",
          result.ok ? "text-foreground/80" : "text-destructive"
        )}
      >
        {body || "(no output)"}
      </pre>
    </div>
  )
}

function ArgField({
  name,
  prop,
  required,
  value,
  onChange,
}: {
  name: string
  prop: ToolProp
  required: boolean
  value: string | boolean | undefined
  onChange: (value: string | boolean) => void
}) {
  if (prop.type === "boolean") {
    return (
      <label className="mb-2 flex items-center gap-2">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-primary"
        />
        <span className="text-xs">{name}</span>
      </label>
    )
  }

  return (
    <div className="mb-2">
      <span className="mb-0.5 block text-[11px] text-muted-foreground">
        {name}
        {required && <span className="text-amber-500"> *</span>}
      </span>
      {Array.isArray(prop.enum) ? (
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <option value="">—</option>
          {prop.enum.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={prop.type === "number" ? "number" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={prop.description ?? ""}
          className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      )}
    </div>
  )
}

function coerceArgs(
  props: Record<string, ToolProp>,
  values: Record<string, string | boolean>
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, p] of Object.entries(props)) {
    const v = values[k]
    if (p.type === "boolean") {
      if (typeof v === "boolean") out[k] = v
    } else if (v === undefined || v === "") {
      // omit empty optional values
    } else if (p.type === "number") {
      const n = Number(v)
      if (!Number.isNaN(n)) out[k] = n
    } else {
      out[k] = v
    }
  }
  return out
}

function groupByCategory(tools: ToolInfo[]): Array<[string, ToolInfo[]]> {
  const map = new Map<string, ToolInfo[]>()
  for (const t of tools) {
    const cat = t.name.split("_")[0]
    const arr = map.get(cat) ?? []
    arr.push(t)
    map.set(cat, arr)
  }
  return [...map.entries()]
}

function categoryLabel(cat: string) {
  return cat === "telegramapi" ? "Telegram API" : cat.charAt(0).toUpperCase() + cat.slice(1)
}

function prettyOutput(output: string): string {
  const trimmed = output.trim()
  if (!trimmed) return "(no output)"
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2)
    } catch {
      // not JSON — show as-is
    }
  }
  return output
}
