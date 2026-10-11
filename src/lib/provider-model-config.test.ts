import { describe, expect, it } from "vitest"
import {
  fillEmptyClaudeRoles,
  joinClaudeContext,
  selectCodexProviderModel,
  splitClaudeContext,
} from "./provider-model-config"
import {
  parseCodexModelConfig,
  serializeCodexModelConfig,
  parseClaudeProviderModel,
  serializeClaudeProviderModel,
} from "./types"

describe("provider model selection", () => {
  it("round-trips named roles, subagents and legacy reasoning without changing IDs", () => {
    const value = {
      main: "gateway[1m]",
      sonnetName: "Daily",
      opusName: "Deep",
      haikuName: "Quick",
      fableName: "Long",
      subagent: "child[1m]",
      reasoning: "legacy",
    }
    expect(
      parseClaudeProviderModel(serializeClaudeProviderModel(value))
    ).toEqual(value)
    expect(
      parseClaudeProviderModel(
        serializeClaudeProviderModel({ ...value, sonnetName: " " })
      ).sonnetName
    ).toBeUndefined()
  })
  it("normalizes context suffixes without changing provider prefixes", () => {
    expect(splitClaudeContext("gateway/model[1M][1m]")).toEqual({
      id: "gateway/model",
      oneM: true,
    })
    expect(joinClaudeContext(" gateway/model[1M] ", true)).toBe(
      "gateway/model[1m]"
    )
    expect(joinClaudeContext("gateway/model[1m]", false)).toBe("gateway/model")
    expect(joinClaudeContext("", true)).toBe("")
  })
  it("fills only empty Claude roles and preserves all advanced options", () => {
    const value = {
      main: "manual",
      haiku: "existing",
      sonnet: " ",
      reasoning: "reasoning",
      customOption: "custom",
      sonnetName: "Display only",
      subagent: "child",
    }
    expect(fillEmptyClaudeRoles(value)).toEqual({
      ...value,
      sonnet: "manual",
      opus: "manual",
      fable: "manual",
    })
    expect(value.sonnet).toBe(" ")
    expect(fillEmptyClaudeRoles({ opus: "existing" })).toEqual({
      opus: "existing",
    })
  })

  it("reuses custom entries and preserves their overrides and other models", () => {
    const value = {
      customs: [
        { slug: "manual", base: "template", overrides: { context_window: 42 } },
      ],
      excludedOfficials: ["old"],
      default: "old",
    }
    const next = selectCodexProviderModel(value, "manual", [])
    expect(next).toEqual({ ...value, default: "manual" })
    expect(next.customs).toBe(value.customs)
  })

  it("persists a same-name built-in as a valid default even with an empty custom directory", () => {
    const next = selectCodexProviderModel(
      { customs: [], excludedOfficials: ["same", "other"] },
      "same",
      [{ slug: "same", visibility: "hide" }]
    )
    expect(next).toEqual({
      customs: [{ slug: "same", base: "same" }],
      default: "same",
      excludedOfficials: ["other"],
    })
    expect(parseCodexModelConfig(serializeCodexModelConfig(next))).toEqual(next)
  })

  it("uses the existing catalog priority fallback and retains existing advanced settings", () => {
    const next = selectCodexProviderModel(
      {
        customs: [
          { slug: "keep", base: "base", overrides: { tool_mode: "direct" } },
        ],
        excludedOfficials: ["exclude"],
      },
      "unknown",
      [
        { slug: "unranked" },
        { slug: "second", priority: 2 },
        { slug: "first", priority: 1 },
      ]
    )
    expect(next.customs[1]).toEqual({ slug: "unknown", base: "first" })
    expect(next.customs[0].overrides).toEqual({ tool_mode: "direct" })
    expect(next.excludedOfficials).toEqual(["exclude"])
  })
})
