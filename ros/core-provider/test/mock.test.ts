import { describe, expect, test } from "bun:test"
import { createMockProvider, type ChatMessage, type ProviderEvent } from "../src/index"

async function collect(messages: ChatMessage[]) {
  const events: ProviderEvent[] = []
  const provider = createMockProvider("mock")
  for await (const event of provider.stream({ model: "mock", messages, tools: [] })) events.push(event)
  return events
}

describe("createMockProvider", () => {
  test("literature mention calls literature_search with the shortest non-stopword token", async () => {
    const events = await collect([{ role: "user", content: "帮我查文献 低秩 相关" }])
    const call = events.find((e) => e.type === "tool_call")
    expect(call?.type === "tool_call" && call.call.name).toBe("literature_search")
    expect(call?.type === "tool_call" && JSON.parse(call.call.arguments).query).toBe("低秩")
    expect(events.at(-1)).toEqual({ type: "finish", reason: "tool_calls" })
  })

  test("literature tool result is summarized as library hit", async () => {
    const events = await collect([
      { role: "user", content: "查文献：低秩" },
      { role: "assistant", content: "", tool_calls: [{ id: "c1", name: "literature_search", arguments: "{}" }] },
      { role: "tool", content: "文献库命中 1 篇…", tool_call_id: "c1", name: "literature_search" },
    ])
    const text = events.filter((e) => e.type === "text_delta").map((e) => (e.type === "text_delta" ? e.text : "")).join("")
    expect(text).toContain("文献库检索完成")
    expect(events.at(-1)).toEqual({ type: "finish", reason: "stop" })
  })

  test("data question with two named columns runs a test on the newest dataset", async () => {
    const events = await collect([{ role: "user", content: "帮我看看 ddpm 和 ddim 的差异显著吗" }])
    const call = events.find((e) => e.type === "tool_call")
    expect(call?.type === "tool_call" && call.call.name).toBe("data_analyze")
    const args = call?.type === "tool_call" ? JSON.parse(call.call.arguments) : {}
    expect(args).toMatchObject({ action: "test", x: "ddpm", y: "ddim" })
    expect(events.at(-1)).toEqual({ type: "finish", reason: "tool_calls" })
  })

  test("asking for a rank test on paired columns picks wilcoxon", async () => {
    const events = await collect([{ role: "user", content: "用非参数秩检验比较 ddpm 与 ddim" }])
    const call = events.find((e) => e.type === "tool_call")
    const args = call?.type === "tool_call" ? JSON.parse(call.call.arguments) : {}
    expect(args).toMatchObject({ action: "test", x: "ddpm", y: "ddim", method: "wilcoxon" })
  })

  test("independent-group wording picks mann_whitney", async () => {
    const events = await collect([{ role: "user", content: "两组独立样本做 mann-whitney 检验 ddpm vs ddim" }])
    const call = events.find((e) => e.type === "tool_call")
    const args = call?.type === "tool_call" ? JSON.parse(call.call.arguments) : {}
    expect(args).toMatchObject({ action: "test", x: "ddpm", y: "ddim", method: "mann_whitney" })
  })

  test("data question without columns lists datasets first", async () => {
    const events = await collect([{ role: "user", content: "台账里的数据怎么做检验？" }])
    const call = events.find((e) => e.type === "tool_call")
    expect(call?.type === "tool_call" && JSON.parse(call.call.arguments)).toEqual({ action: "list" })
  })

  test("data_analyze result is summarized as analysis output", async () => {
    const events = await collect([
      { role: "user", content: "检验 ddpm 与 ddim" },
      { role: "assistant", content: "", tool_calls: [{ id: "c1", name: "data_analyze", arguments: "{}" }] },
      { role: "tool", content: "fid.csv · 配对 t 检验 ddpm vs ddim\npairs=4 t=3.8730", tool_call_id: "c1", name: "data_analyze" },
    ])
    const text = events.filter((e) => e.type === "text_delta").map((e) => (e.type === "text_delta" ? e.text : "")).join("")
    expect(text).toContain("数据分析完成")
    expect(text).toContain("t=3.8730")
    expect(events.at(-1)).toEqual({ type: "finish", reason: "stop" })
  })

  test("plain file mention still triggers read_file", async () => {
    const events = await collect([{ role: "user", content: "please read notes.md" }])
    const call = events.find((e) => e.type === "tool_call")
    expect(call?.type === "tool_call" && call.call.name).toBe("read_file")
  })
})
