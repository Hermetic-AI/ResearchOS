import { describe, expect, test } from "bun:test"
import { createOpenAIProvider, type ProviderEvent, type StreamRequest } from "../src/index"

function sseResponse(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      for (const chunk of chunks) controller.enqueue(encoder.encode(`data: ${chunk}\n\n`))
      controller.enqueue(encoder.encode("data: [DONE]\n\n"))
      controller.close()
    },
  })
  return new Response(body, { status: 200 })
}

async function collect(provider: ReturnType<typeof createOpenAIProvider>, request: StreamRequest) {
  const events: ProviderEvent[] = []
  for await (const event of provider.stream(request)) events.push(event)
  return events
}

const request: StreamRequest = { model: "gpt-test", messages: [{ role: "user", content: "hi" }], tools: [] }

describe("createOpenAIProvider SSE parsing", () => {
  test("streams text deltas and stops at [DONE]", async () => {
    const provider = createOpenAIProvider("t", { kind: "openai", baseUrl: "http://x/v1", apiKey: "k", model: "m" }, async () =>
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "Hel" }, finish_reason: null }] }),
        JSON.stringify({ choices: [{ delta: { content: "lo" }, finish_reason: null }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }),
      ]),
    )
    const events = await collect(provider, request)
    expect(events).toEqual([
      { type: "text_delta", text: "Hel" },
      { type: "text_delta", text: "lo" },
      { type: "finish", reason: "stop" },
    ])
  })

  test("aggregates fragmented tool_calls by index", async () => {
    const provider = createOpenAIProvider("t", { kind: "openai", baseUrl: "http://x", apiKey: "", model: "m" }, async () =>
      sseResponse([
        JSON.stringify({
          choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "read_", arguments: "{\"pa" } }] }, finish_reason: null }] }),
        JSON.stringify({
          choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "file", arguments: "th\":\"a.txt\"}" } }] }, finish_reason: null }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
      ]),
    )
    const events = await collect(provider, request)
    expect(events).toEqual([
      { type: "tool_call", call: { id: "call_1", name: "read_file", arguments: '{"path":"a.txt"}' } },
      { type: "finish", reason: "tool_calls" },
    ])
  })

  test("sends auth header and omits empty tools array", async () => {
    let captured: RequestInit | undefined
    const provider = createOpenAIProvider(
      "t",
      { kind: "openai", baseUrl: "http://x/v1/", apiKey: "sk-1", model: "m" },
      async (_url, init) => {
        captured = init
        return sseResponse([JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })])
      },
    )
    await collect(provider, request)
    const headers = captured?.headers as Record<string, string>
    expect(headers.authorization).toBe("Bearer sk-1")
    const body = JSON.parse(String(captured?.body))
    expect(body.tools).toBeUndefined()
    expect(body.stream).toBe(true)
  })

  test("throws on non-2xx response", async () => {
    const provider = createOpenAIProvider("t", { kind: "openai", baseUrl: "http://x", apiKey: "", model: "m" }, async () =>
      new Response("nope", { status: 500 }),
    )
    let message = ""
    try {
      await collect(provider, request)
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toContain("provider t responded 500")
  })
})
