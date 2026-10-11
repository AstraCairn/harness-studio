"use client"

import { useEffect, useId, useRef, useState } from "react"
import { ArrowLeft, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createModelProvider, updateModelProvider } from "@/lib/api"
import { getAgentLabel } from "@/lib/custom-agents"
import { toErrorMessage } from "@/lib/app-error"
import {
  MODEL_PROVIDER_AGENT_TYPES,
  parseClaudeProviderModel,
  parseCodexModelConfig,
  serializeClaudeProviderModel,
  serializeCodexModelConfig,
  type AgentType,
  type ModelProviderInfo,
} from "@/lib/types"
import { ProviderModelConfiguration } from "./provider-model-configuration"
import { SETTINGS_NAVIGATION_EVENT } from "./settings-navigation"

export function ModelProviderDialog({
  provider,
  onOpenChange,
  onSaved,
}: {
  provider?: ModelProviderInfo
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const t = useTranslations("ModelProviderSettings")
  const page = useTranslations("ProviderEditor")
  const id = useId()
  const [name, setName] = useState(provider?.name ?? "")
  const [apiUrl, setApiUrl] = useState(provider?.api_url ?? "")
  const [apiKey, setApiKey] = useState("")
  const [agentType, setAgentType] = useState<AgentType>(
    provider?.agent_type ?? MODEL_PROVIDER_AGENT_TYPES[0]
  )
  const [claude, setClaude] = useState(() =>
    parseClaudeProviderModel(provider?.model ?? null)
  )
  const [codex, setCodex] = useState(() =>
    parseCodexModelConfig(provider?.model ?? null)
  )
  const [model, setModel] = useState(
    provider?.agent_type === "gemini" ? (provider.model ?? "") : ""
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const snapshot = JSON.stringify({
    name,
    apiUrl,
    apiKey,
    agentType,
    claude: serializeClaudeProviderModel(claude),
    codex: serializeCodexModelConfig(codex),
    model,
  })
  const initial = useRef(snapshot)
  const dirty = snapshot !== initial.current
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    nameInput.current?.focus()
    return () => {
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  const requestClose = () => {
    if (loading) return
    if (dirty) setPendingLeave(() => () => onOpenChange(false))
    else onOpenChange(false)
  }
  useEffect(() => {
    const navigate = (event: Event) => {
      if (!dirty && !loading) return
      event.preventDefault()
      if (!loading)
        setPendingLeave(
          () => (event as CustomEvent<{ leave: () => void }>).detail.leave
        )
    }
    window.addEventListener(SETTINGS_NAVIGATION_EVENT, navigate)
    return () => window.removeEventListener(SETTINGS_NAVIGATION_EVENT, navigate)
  }, [dirty, loading])
  const submit = async () => {
    if (!name.trim()) {
      setError(t("nameRequired"))
      return
    }
    if (!apiUrl.trim()) {
      setError(t("apiUrlRequired"))
      return
    }
    if (!provider && !apiKey.trim()) {
      setError(t("apiKeyRequired"))
      return
    }
    const payload =
      agentType === "claude_code"
        ? serializeClaudeProviderModel(claude)
        : agentType === "codex"
          ? serializeCodexModelConfig(codex)
          : model.trim() || null
    setLoading(true)
    setError(null)
    try {
      if (provider) {
        const result = await updateModelProvider({
          id: provider.id,
          name: name.trim() !== provider.name ? name.trim() : undefined,
          apiUrl:
            apiUrl.trim() !== provider.api_url ? apiUrl.trim() : undefined,
          apiKey: apiKey.trim() || undefined,
          model:
            (payload ?? "") !== (provider.model ?? "")
              ? (payload ?? "")
              : undefined,
        })
        toast.success(t("editSuccess"))
        if (result.affectedRunningSessions > 0) {
          toast.info(
            t("affectedRunningSessions", {
              count: result.affectedRunningSessions,
            })
          )
        }
      } else {
        await createModelProvider({
          name: name.trim(),
          apiUrl: apiUrl.trim(),
          apiKey: apiKey.trim(),
          agentType,
          model: payload,
        })
        toast.success(t("createSuccess"))
      }
      onOpenChange(false)
      onSaved()
    } catch (error) {
      setError(toErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }
  return (
    <section
      className="absolute inset-0 z-10 flex min-h-0 flex-col bg-background"
      aria-labelledby={`${id}-title`}
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          !event.defaultPrevented &&
          !(event.target as HTMLElement).closest(
            "input, textarea, [contenteditable=true]"
          )
        ) {
          event.stopPropagation()
          requestClose()
        }
      }}
    >
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={page("back")}
          disabled={loading}
          onClick={requestClose}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 id={`${id}-title`} className="text-sm font-semibold">
          {t(provider ? "editProvider" : "addProvider")}
        </h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto w-full max-w-6xl space-y-5">
          <div className="grid gap-4 rounded-md border p-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor={`${id}-name`} className="text-xs font-medium">
                {t("providerName")}
              </label>
              <Input
                id={`${id}-name`}
                ref={nameInput}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("providerNamePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${id}-agent`} className="text-xs font-medium">
                {t("agentType")}
              </label>
              <Select
                value={agentType}
                disabled={!!provider}
                onValueChange={(value) => {
                  setAgentType(value as AgentType)
                  setClaude({})
                  setCodex({ customs: [] })
                  setModel("")
                }}
              >
                <SelectTrigger id={`${id}-agent`} className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_PROVIDER_AGENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {getAgentLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${id}-url`} className="text-xs font-medium">
                {t("apiUrl")}
              </label>
              <Input
                id={`${id}-url`}
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder={t("apiUrlPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${id}-key`} className="text-xs font-medium">
                {t("apiKey")}
              </label>
              <Input
                id={`${id}-key`}
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={t(
                  provider ? "apiKeyKeepCurrent" : "apiKeyPlaceholder"
                )}
              />
            </div>
          </div>
          <ProviderModelConfiguration
            key={agentType}
            agentType={agentType}
            apiUrl={apiUrl}
            apiKey={apiKey}
            providerId={provider?.id}
            claude={claude}
            onClaudeChange={setClaude}
            codex={codex}
            onCodexChange={setCodex}
            model={model}
            onModelChange={setModel}
          />
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
      <footer className="flex shrink-0 justify-end gap-2 border-t bg-background px-4 py-3">
        <Button variant="outline" onClick={requestClose} disabled={loading}>
          {t("cancel")}
        </Button>
        <Button onClick={() => void submit()} disabled={loading}>
          {loading && <Loader2 className="size-3.5 animate-spin" />}
          {t(provider ? "save" : "create")}
        </Button>
      </footer>
      <AlertDialog
        open={pendingLeave != null}
        onOpenChange={(open) => {
          if (!open) setPendingLeave(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{page("discardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {page("discardDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{page("keepEditing")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const leave = pendingLeave
                setPendingLeave(null)
                leave?.()
              }}
            >
              {page("discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
