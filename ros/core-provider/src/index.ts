export * as CoreProvider from "./index"

import type { ProviderConfig } from "@researchos/core-config"

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
}

export interface ToolCall {
  id: string
  name: string
  arguments: string
}

export interface ToolSpec {
  name: string
  description: string
  parameters: unknown
}

export type ProviderEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "finish"; reason: "stop" | "tool_calls" }

export interface StreamRequest {
  model: string
  messages: ChatMessage[]
  tools: ToolSpec[]
  temperature?: number
}

export interface Provider {
  readonly name: string
  stream(request: StreamRequest, signal?: AbortSignal): AsyncGenerator<ProviderEvent>
}

// Loose fetch shape so tests can inject fakes without Bun's static `preconnect` member.
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export function createProvider(name: string, config: ProviderConfig, fetchImpl?: FetchLike): Provider {
  if (config.kind === "mock") return createMockProvider(name)
  return createOpenAIProvider(name, config, fetchImpl)
}

export function createOpenAIProvider(
  name: string,
  config: Extract<ProviderConfig, { kind: "openai" }>,
  fetchImpl: FetchLike = fetch,
): Provider {
  const baseUrl = config.baseUrl.replace(/\/+$/, "")
  return {
    name,
    async *stream(request, signal) {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: request.model,
          messages: serializeMessages(request.messages),
          tools: request.tools.length > 0 ? request.tools.map((tool) => ({ type: "function", function: tool })) : undefined,
          temperature: request.temperature,
          stream: true,
        }),
        signal,
      })
      if (!response.ok || response.body === null) {
        const detail = await response.text().catch(() => "")
        throw new Error(`provider ${name} responded ${response.status}: ${detail.slice(0, 500)}`)
      }

      const calls = new Map<number, { id: string; name: string; arguments: string }>()
      for await (const data of sseLines(response.body)) {
        if (data === "[DONE]") break
        const parsed = parseChunk(data)
        if (parsed === undefined) continue
        const delta = parsed.choices?.[0]?.delta
        const finish = parsed.choices?.[0]?.finish_reason
        if (delta?.content !== undefined && delta.content !== "")
          yield { type: "text_delta", text: delta.content }
        if (delta?.tool_calls !== undefined) accumulateCalls(calls, delta.tool_calls)
        if (finish !== undefined && finish !== null) {
          for (const call of calls.values())
            yield { type: "tool_call", call: { id: call.id, name: call.name, arguments: call.arguments } }
          yield { type: "finish", reason: calls.size > 0 ? "tool_calls" : "stop" }
          return
        }
      }
      for (const call of calls.values())
        yield { type: "tool_call", call: { id: call.id, name: call.name, arguments: call.arguments } }
      yield { type: "finish", reason: calls.size > 0 ? "tool_calls" : "stop" }
    },
  }
}

// Internal ChatMessage keeps tool_calls flat; the wire format nests them under `function`.
function serializeMessages(messages: ChatMessage[]) {
  return messages.map((message) => {
    if (message.role !== "assistant" || message.tool_calls === undefined) return message
    return {
      role: "assistant",
      content: message.content ?? "",
      tool_calls: message.tool_calls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
      })),
    }
  })
}

interface ToolCallFragment {
  index?: number
  id?: string
  function?: { name?: string; arguments?: string }
}

interface ChatCompletionChunk {
  choices?: Array<{ delta?: { content?: string; tool_calls?: ToolCallFragment[] }; finish_reason?: string | null }>
}

function parseChunk(data: string): ChatCompletionChunk | undefined {
  try {
    return JSON.parse(data) as ChatCompletionChunk
  } catch {
    return undefined
  }
}

function accumulateCalls(calls: Map<number, { id: string; name: string; arguments: string }>, fragments: ToolCallFragment[]) {
  for (const fragment of fragments) {
    const index = fragment.index ?? 0
    const existing = calls.get(index) ?? { id: "", name: "", arguments: "" }
    if (fragment.id !== undefined) existing.id = fragment.id
    if (fragment.function?.name !== undefined) existing.name += fragment.function.name
    if (fragment.function?.arguments !== undefined) existing.arguments += fragment.function.arguments
    calls.set(index, existing)
  }
}

async function* sseLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done === true) break
      buffer += decoder.decode(chunk.value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith("data:")) yield trimmed.slice(5).trim()
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// Deterministic stand-in used until the user configures an OpenAI-compatible key:
// literature-mentioning turns ask for library search, other first turns extract a path and ask to read it,
// second turn summarizes the tool result.
export function createMockProvider(name: string): Provider {
  return {
    name,
    async *stream(request) {
      const toolResults = request.messages.filter((message) => message.role === "tool")
      if (toolResults.length > 0) {
        const combined = toolResults.map((message) => message.content ?? "").join("\n---\n")
        if (toolResults.some((message) => message.name === "literature_search")) {
          yield* emitText(`文献库检索完成，命中摘录：\n\n${snippet(combined)}`)
        } else if (toolResults.some((message) => message.name === "data_analyze")) {
          yield* emitText(`数据分析完成，结果如下：\n\n${snippet(combined)}`)
        } else {
          yield* emitText(`I read the file. It contains ${combined.length} characters of content. Summary:\n\n${snippet(combined)}`)
        }
        yield { type: "finish", reason: "stop" }
        return
      }
      const lastUser = [...request.messages].reverse().find((message) => message.role === "user")
      const content = lastUser?.content ?? ""
      if (/文献|论文|literature/i.test(content)) {
        const stop = new Set(["文献", "论文", "检索", "查询", "搜索", "哪些", "有没有", "literature", "library"])
        const query =
          (content.match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => !stop.has(token.toLowerCase())).sort((a, b) => a.length - b.length)[0] ??
          content
        yield* emitText(`先在文献库检索「${query}」。`)
        yield {
          type: "tool_call",
          call: { id: `mock_call_${Math.random().toString(36).slice(2, 10)}`, name: "literature_search", arguments: JSON.stringify({ query }) },
        }
        yield { type: "finish", reason: "tool_calls" }
        return
      }
      const pair = content.match(/([\w\u4e00-\u9fa5]+)\s*(?:vs\.?|对比|与|和)\s*([\w\u4e00-\u9fa5]+)/i)
      if (/数据|数据集|检验|显著|analyze|dataset/i.test(content)) {
        if (pair?.[1] !== undefined && pair[2] !== undefined) {
          // Naming a rank test in the message is the analyst's shortcut for skipping the t-test.
          const method = /非参数|秩|wilcoxon|mann[\s-]?whitney|不满足正态/i.test(content)
            ? /两组|独立|组间|between/i.test(content)
              ? "mann_whitney"
              : "wilcoxon"
            : undefined
          yield* emitText(`直接用台账里最新的数据集检验 ${pair[1]} 与 ${pair[2]}${method === undefined ? "。" : `（${method}）。`}`)
          yield {
            type: "tool_call",
            call: {
              id: `mock_call_${Math.random().toString(36).slice(2, 10)}`,
              name: "data_analyze",
              arguments: JSON.stringify({ action: "test", x: pair[1], y: pair[2], ...(method === undefined ? {} : { method }) }),
            },
          }
        } else {
          yield* emitText("先列出台账里的数据集，确认要用哪一份。")
          yield {
            type: "tool_call",
            call: { id: `mock_call_${Math.random().toString(36).slice(2, 10)}`, name: "data_analyze", arguments: JSON.stringify({ action: "list" }) },
          }
        }
        yield { type: "finish", reason: "tool_calls" }
        return
      }
      const path = content.match(/[\w./-]+\.[\w]+/)?.[0] ?? "README.md"
      yield* emitText(`Let me open ${path} for you.`)
      yield {
        type: "tool_call",
        call: { id: `mock_call_${Math.random().toString(36).slice(2, 10)}`, name: "read_file", arguments: JSON.stringify({ path }) },
      }
      yield { type: "finish", reason: "tool_calls" }
    },
  }
}

function snippet(text: string) {
  const lines = text.split("\n").slice(0, 20)
  return lines.join("\n")
}

async function* emitText(text: string): AsyncGenerator<ProviderEvent> {
  for (const part of text.match(/.{1,24}/gs) ?? []) yield { type: "text_delta", text: part }
}
