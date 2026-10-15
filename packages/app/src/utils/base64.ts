import { base64Decode } from "@opencode-ai/core/util/encode"

export function decode64(value: string | undefined) {
  if (value === undefined) return
  try {
    const decoded = base64Decode(value)
    // atob accepts any base64-alphabet string (e.g. the literal route segment
    // "server"), so a non-slug input yields mojibake instead of throwing.
    // Treat U+FFFD replacement chars as a failed decode.
    if (decoded.includes("\uFFFD")) return
    return decoded
  } catch {
    return
  }
}
