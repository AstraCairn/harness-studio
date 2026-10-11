"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useTranslations, type AppConfig } from "next-intl"
import { ChevronDown, Download, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { fetchProviderModels } from "@/lib/api"
import { extractAppCommandError } from "@/lib/app-error"
import {
  fillEmptyClaudeRoles,
  joinClaudeContext,
  selectCodexProviderModel,
  splitClaudeContext,
} from "@/lib/provider-model-config"
import type {
  AgentType,
  ClaudeProviderModel,
  CodexModelConfig,
  DiscoveredModel,
} from "@/lib/types"
import {
  CodexModelListEditor,
  useCodexCatalog,
} from "./codex-model-list-editor"

type DiscoveryErrorKey =
  `errors.${keyof AppConfig["Messages"]["ModelDiscovery"]["errors"]}`

function family(id: string) {
  const name = id.toLowerCase()
  if (name.includes("claude")) return "Claude"
  if (name.includes("gpt") || /^o[134]-/.test(name)) return "OpenAI"
  if (name.includes("gemini")) return "Gemini"
  return "other"
}

export function ProviderModelPicker({
  label,
  value,
  onChange,
  models,
  readOnly = false,
  onCommit,
  hideLabel = false,
}: {
  label: string
  value: string
  onChange: (value: string, selectedModel?: DiscoveredModel) => void
  models: DiscoveredModel[]
  readOnly?: boolean
  onCommit?: (value: string) => void
  hideLabel?: boolean
}) {
  const t = useTranslations("ModelDiscovery")
  const id = useId()
  const [open, setOpen] = useState(false)
  const groups = new Map<string, DiscoveredModel[]>()
  for (const model of models) {
    const key = family(model.id)
    groups.set(key, [...(groups.get(key) ?? []), model])
  }
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className={hideLabel ? "sr-only" : "text-xs font-medium"}
      >
        {label}
      </label>
      <div className="flex gap-1.5">
        <Input
          id={id}
          value={value}
          readOnly={readOnly}
          placeholder={t("manualPlaceholder")}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => onCommit?.(value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onCommit?.(value)
          }}
        />
        <Popover open={open && !readOnly} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={readOnly || !models.length}
              aria-label={t("chooseFor", { label })}
            >
              <ChevronDown className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(28rem,85vw)] p-0" align="end">
            <Command>
              <CommandInput placeholder={t("searchPlaceholder")} />
              <CommandList>
                <CommandEmpty>{t("noMatches")}</CommandEmpty>
                {[...groups].map(([group, entries]) => (
                  <CommandGroup
                    key={group}
                    heading={group === "other" ? t("other") : group}
                  >
                    {entries.map((model) => (
                      <CommandItem
                        key={model.id}
                        value={model.id}
                        keywords={model.displayName ? [model.displayName] : []}
                        onSelect={() => {
                          onChange(model.id, model)
                          onCommit?.(model.id)
                          setOpen(false)
                        }}
                      >
                        <span className="min-w-0 break-all">
                          {model.id}
                          {model.displayName &&
                            model.displayName !== model.id && (
                              <span className="ml-2 text-muted-foreground">
                                {model.displayName}
                              </span>
                            )}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}

export interface ProviderModelConfigurationProps {
  agentType: AgentType
  apiUrl: string
  apiKey: string
  providerId?: number
  readOnly?: boolean
  discoveryEnabled?: boolean
  claude?: ClaudeProviderModel
  onClaudeChange?: (value: ClaudeProviderModel) => void
  codex?: CodexModelConfig
  onCodexChange?: (value: CodexModelConfig) => void
  model?: string
  onModelChange?: (value: string) => void
}

export function ProviderModelConfiguration({
  agentType,
  apiUrl,
  apiKey,
  providerId,
  readOnly = false,
  discoveryEnabled = true,
  claude = {},
  onClaudeChange,
  codex = { customs: [] },
  onCodexChange,
  model = "",
  onModelChange,
}: ProviderModelConfigurationProps) {
  const t = useTranslations("ModelDiscovery")
  const labels = useTranslations("ModelProviderSettings")
  const [probe, setProbe] = useState<{
    identity: object
    models: DiscoveredModel[]
    loading?: boolean
    error?: DiscoveryErrorKey
    endpoint?: string
  } | null>(null)
  // A new identity invalidates visible results immediately, including before effects run.
  const identity = useMemo(
    () => ({
      agentType,
      apiUrl,
      apiKey,
      providerId,
      readOnly,
      discoveryEnabled,
    }),
    [agentType, apiUrl, apiKey, providerId, readOnly, discoveryEnabled]
  )
  const sequence = useRef(0)
  const alive = useRef(true)
  useEffect(() => {
    const requests = sequence
    alive.current = true
    return () => {
      alive.current = false
      requests.current++
    }
  }, [])
  useEffect(() => {
    const requests = sequence
    requests.current++
    return () => {
      requests.current++
    }
  }, [identity])
  const activeProbe = probe?.identity === identity ? probe : null
  const models = activeProbe?.models ?? []
  const { catalog } = useCodexCatalog(agentType === "codex")
  const codexDefault = codex.default ?? codex.customs[0]?.slug ?? ""
  const [codexInput, setCodexInput] = useState<{
    source: string
    text: string
  } | null>(null)

  const fetchModels = async () => {
    const against = identity
    const request = ++sequence.current
    setProbe({ identity: against, models, loading: true })
    try {
      const result = await fetchProviderModels({
        agentType,
        apiUrl,
        apiKey,
        providerId,
      })
      if (alive.current && request === sequence.current) {
        setProbe({
          identity: against,
          models: result.models,
          endpoint: result.endpoint,
        })
      }
    } catch (error) {
      if (alive.current && request === sequence.current) {
        const key = extractAppCommandError(error)?.i18n_key
        const known: DiscoveryErrorKey =
          key?.startsWith("ModelDiscovery.errors.") &&
          t.has(key.slice("ModelDiscovery.".length) as DiscoveryErrorKey)
            ? (key.slice("ModelDiscovery.".length) as DiscoveryErrorKey)
            : "errors.network"
        setProbe({ identity: against, models, error: known })
      }
    }
  }
  const picker = (
    label: string,
    value: string,
    onChange: (value: string) => void
  ) => (
    <ProviderModelPicker
      label={label}
      value={value}
      onChange={onChange}
      models={models}
      readOnly={readOnly}
    />
  )
  const changeClaudeModel = (
    key: "main" | "sonnet" | "opus" | "fable" | "haiku" | "subagent",
    value: string,
    selectedModel?: DiscoveredModel
  ) => {
    const next = { ...claude, [key]: value }
    if (selectedModel && key !== "main" && key !== "subagent") {
      const nameKey = `${key}Name` as const
      const name = claude[nameKey]?.trim()
      // Keep custom names, but let names filled from the ID follow selection.
      if (!name || name === splitClaudeContext(claude[key] ?? "").id) {
        next[nameKey] = splitClaudeContext(selectedModel.id).id
      }
    }
    onClaudeChange?.(next)
  }
  const contextPicker = (
    label: string,
    key: "main" | "sonnet" | "opus" | "fable" | "subagent",
    hideLabel = false
  ) => {
    const value = claude[key] ?? ""
    const { id, oneM } = splitClaudeContext(value)
    return (
      <>
        <div role={hideLabel ? "cell" : undefined}>
          <ProviderModelPicker
            label={label}
            hideLabel={hideLabel}
            value={id}
            onChange={(next, selectedModel) =>
              changeClaudeModel(
                key,
                joinClaudeContext(next, oneM || splitClaudeContext(next).oneM),
                selectedModel
              )
            }
            models={models}
            readOnly={readOnly}
          />
        </div>
        <label
          role={hideLabel ? "cell" : undefined}
          className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap"
        >
          <Checkbox
            aria-label={t("oneMFor", { label })}
            checked={oneM}
            disabled={readOnly || !id.trim()}
            onCheckedChange={(checked) =>
              onClaudeChange?.({
                ...claude,
                [key]: joinClaudeContext(id, checked === true),
              })
            }
          />
          1M
        </label>
      </>
    )
  }
  return (
    <div className="space-y-3">
      {!readOnly && discoveryEnabled ? (
        <div className="space-y-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchModels()}
            disabled={
              !!activeProbe?.loading ||
              !apiUrl.trim() ||
              (!apiKey.trim() && providerId == null)
            }
          >
            {activeProbe?.loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            {activeProbe?.loading ? t("fetching") : t("fetch")}
          </Button>
          {activeProbe?.endpoint && (
            <p className="text-xs text-muted-foreground" role="status">
              {t("fetched", { count: models.length })}
            </p>
          )}
          {activeProbe?.error && (
            <p role="alert" className="text-xs text-destructive">
              {t(activeProbe.error)}
            </p>
          )}
          <p className="text-2xs text-muted-foreground">{t("discoveryHint")}</p>
        </div>
      ) : readOnly ? (
        <a className="text-xs underline" href="/settings/model-providers">
          {t("editProvider")}
        </a>
      ) : null}

      {agentType === "claude_code" ? (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
            {contextPicker(labels("claudeMainModel"), "main")}
          </div>
          <section
            className="space-y-3 rounded-md border p-3"
            aria-label={t("roleMapping")}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-medium">{t("roleMapping")}</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={readOnly || !claude.main?.trim()}
                onClick={() => onClaudeChange?.(fillEmptyClaudeRoles(claude))}
              >
                {t("fillRoles")}
              </Button>
            </div>
            <div
              role="table"
              aria-label={t("roleMapping")}
              className="space-y-2"
            >
              <div
                role="row"
                className="hidden gap-3 px-2 text-2xs text-muted-foreground lg:grid lg:grid-cols-[5rem_minmax(0,1fr)_minmax(0,2fr)_6rem]"
              >
                {["role", "displayName", "requestModel", "oneM"].map((key) => (
                  <span key={key} role="columnheader">
                    {t(key as "role" | "displayName" | "requestModel" | "oneM")}
                  </span>
                ))}
              </div>
              {(
                [
                  ["sonnet", "Sonnet", "claudeSonnetDefaultModel"],
                  ["opus", "Opus", "claudeOpusDefaultModel"],
                  ["fable", "Fable", "claudeFableDefaultModel"],
                  ["haiku", "Haiku", "claudeHaikuDefaultModel"],
                  ["subagent", "Subagent", null],
                ] as const
              ).map(([key, role, label]) => (
                <div
                  key={key}
                  role="row"
                  className="grid items-center gap-3 rounded-md bg-muted/30 p-2 lg:grid-cols-[5rem_minmax(0,1fr)_minmax(0,2fr)_6rem]"
                >
                  <span role="rowheader" className="text-xs font-medium">
                    {role}
                  </span>
                  <div role="cell">
                    {key === "subagent" ? (
                      <span className="text-2xs text-muted-foreground">
                        {t("notInMenu")}
                      </span>
                    ) : (
                      <Input
                        aria-label={t("displayNameFor", { role })}
                        placeholder={t("displayName")}
                        value={claude[`${key}Name`] ?? ""}
                        readOnly={readOnly}
                        onChange={(event) =>
                          onClaudeChange?.({
                            ...claude,
                            [`${key}Name`]: event.target.value,
                          })
                        }
                      />
                    )}
                  </div>
                  {key === "haiku" ? (
                    <>
                      <div role="cell">
                        <ProviderModelPicker
                          label={labels("claudeHaikuDefaultModel")}
                          hideLabel
                          value={claude.haiku ?? ""}
                          onChange={(haiku, selectedModel) =>
                            changeClaudeModel("haiku", haiku, selectedModel)
                          }
                          models={models}
                          readOnly={readOnly}
                        />
                      </div>
                      <span role="cell" />
                    </>
                  ) : (
                    contextPicker(
                      label ? labels(label) : t("subagentModel"),
                      key,
                      true
                    )
                  )}
                </div>
              ))}
            </div>
            <p className="text-2xs text-muted-foreground">{t("mappingHint")}</p>
            <p className="text-2xs text-muted-foreground">{t("oneMHint")}</p>
          </section>
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-xs font-medium">
              {t("advanced")}
            </summary>
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                {([["customOption", "claudeCustomModelOption"]] as const).map(
                  ([key, label]) => (
                    <div key={key}>
                      {picker(labels(label), claude[key] ?? "", (value) =>
                        onClaudeChange?.({ ...claude, [key]: value })
                      )}
                    </div>
                  )
                )}
                {(
                  [
                    ["customOptionName", "claudeCustomModelOptionName"],
                    [
                      "customOptionDescription",
                      "claudeCustomModelOptionDescription",
                    ],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="space-y-1.5">
                    <label className="text-xs font-medium">
                      {labels(label)}
                    </label>
                    <Input
                      aria-label={labels(label)}
                      value={claude[key] ?? ""}
                      readOnly={readOnly}
                      onChange={(event) =>
                        onClaudeChange?.({
                          ...claude,
                          [key]: event.target.value,
                        })
                      }
                    />
                  </div>
                ))}
              </div>
              <p className="text-2xs text-muted-foreground">
                {labels("claudeCustomModelOptionHint")}
              </p>
            </div>
          </details>
        </>
      ) : agentType === "codex" ? (
        <>
          <ProviderModelPicker
            label={labels("model")}
            value={
              codexInput?.source === codexDefault
                ? codexInput.text
                : codexDefault
            }
            onChange={(text) => setCodexInput({ source: codexDefault, text })}
            onCommit={(value) => {
              if (readOnly) return
              onCodexChange?.(selectCodexProviderModel(codex, value, catalog))
              setCodexInput(null)
            }}
            models={models}
            readOnly={readOnly}
          />
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-xs font-medium">
              {t("advanced")}
            </summary>
            <div className="mt-3">
              <CodexModelListEditor
                value={codex}
                onChange={(value) => onCodexChange?.(value)}
                readOnly={readOnly}
              />
            </div>
          </details>
        </>
      ) : (
        picker(labels("model"), model, (value) => onModelChange?.(value))
      )}
    </div>
  )
}
