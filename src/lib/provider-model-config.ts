import type {
  ClaudeProviderModel,
  CodexModelConfig,
  CodexModelInfo,
} from "./types"

/** The suffix is a Claude Code context declaration, not part of the API ID. */
export function splitClaudeContext(value: string) {
  return {
    id: value.replace(/(?:\[1m\])+$/i, ""),
    oneM: /\[1m\]$/i.test(value),
  }
}

export function joinClaudeContext(value: string, oneM: boolean) {
  const { id } = splitClaudeContext(value.trim())
  return id ? `${id}${oneM ? "[1m]" : ""}` : ""
}

export function fillEmptyClaudeRoles(value: ClaudeProviderModel) {
  const next = { ...value }
  const main = value.main?.trim()
  if (!main) return next
  for (const role of ["haiku", "sonnet", "opus", "fable"] as const) {
    if (!next[role]?.trim()) next[role] = main
  }
  return next
}

export function selectCodexProviderModel(
  value: CodexModelConfig,
  slug: string,
  catalog: CodexModelInfo[]
): CodexModelConfig {
  slug = slug.trim()
  if (!slug) return { ...value, default: undefined }
  const existing = value.customs.some((entry) => entry.slug === slug)
  const matching = catalog.find((entry) => entry.slug === slug)
  const fallback = [...catalog].sort(
    (a, b) =>
      Number(a.priority ?? Number.MAX_SAFE_INTEGER) -
      Number(b.priority ?? Number.MAX_SAFE_INTEGER)
  )[0]
  return {
    ...value,
    default: slug,
    excludedOfficials: value.excludedOfficials?.filter((id) => id !== slug),
    customs: existing
      ? value.customs
      : [
          ...value.customs,
          { slug, base: matching?.slug ?? fallback?.slug ?? slug },
        ],
  }
}
