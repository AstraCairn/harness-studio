/**
 * The Fable pin (`ANTHROPIC_DEFAULT_FABLE_MODEL`, what Claude Code's `fable`
 * alias resolves to) rides the same plumbing as the other Claude model pins.
 * These drive the real panel: a pin read off the native config shows in its
 * field, an edit to it lands in that key and no other, and a bound provider
 * owns it like the other pins — set when the provider pins Fable, cleared when
 * it does not.
 */
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"

import enMessages from "@/i18n/messages/en.json"
import {
  acpListAgentsSnapshot,
  acpUpdateAgentConfig,
  acpUpdateAgentEnv,
  listModelProviders,
  fetchProviderModels,
} from "@/lib/api"
import type { AcpAgentInfo, ModelProviderInfo } from "@/lib/types"

import {
  AcpAgentSettings,
  invalidateAgentCheckCache,
} from "./acp-agent-settings"

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  // Every function is stubbed so nothing here can reach the real transport;
  // the calls the panel makes on mount that these tests don't need (preflight,
  // catalogs) simply never settle.
  return Object.fromEntries(
    Object.entries(actual).map(([name, value]) => [
      name,
      typeof value === "function" ? vi.fn(() => new Promise(() => {})) : value,
    ])
  )
})
vi.mock("next/navigation", () => {
  const params = new URLSearchParams()
  return { useSearchParams: () => params }
})

const FABLE_KEY = "ANTHROPIC_DEFAULT_FABLE_MODEL"

function claudeAgent(overrides: Partial<AcpAgentInfo> = {}): AcpAgentInfo {
  return {
    agent_type: "claude_code",
    skills_capable: true,
    registry_id: "claude-code",
    registry_version: "1.0.0",
    supports_custom_version: false,
    name: "Claude Code",
    description: "",
    available: true,
    distribution_type: "npx",
    is_acp_adapter: true,
    custom_source: null,
    enabled: true,
    sort_order: 0,
    installed_version: null,
    host_tools_agent_mode: false,
    env: {},
    config_json: null,
    config_file_path: null,
    opencode_auth_json: null,
    codex_auth_json: null,
    cline_secrets_json: null,
    codex_config_toml: null,
    codex_model_catalog: null,
    codex_sandbox_settings: null,
    grok_config_toml: null,
    grok_settings: null,
    hermes_config_yaml: null,
    cursor_cli_config_json: null,
    cursor_settings: null,
    model_provider_id: null,
    icon_url: null,
    ...overrides,
  }
}

function provider(
  id: number,
  letter: string,
  model: Record<string, string>
): ModelProviderInfo {
  return {
    id,
    name: `Provider ${letter}`,
    api_url: `https://gateway-${letter.toLowerCase()}.test`,
    api_key: `key-${letter.toLowerCase()}`,
    api_key_masked: "",
    agent_type: "claude_code",
    model: JSON.stringify(model),
    created_at: "",
    updated_at: "",
  }
}

/** The control that sits under a visible `<label>` in the config card (the
 *  panel's labels carry no `htmlFor`). */
function controlUnder(label: string, role: "combobox" | "textbox") {
  const labelEl = screen.getByText(label, { selector: "label" })
  return within(labelEl.parentElement as HTMLElement).getByRole(role)
}

function nativeConfigEnv(): Record<string, string> {
  const config = controlUnder(
    "Native JSON Config",
    "textbox"
  ) as HTMLTextAreaElement
  return (
    (JSON.parse(config.value) as { env?: Record<string, string> }).env ?? {}
  )
}

async function choose(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string
) {
  await user.click(controlUnder(label, "combobox"))
  const list = await screen.findByRole("listbox")
  await user.click(within(list).getByRole("option", { name: option }))
}

async function openPanel(agent: AcpAgentInfo) {
  vi.mocked(acpListAgentsSnapshot).mockResolvedValue([agent])
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <AcpAgentSettings />
    </NextIntlClientProvider>
  )
  await screen.findByText("Native JSON Config", { selector: "label" })
}

async function saveConfig(user: ReturnType<typeof userEvent.setup>) {
  const calls = vi.mocked(acpUpdateAgentEnv).mock.calls.length
  await user.click(
    screen.getByRole("button", { name: "Save Config Management" })
  )
  await waitFor(() =>
    expect(vi.mocked(acpUpdateAgentEnv).mock.calls.length).toBe(calls + 1)
  )
  const [, envPatch] = vi.mocked(acpUpdateAgentEnv).mock.calls[calls]
  return envPatch
}

describe("AcpAgentSettings — the Claude Code Fable model pin", () => {
  beforeEach(() => {
    invalidateAgentCheckCache()
    vi.mocked(listModelProviders).mockResolvedValue([])
    vi.mocked(acpUpdateAgentEnv).mockReset().mockResolvedValue(0)
    vi.mocked(acpUpdateAgentConfig).mockReset().mockResolvedValue(0)
  })

  it("edits named mappings and subagent context through the native draft without clobbering unrelated values", async () => {
    const user = userEvent.setup()
    await openPanel(
      claudeAgent({
        config_json: JSON.stringify({
          env: {
            ANTHROPIC_DEFAULT_SONNET_MODEL_NAME: "Old",
            CLAUDE_CODE_SUBAGENT_MODEL: "child",
            ANTHROPIC_REASONING_MODEL: "legacy",
            UNRELATED: "keep",
          },
        }),
      })
    )
    await user.clear(screen.getByLabelText("Sonnet display name"))
    await user.type(screen.getByLabelText("Opus display name"), "Deep")
    await user.click(screen.getByLabelText("Declare 1M for Subagent model"))
    expect(nativeConfigEnv()).toMatchObject({
      ANTHROPIC_DEFAULT_OPUS_MODEL_NAME: "Deep",
      CLAUDE_CODE_SUBAGENT_MODEL: "child[1m]",
      ANTHROPIC_REASONING_MODEL: "legacy",
      UNRELATED: "keep",
    })
    expect(nativeConfigEnv()).not.toHaveProperty(
      "ANTHROPIC_DEFAULT_SONNET_MODEL_NAME"
    )
    const saved = await saveConfig(user)
    expect(saved.env.CLAUDE_CODE_SUBAGENT_MODEL).toBe("child[1m]")
    expect(saved.env).not.toHaveProperty("ANTHROPIC_DEFAULT_SONNET_MODEL_NAME")
  })

  it("fetches models in the custom endpoint draft without saving and fills roles through the draft handlers", async () => {
    vi.mocked(fetchProviderModels).mockResolvedValue({
      endpoint: "https://gateway.test/cc/v1/models",
      models: [{ id: "claude-new" }],
    })
    const user = userEvent.setup()
    await openPanel(
      claudeAgent({
        config_json: JSON.stringify({
          env: {
            ANTHROPIC_BASE_URL: "https://gateway.test/cc",
            ANTHROPIC_AUTH_TOKEN: "fixture-key",
            ANTHROPIC_MODEL: "manual",
            ANTHROPIC_DEFAULT_OPUS_MODEL: "keep",
          },
        }),
      })
    )
    await user.click(screen.getByRole("button", { name: "Fetch models" }))
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Fetched 1 models"
    )
    expect(acpUpdateAgentConfig).not.toHaveBeenCalled()
    expect(controlUnder("Main Model", "textbox")).toHaveValue("manual")
    await user.click(screen.getByText("Advanced configuration"))
    await user.click(
      screen.getByRole("button", { name: "Fill empty roles from main model" })
    )
    expect(nativeConfigEnv()).toMatchObject({
      ANTHROPIC_MODEL: "manual",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "keep",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "manual",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "manual",
      ANTHROPIC_DEFAULT_FABLE_MODEL: "manual",
    })
    await saveConfig(user)
    expect(
      vi.mocked(acpUpdateAgentEnv).mock.calls[0][1].env
        .ANTHROPIC_DEFAULT_FABLE_MODEL
    ).toBe("manual")
  })

  it("shows the pin from the native config, and an edit saves that key only", async () => {
    const user = userEvent.setup()
    await openPanel(
      claudeAgent({
        config_json: JSON.stringify({
          env: {
            ANTHROPIC_BASE_URL: "https://gateway.test",
            ANTHROPIC_AUTH_TOKEN: "key",
            [FABLE_KEY]: "gw/fable-old",
          },
        }),
      })
    )
    await user.click(screen.getByText("Advanced configuration"))
    const fable = controlUnder("Default Fable Model", "textbox")
    await waitFor(() => expect(fable).toHaveValue("gw/fable-old"))
    expect(fable).not.toHaveAttribute("readonly")

    await user.clear(fable)
    await user.type(fable, "gw/fable-2")

    const env = nativeConfigEnv()
    expect(env[FABLE_KEY]).toBe("gw/fable-2")
    // The keystrokes reached the Fable pin and nothing else.
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBeUndefined()
    expect(env.ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION).toBeUndefined()

    const envPatch = await saveConfig(user)
    expect(envPatch.env[FABLE_KEY]).toBe("gw/fable-2")
    expect(
      envPatch.env.ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION
    ).toBeUndefined()
    const [, configPatch] = vi.mocked(acpUpdateAgentConfig).mock.calls[0]
    expect(JSON.parse(configPatch.config_json ?? "{}").env[FABLE_KEY]).toBe(
      "gw/fable-2"
    )
  })

  it("follows the bound provider: set by one that pins Fable, cleared by one that does not", async () => {
    vi.mocked(listModelProviders).mockResolvedValue([
      provider(1, "A", {
        main: "model-a",
        fable: "gw/fable-a",
        fableName: "Long",
        subagent: "child[1m]",
      }),
      provider(2, "B", { main: "model-b" }),
    ])
    const user = userEvent.setup()
    await openPanel(claudeAgent())

    // A first-time pick takes the head of the list: Provider A.
    await choose(user, "Auth Mode", "Model Provider")
    await user.click(screen.getByText("Advanced configuration"))
    const fable = () => controlUnder("Default Fable Model", "textbox")
    await waitFor(() => expect(fable()).toHaveValue("gw/fable-a"))
    expect(fable()).toHaveAttribute("readonly")
    expect(nativeConfigEnv()[FABLE_KEY]).toBe("gw/fable-a")
    const boundToA = await saveConfig(user)
    expect(boundToA.modelProviderId).toBe(1)
    expect(boundToA.env[FABLE_KEY]).toBe("gw/fable-a")
    expect(boundToA.env.ANTHROPIC_DEFAULT_FABLE_MODEL_NAME).toBe("Long")
    expect(boundToA.env.CLAUDE_CODE_SUBAGENT_MODEL).toBe("child[1m]")

    await choose(user, "Select Model Provider", "Provider B")
    await waitFor(() => expect(fable()).toHaveValue(""))
    expect(nativeConfigEnv()).not.toHaveProperty(FABLE_KEY)
    const boundToB = await saveConfig(user)
    expect(boundToB.modelProviderId).toBe(2)
    expect(boundToB.env).not.toHaveProperty(FABLE_KEY)
    expect(boundToB.env).not.toHaveProperty(
      "ANTHROPIC_DEFAULT_FABLE_MODEL_NAME"
    )
    expect(boundToB.env).not.toHaveProperty("CLAUDE_CODE_SUBAGENT_MODEL")
    expect(boundToB.env.ANTHROPIC_MODEL).toBe("model-b")
  })
})
