import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import messages from "@/i18n/messages/en.json"
import * as api from "@/lib/api"
import type { AcpAgentInfo, AgentType, PreflightResult } from "@/lib/types"
import {
  AcpAgentSettings,
  invalidateAgentCheckCache,
} from "./acp-agent-settings"

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return Object.fromEntries(
    Object.entries(actual).map(([key, value]) => [
      key,
      typeof value === "function" ? vi.fn(() => new Promise(() => {})) : value,
    ])
  )
})
vi.mock("next/navigation", () => {
  const params = new URLSearchParams()
  return { useSearchParams: () => params }
})
vi.mock("@/lib/platform", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  subscribe: vi.fn(async () => () => {}),
}))

const makeAgent = (agent_type: AgentType, sort_order = 0): AcpAgentInfo => ({
  agent_type,
  skills_capable: true,
  registry_id: agent_type,
  registry_version: "1.0.0",
  supports_custom_version: true,
  name: agent_type,
  description: "",
  available: true,
  distribution_type: "npx",
  is_acp_adapter: false,
  custom_source: null,
  enabled: true,
  sort_order,
  installed_version: "1.0.0",
  host_tools_agent_mode: false,
  env: { UNSAVED_TEST: "original" },
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
})
const agents = ["gemini", "codex", "grok", "claude_code"].map((kind, index) =>
  makeAgent(kind as AgentType, index)
)
const ready = (agent_type: AgentType): PreflightResult => ({
  agent_type,
  agent_name: agent_type,
  passed: true,
  adapter: null,
  checks: [
    {
      check_id: "ready",
      label: "Ready immediately",
      status: "warn",
      message: "Environment finished",
      fixes: [],
    },
  ],
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}
const panel = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AcpAgentSettings />
    </NextIntlClientProvider>
  )

beforeEach(() => {
  vi.clearAllMocks()
  invalidateAgentCheckCache()
  vi.mocked(api.acpListAgentsSnapshot).mockResolvedValue(agents)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("agent settings progressive loading", () => {
  it("renders editable configuration while providers and version probes are pending", async () => {
    const probe = deferred<PreflightResult>()
    vi.mocked(api.acpPreflight).mockImplementation((kind) =>
      kind === "gemini" ? probe.promise : new Promise(() => {})
    )
    panel()
    const env = await screen.findByDisplayValue("UNSAVED_TEST=original")
    expect(env).toBeEnabled()
    const versionCard = screen.getByText("Version Status").closest("button")!
    expect(versionCard).not.toHaveTextContent("PASS")
    fireEvent.change(env, { target: { value: "UNSAVED_TEST=edited" } })
    await act(async () => probe.resolve(ready("gemini")))
    expect(await screen.findByText("Ready immediately")).toBeVisible()
    expect(versionCard).not.toHaveTextContent("PASS")
    expect(screen.getByDisplayValue("UNSAVED_TEST=edited")).toBeEnabled()
    expect(api.acpPreflight).toHaveBeenCalledTimes(2)
    expect(api.acpListAgents).not.toHaveBeenCalled()
  })

  it("promotes a newly selected agent when a lane becomes free", async () => {
    const release = deferred<string | null>()
    vi.mocked(api.acpPreflight).mockImplementation(async (kind) => ready(kind))
    vi.mocked(api.acpGetAgentStatus).mockImplementation(async (kind) => ({
      agent_type: kind,
      available: true,
      enabled: true,
      installed_version: "1.0.0",
      is_acp_adapter: false,
    }))
    vi.mocked(api.acpDetectAgentLocalVersion).mockImplementation((kind) =>
      kind === "gemini" ? release.promise : new Promise(() => {})
    )
    panel()
    await screen.findByDisplayValue("UNSAVED_TEST=original")
    fireEvent.click(
      document
        .querySelector('[data-agent-type="grok"]')!
        .querySelector("span.text-sm")!
    )
    await act(async () => release.resolve("1.0.1"))
    await waitFor(() => expect(api.acpPreflight).toHaveBeenCalledTimes(3))
    expect(vi.mocked(api.acpPreflight).mock.calls[2][0]).toBe("grok")
  })

  it("reuses completed checks on a revisit and forces a manual refresh", async () => {
    vi.mocked(api.acpListAgentsSnapshot).mockResolvedValue([agents[0]])
    vi.mocked(api.acpPreflight).mockImplementation(async (kind) => ready(kind))
    vi.mocked(api.acpDetectAgentLocalVersion).mockResolvedValue("1.0.0")
    vi.mocked(api.acpGetAgentStatus).mockResolvedValue({
      agent_type: "gemini",
      available: true,
      enabled: true,
      installed_version: "1.0.0",
      is_acp_adapter: false,
    })
    const first = panel()
    await screen.findByText("Ready immediately")
    await waitFor(() =>
      expect(screen.queryByText("Checking…")).not.toBeInTheDocument()
    )
    first.unmount()
    panel()
    await screen.findByText("Ready immediately")
    expect(api.acpPreflight).toHaveBeenCalledTimes(1)
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh check gemini" })
    )
    await waitFor(() =>
      expect(api.acpPreflight).toHaveBeenCalledWith("gemini", true)
    )
    expect(api.acpDetectAgentLocalVersion).toHaveBeenCalledWith("gemini", true)
  })

  it("invalidates a completed check after installation and preserves unsaved edits", async () => {
    vi.mocked(api.acpListAgentsSnapshot).mockResolvedValue([
      { ...agents[0], installed_version: null },
    ])
    vi.mocked(api.acpPreflight).mockImplementation(async (kind) => ready(kind))
    vi.mocked(api.acpDetectAgentLocalVersion).mockResolvedValue(null)
    vi.mocked(api.acpGetAgentStatus).mockResolvedValue({
      agent_type: "gemini",
      available: true,
      enabled: true,
      installed_version: null,
      is_acp_adapter: false,
    })
    vi.mocked(api.acpPrepareNpxAgent).mockResolvedValue("1.0.0")
    panel()
    const env = await screen.findByDisplayValue("UNSAVED_TEST=original")
    await screen.findByText("Ready immediately")
    await waitFor(() =>
      expect(screen.queryByText("Checking…")).not.toBeInTheDocument()
    )
    fireEvent.change(env, { target: { value: "UNSAVED_TEST=edited" } })
    fireEvent.click(screen.getAllByRole("button", { name: "Install" })[0])
    await waitFor(() => expect(api.acpPrepareNpxAgent).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(api.acpPreflight).toHaveBeenCalledWith("gemini", true)
    )
    expect(screen.getByDisplayValue("UNSAVED_TEST=edited")).toBeEnabled()
  })

  it("releases hung lanes after fifteen seconds without clearing the editor", async () => {
    vi.mocked(api.acpPreflight).mockImplementation(() => new Promise(() => {}))
    vi.mocked(api.acpDetectAgentLocalVersion).mockImplementation(
      () => new Promise(() => {})
    )
    vi.mocked(api.acpGetAgentStatus).mockImplementation(
      () => new Promise(() => {})
    )
    vi.useFakeTimers()
    panel()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(screen.getByDisplayValue("UNSAVED_TEST=original")).toBeEnabled()
    expect(api.acpPreflight).toHaveBeenCalledTimes(4)
    expect(
      screen.getByText(messages.AcpAgentSettings.checkTimedOut)
    ).toBeVisible()
  })
})
