import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NextIntlClientProvider } from "next-intl"
import { useState, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import enMessages from "@/i18n/messages/en.json"
import {
  codexBundledCatalog,
  createModelProvider,
  fetchProviderModels,
  updateModelProvider,
} from "@/lib/api"
import type {
  ClaudeProviderModel,
  ModelDiscoveryResult,
  ModelProviderInfo,
} from "@/lib/types"
import { ProviderModelConfiguration } from "./provider-model-configuration"
import { AddModelProviderDialog } from "./add-model-provider-dialog"
import { EditModelProviderDialog } from "./edit-model-provider-dialog"
import { requestSettingsNavigation } from "./settings-navigation"

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return Object.fromEntries(
    Object.entries(actual).map(([name, value]) => [
      name,
      typeof value === "function" ? vi.fn(() => new Promise(() => {})) : value,
    ])
  )
})

const result: ModelDiscoveryResult = {
  endpoint: "https://gateway.test/cc/v1/models",
  models: [
    { id: "claude-one", displayName: "Friendly One" },
    { id: "gpt-two" },
  ],
}
const provider: ModelProviderInfo = {
  id: 42,
  name: "Fixture",
  api_url: "https://gateway.test/cc",
  api_key: "fixture-key",
  api_key_masked: "***",
  agent_type: "claude_code",
  model: JSON.stringify({
    main: "manual",
    opus: "keep",
    customOption: "special",
  }),
  created_at: "",
  updated_at: "",
}
function intl(children: ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  )
}
function Config({
  apiUrl = "https://gateway.test/cc",
  agentType = "claude_code" as const,
}: {
  apiUrl?: string
  agentType?: "claude_code" | "gemini"
}) {
  const [claude, setClaude] = useState<ClaudeProviderModel>({
    main: "manual",
    opus: "keep",
  })
  const [model, setModel] = useState("manual-gemini")
  return (
    <ProviderModelConfiguration
      agentType={agentType}
      apiUrl={apiUrl}
      apiKey="fixture-key"
      claude={claude}
      onClaudeChange={setClaude}
      model={model}
      onModelChange={setModel}
    />
  )
}

describe("model discovery forms", () => {
  beforeEach(() => {
    vi.mocked(fetchProviderModels).mockReset().mockResolvedValue(result)
    vi.mocked(codexBundledCatalog).mockResolvedValue([
      { slug: "template", priority: 1 },
    ])
    vi.mocked(createModelProvider).mockReset().mockResolvedValue(provider)
    vi.mocked(updateModelProvider)
      .mockReset()
      .mockResolvedValue({ provider, affectedRunningSessions: 0 })
  })

  it("uses a content page and preserves named mappings, context and legacy fields through save and reopen", async () => {
    const user = userEvent.setup()
    const stored = {
      ...provider,
      model: JSON.stringify({
        main: "main[1m]",
        sonnet: "daily[1m]",
        sonnetName: "Daily",
        haiku: "old-haiku[1m]",
        subagent: "child",
        reasoning: "legacy",
        customOption: "special",
      }),
    }
    const view = render(
      intl(
        <EditModelProviderDialog
          provider={stored}
          onOpenChange={() => {}}
          onProviderUpdated={() => {}}
        />
      )
    )
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("heading", { name: "Edit Provider" })).toBeVisible()
    expect(screen.queryByLabelText("Reasoning Model (Thinking)")).toBeNull()
    expect(screen.getByRole("table", { name: "Model mapping" })).toBeVisible()
    expect(screen.getByLabelText("Main Model")).toHaveValue("main")
    expect(screen.getByLabelText("Declare 1M for Main Model")).toBeChecked()
    expect(screen.getByLabelText("Default Sonnet Model")).toHaveValue("daily")
    expect(screen.getByLabelText("Default Haiku Model")).toHaveValue(
      "old-haiku[1m]"
    )
    expect(
      screen.getByText("Advanced configuration").parentElement
    ).not.toHaveAttribute("open")
    await user.clear(screen.getByLabelText("Sonnet display name"))
    await user.click(screen.getByLabelText("Declare 1M for Main Model"))
    await user.type(screen.getByLabelText("Subagent model"), "-new")
    await user.click(screen.getByLabelText("Declare 1M for Subagent model"))
    await user.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(updateModelProvider).toHaveBeenCalled())
    const model = vi.mocked(updateModelProvider).mock.calls[0][0].model!
    expect(JSON.parse(model)).toEqual({
      main: "main",
      sonnet: "daily[1m]",
      haiku: "old-haiku[1m]",
      subagent: "child-new[1m]",
      reasoning: "legacy",
      customOption: "special",
    })
    view.unmount()
    render(
      intl(
        <EditModelProviderDialog
          provider={{ ...stored, model }}
          onOpenChange={() => {}}
          onProviderUpdated={() => {}}
        />
      )
    )
    expect(screen.getByLabelText("Subagent model")).toHaveValue("child-new")
    expect(screen.getByLabelText("Declare 1M for Subagent model")).toBeChecked()
    expect(screen.getByLabelText("Sonnet display name")).toHaveValue("")
  })

  it("protects unsaved changes on return and sidebar navigation", async () => {
    const user = userEvent.setup()
    const close = vi.fn()
    const leave = vi.fn()
    render(
      intl(
        <AddModelProviderDialog
          open
          onOpenChange={close}
          onProviderAdded={() => {}}
        />
      )
    )
    await user.type(screen.getByLabelText("Name"), "Unsaved")
    await user.click(screen.getByRole("button", { name: "Back" }))
    expect(close).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Keep editing" }))
    expect(screen.getByLabelText("Name")).toHaveValue("Unsaved")
    act(() => requestSettingsNavigation(leave))
    expect(leave).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Discard changes" }))
    expect(leave).toHaveBeenCalledTimes(1)
    expect(createModelProvider).not.toHaveBeenCalled()
  })

  it("fetches without selecting or saving, searches display names and saves actual IDs", async () => {
    const user = userEvent.setup()
    render(
      intl(
        <AddModelProviderDialog
          open
          onOpenChange={() => {}}
          onProviderAdded={() => {}}
        />
      )
    )
    await user.type(screen.getByLabelText("Name"), "Fixture")
    await user.type(screen.getByLabelText("API URL"), "https://gateway.test/cc")
    await user.type(screen.getByLabelText("API Key"), "fixture-key")
    expect(screen.getByLabelText("API Key")).toHaveAttribute("type", "password")
    await user.type(screen.getByLabelText("Main Model"), "manual")
    await user.click(screen.getByRole("button", { name: "Fetch models" }))
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Fetched 2 models"
    )
    expect(screen.getByLabelText("Main Model")).toHaveValue("manual")
    expect(createModelProvider).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole("button", { name: "Choose model for Main Model" })
    )
    await user.type(screen.getByRole("combobox", { name: "" }), "Friendly")
    await user.click(screen.getByRole("option", { name: /claude-one/ }))
    expect(screen.getByLabelText("Main Model")).toHaveValue("claude-one")
    await user.click(screen.getByRole("button", { name: "Create" }))
    await waitFor(() => expect(createModelProvider).toHaveBeenCalled())
    expect(
      JSON.parse(vi.mocked(createModelProvider).mock.calls[0][0].model!)
    ).toEqual({ main: "claude-one" })
  })

  it.each(["Sonnet", "Opus", "Fable", "Haiku"])(
    "fills the %s display name on selection and preserves manual edits",
    async (role) => {
      const user = userEvent.setup()
      render(intl(<Config />))
      await user.click(screen.getByRole("button", { name: "Fetch models" }))
      await screen.findByRole("status")
      const name = screen.getByLabelText(`${role} display name`)
      const select = async (id: string) => {
        await user.click(
          screen.getByRole("button", {
            name: `Choose model for Default ${role} Model`,
          })
        )
        await user.click(screen.getByRole("option", { name: new RegExp(id) }))
      }

      expect(name).toHaveValue("")
      await select("claude-one")
      expect(name).toHaveValue("claude-one")
      expect(screen.getByLabelText(`Default ${role} Model`)).toHaveValue(
        "claude-one"
      )
      await select("gpt-two")
      expect(name).toHaveValue("gpt-two")
      await user.clear(name)
      await user.type(name, "My model")
      await select("claude-one")
      expect(name).toHaveValue("My model")
      await user.clear(name)
      await select("gpt-two")
      expect(name).toHaveValue("gpt-two")
    }
  )

  it("saves auto-filled names on create and manual names on edit with context preserved", async () => {
    const user = userEvent.setup()
    const view = render(
      intl(
        <AddModelProviderDialog
          open
          onOpenChange={() => {}}
          onProviderAdded={() => {}}
        />
      )
    )
    await user.type(screen.getByLabelText("Name"), "Fixture")
    await user.type(screen.getByLabelText("API URL"), provider.api_url)
    await user.type(screen.getByLabelText("API Key"), "fixture-key")
    await user.click(screen.getByRole("button", { name: "Fetch models" }))
    await screen.findByRole("status")
    await user.click(
      screen.getByRole("button", {
        name: "Choose model for Default Sonnet Model",
      })
    )
    await user.click(screen.getByRole("option", { name: /claude-one/ }))
    await user.click(
      screen.getByLabelText("Declare 1M for Default Sonnet Model")
    )
    expect(screen.getByLabelText("Sonnet display name")).toHaveValue(
      "claude-one"
    )
    await user.click(screen.getByRole("button", { name: "Create" }))
    await waitFor(() => expect(createModelProvider).toHaveBeenCalledTimes(1))
    const model = vi.mocked(createModelProvider).mock.calls[0][0].model!
    expect(JSON.parse(model)).toEqual({
      sonnet: "claude-one[1m]",
      sonnetName: "claude-one",
    })
    view.unmount()
    render(
      intl(
        <EditModelProviderDialog
          provider={{ ...provider, model }}
          onOpenChange={() => {}}
          onProviderUpdated={() => {}}
        />
      )
    )
    expect(screen.getByLabelText("Sonnet display name")).toHaveValue(
      "claude-one"
    )
    await user.click(screen.getByRole("button", { name: "Fetch models" }))
    await screen.findByRole("status")
    await user.click(
      screen.getByRole("button", {
        name: "Choose model for Default Sonnet Model",
      })
    )
    await user.click(screen.getByRole("option", { name: "gpt-two" }))
    expect(screen.getByLabelText("Sonnet display name")).toHaveValue("gpt-two")
    expect(
      screen.getByLabelText("Declare 1M for Default Sonnet Model")
    ).toBeChecked()
    await user.clear(screen.getByLabelText("Sonnet display name"))
    await user.type(screen.getByLabelText("Sonnet display name"), "Daily model")
    await user.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(updateModelProvider).toHaveBeenCalledTimes(1))
    expect(
      JSON.parse(vi.mocked(updateModelProvider).mock.calls[0][0].model!)
    ).toEqual({ sonnet: "gpt-two[1m]", sonnetName: "Daily model" })
  })

  it("edits using the saved key ID and explicitly fills only blank roles", async () => {
    const user = userEvent.setup()
    render(
      intl(
        <EditModelProviderDialog
          provider={provider}
          onOpenChange={() => {}}
          onProviderUpdated={() => {}}
        />
      )
    )
    expect(screen.getByLabelText("API Key")).toHaveValue("")
    await user.click(screen.getByRole("button", { name: "Fetch models" }))
    await screen.findByRole("status")
    expect(fetchProviderModels).toHaveBeenCalledWith({
      agentType: "claude_code",
      apiUrl: provider.api_url,
      apiKey: "",
      providerId: 42,
    })
    await user.click(screen.getByText("Advanced configuration"))
    await user.click(
      screen.getByRole("button", { name: "Fill empty roles from main model" })
    )
    await user.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(updateModelProvider).toHaveBeenCalled())
    const saved = vi.mocked(updateModelProvider).mock.calls[0][0]
    expect(saved.apiKey).toBeUndefined()
    expect(JSON.parse(saved.model!)).toEqual({
      main: "manual",
      opus: "keep",
      haiku: "manual",
      sonnet: "manual",
      fable: "manual",
      customOption: "special",
    })
  })

  it("invalidates changed addresses, ignores late results and preserves editable drafts on failure", async () => {
    let finish!: (value: ModelDiscoveryResult) => void
    vi.mocked(fetchProviderModels).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const user = userEvent.setup()
    const view = render(intl(<Config />))
    await user.click(screen.getByRole("button", { name: "Fetch models" }))
    await user.type(screen.getByLabelText("Main Model"), "-draft")
    view.rerender(intl(<Config apiUrl="https://different.test" />))
    await act(async () => {
      finish(result)
    })
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.getByLabelText("Main Model")).toHaveValue("manual-draft")
    vi.mocked(fetchProviderModels).mockRejectedValueOnce({
      code: "network",
      i18n_key: "ModelDiscovery.errors.timeout",
      message: "private",
    })
    await user.click(screen.getByRole("button", { name: "Fetch models" }))
    await screen.findByRole("alert")
    expect(screen.getByLabelText("Main Model")).toHaveValue("manual-draft")
    await user.type(screen.getByLabelText("Main Model"), "-editable")
    expect(screen.getByLabelText("Main Model")).toHaveValue(
      "manual-draft-editable"
    )
  })

  it("invalidates the list on agent and key changes and on form close", async () => {
    const user = userEvent.setup()
    const view = render(intl(<Config />))
    await user.click(screen.getByRole("button", { name: "Fetch models" }))
    await screen.findByRole("status")
    view.rerender(intl(<Config agentType="gemini" />))
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.getByLabelText("Model")).toHaveValue("manual-gemini")
    view.rerender(
      intl(
        <ProviderModelConfiguration
          agentType="gemini"
          apiUrl="https://gateway.test"
          apiKey="new"
          model="draft"
        />
      )
    )
    await user.click(screen.getByRole("button", { name: "Fetch models" }))
    await screen.findByRole("status")
    view.rerender(
      intl(
        <ProviderModelConfiguration
          agentType="gemini"
          apiUrl="https://gateway.test"
          apiKey="changed"
          model="draft"
        />
      )
    )
    expect(screen.queryByRole("status")).toBeNull()
    view.unmount()
    render(intl(<Config />))
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("keeps provider bindings read-only and offers a provider edit entry", () => {
    render(
      intl(
        <ProviderModelConfiguration
          agentType="claude_code"
          apiUrl={provider.api_url}
          apiKey=""
          readOnly
          claude={{ main: "manual" }}
        />
      )
    )
    expect(screen.getByLabelText("Main Model")).toHaveAttribute("readonly")
    expect(screen.queryByRole("button", { name: "Fetch models" })).toBeNull()
    expect(
      screen.getByRole("link", { name: "Edit model provider" })
    ).toHaveAttribute("href", "/settings/model-providers")
  })

  it("commits a manually typed Codex model once and preserves advanced entries", async () => {
    const user = userEvent.setup()
    const codexProvider = {
      ...provider,
      agent_type: "codex" as const,
      model: JSON.stringify({
        customs: [
          {
            slug: "keep",
            base: "template",
            overrides: { tool_mode: "direct" },
          },
        ],
        default: "keep",
      }),
    }
    render(
      intl(
        <EditModelProviderDialog
          provider={codexProvider}
          onOpenChange={() => {}}
          onProviderUpdated={() => {}}
        />
      )
    )
    await user.clear(screen.getByLabelText("Model"))
    await user.type(screen.getByLabelText("Model"), "manual-new")
    await user.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(updateModelProvider).toHaveBeenCalled())
    const saved = JSON.parse(
      vi.mocked(updateModelProvider).mock.calls[0][0].model!
    )
    expect(saved.default).toBe("manual-new")
    expect(saved.customs).toEqual([
      { slug: "keep", base: "template", overrides: { tool_mode: "direct" } },
      { slug: "manual-new", base: "template" },
    ])
  })
})
