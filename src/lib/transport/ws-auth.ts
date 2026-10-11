export const HARNESS_STUDIO_WS_PROTOCOL = "harness-studio-events"
const HARNESS_STUDIO_WS_TOKEN_PROTOCOL_PREFIX = "harness-studio-token."

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

export function buildHarnessStudioWebSocketProtocols(token: string): string[] {
  const trimmed = token.trim()
  if (!trimmed) return [HARNESS_STUDIO_WS_PROTOCOL]
  return [
    HARNESS_STUDIO_WS_PROTOCOL,
    `${HARNESS_STUDIO_WS_TOKEN_PROTOCOL_PREFIX}${base64UrlEncode(trimmed)}`,
  ]
}
