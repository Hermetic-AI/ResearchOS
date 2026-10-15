import { describe, expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { Db } from "@researchos/core-db"
import { createMockProvider, type ChatMessage, type ProviderEvent } from "@researchos/core-provider"
import { CoreAgent } from "../src/index"

function tempDb() {
  return Db.open(join(mkdtempSync(join(tmpdir(), "ros-agent-")), "test.db"))
}

function tempProjectFile(name: string, contents: string) {
  const dir = mkdtempSync(join(tmpdir(), "ros-proj-"))
  writeFileSync(join(dir, name), contents)
  return dir
}

async function collect(gen: AsyncGenerator<CoreAgent.AgentEvent>) {
  const events: CoreAgent.AgentEvent[] = []
  for await (const event of gen) events.push(event)
  return events
}

describe("runThread with mock provider", () => {
  test("multi-turn tool loop persists provider-shaped history", async () => {
    const directory = tempProjectFile("notes.md", "# Notes\nhello researchos")
    const db = tempDb()
    const project = db.createProject("p", directory)
    const thread = db.createThread(project.id)
    const tools = new CoreAgent.ToolRegistry()
    tools.register(CoreAgent.readFileTool(directory))

    const events = await collect(
      CoreAgent.runThread({
        db,
        threadId: thread.id,
        provider: createMockProvider("mock"),
        model: "mock",
        user: "please read notes.md",
        tools,
        system: "You are helpful.",
      }),
    )

    expect(events.some((e) => e.type === "text_delta")).toBe(true)
    expect(events.some((e) => e.type === "tool_call" && e.call.name === "read_file")).toBe(true)
    expect(events.some((e) => e.type === "tool_result" && e.result.ok)).toBe(true)
    expect(events.at(-1)).toEqual({ type: "finish", reason: "stop" })

    const rows = db.listMessages(thread.id)
    expect(rows.map((r) => r.role)).toEqual(["user", "assistant", "tool", "assistant"])
    expect(rows[1]?.tool_calls).not.toBeNull()
    expect(rows[2]?.tool_call_id).not.toBeNull()
    expect(rows[2]?.content).toContain("hello researchos")

    // each user turn writes a chat trace event for the provenance timeline
    const chatTrace = db.listTrace(project.id).filter((t) => t.kind === "chat")
    expect(chatTrace.some((t) => t.summary.includes("read notes.md"))).toBe(true)
    db.close()
  })

  test("restart resume: reopened db replays history for the next turn", async () => {
    const directory = tempProjectFile("a.txt", "alpha")
    const path = join(mkdtempSync(join(tmpdir(), "ros-resume-")), "test.db")
    const db = Db.open(path)
    const project = db.createProject("p", directory)
    const thread = db.createThread(project.id)
    const tools = new CoreAgent.ToolRegistry()
    tools.register(CoreAgent.readFileTool(directory))
    const provider = createMockProvider("mock")

    await collect(CoreAgent.runThread({ db, threadId: thread.id, provider, model: "mock", user: "read a.txt", tools }))
    const before = db.listMessages(thread.id).length
    db.close()

    const reopened = Db.open(path)
    await collect(
      CoreAgent.runThread({ db: reopened, threadId: thread.id, provider, model: "mock", user: "read a.txt again", tools }),
    )
    const after = reopened.listMessages(thread.id)
    expect(after.length).toBeGreaterThan(before)
    expect(after[0]?.role).toBe("user")
    reopened.close()
  })

  test("read_file refuses paths outside the project directory", () => {
    const directory = tempProjectFile("safe.txt", "safe")
    const tool = CoreAgent.readFileTool(directory)
    expect(tool.execute({ path: "../outside.txt" }).ok).toBe(false)
    expect(tool.execute({ path: "safe.txt" }).ok).toBe(true)
  })

  test("write tools are denied without a confirm callback", async () => {
    const db = tempDb()
    const project = db.createProject("p", process.cwd())
    const thread = db.createThread(project.id)
    const tools = new CoreAgent.ToolRegistry()
    tools.register({
      name: "write_file",
      description: "write",
      parameters: {},
      readOnly: false,
      execute: () => ({ ok: true, output: "written" }),
    })

    // Emits a write_file call on the first turn; once a tool result exists, stops.
    const scripted = {
      name: "scripted",
      async *stream(request: { messages: ChatMessage[] }): AsyncGenerator<ProviderEvent> {
        if (request.messages.some((m) => m.role === "tool")) {
          yield { type: "text_delta", text: "understood" }
          yield { type: "finish", reason: "stop" }
          return
        }
        yield { type: "tool_call", call: { id: "c1", name: "write_file", arguments: "{}" } }
        yield { type: "finish", reason: "tool_calls" }
      },
    }

    const events = await collect(
      CoreAgent.runThread({ db, threadId: thread.id, provider: scripted, model: "mock", user: "write it", tools }),
    )
    const denied = events.find((e) => e.type === "tool_result")
    expect(denied?.type === "tool_result" && denied.result.ok).toBe(false)
    expect(events.at(-1)).toEqual({ type: "finish", reason: "stop" })
    db.close()
  })
})

describe("literature_search tool", () => {
  test("scripted provider calls the tool and the loop feeds library hits back", async () => {
    const db = tempDb()
    const project = db.createProject("p", process.cwd())
    const thread = db.createThread(project.id)
    db.addPaper(project.id, { title: "Attention Is All You Need", year: 2017, citationCount: 90000, abstract: "Transformer architecture" })

    const tools = new CoreAgent.ToolRegistry()
    tools.register(CoreAgent.searchLibraryTool(db, project.id))

    // Emits a literature_search call on turn 1; once a tool result exists, stops.
    const scripted = {
      name: "scripted",
      async *stream(request: { messages: ChatMessage[] }): AsyncGenerator<ProviderEvent> {
        if (request.messages.some((m) => m.role === "tool")) {
          yield { type: "text_delta", text: "found it" }
          yield { type: "finish", reason: "stop" }
          return
        }
        yield { type: "tool_call", call: { id: "c1", name: "literature_search", arguments: JSON.stringify({ query: "Attention" }) } }
        yield { type: "finish", reason: "tool_calls" }
      },
    }

    const events = await collect(
      CoreAgent.runThread({ db, threadId: thread.id, provider: scripted, model: "mock", user: "any transformer paper?", tools }),
    )
    const call = events.find((e) => e.type === "tool_call" && e.call.name === "literature_search")
    expect(call).toBeDefined()
    const result = events.find((e) => e.type === "tool_result" && e.call.name === "literature_search")
    expect(result?.type === "tool_result" && result.result.ok).toBe(true)
    expect(result?.type === "tool_result" && result.result.output).toContain("Attention Is All You Need")
    expect(events.at(-1)).toEqual({ type: "finish", reason: "stop" })
    db.close()
  })

  test("tool returns not-ok on empty query and a friendly miss on no hits", () => {
    const db = tempDb()
    const project = db.createProject("p", process.cwd())
    const tool = CoreAgent.searchLibraryTool(db, project.id)
    expect(tool.execute({ query: "  " }).ok).toBe(false)
    const miss = tool.execute({ query: "quantum" })
    expect(miss.ok).toBe(true)
    expect(miss.output).toContain("没有匹配")
    db.close()
  })

  test("reports ¶-anchored body passages when title/abstract miss", () => {
    const db = tempDb()
    const project = db.createProject("p", process.cwd())
    const paper = db.addPaper(project.id, { title: "Pasted Paper" })
    db.addParagraphs(paper.id, [{ text: "intro" }, { page: 2, text: "the kernel trick approximates attention" }])
    const tool = CoreAgent.searchLibraryTool(db, project.id)
    const hit = tool.execute({ query: "kernel" })
    expect(hit.ok).toBe(true)
    expect(hit.output).toContain("正文命中")
    expect(hit.output).toContain(`¶2 p.2 [${paper.id}]`)
    db.close()
  })
})

describe("skill injection", () => {
  test("injects body into provider system prompt only, never into persisted history", async () => {
    const db = tempDb()
    const project = db.createProject("p", process.cwd())
    const thread = db.createThread(project.id)
    const tools = new CoreAgent.ToolRegistry()
    const skills = [
      { name: "paper-reading", description: "Structured reading.", content: "EXTRACTION_BODY_MARKER", location: "l", scope: "project" as const },
    ]

    let systemSeen = ""
    const spy = {
      name: "spy",
      async *stream(request: { messages: ChatMessage[] }): AsyncGenerator<ProviderEvent> {
        systemSeen = request.messages.find((m) => m.role === "system")?.content ?? ""
        yield { type: "text_delta", text: "ok" }
        yield { type: "finish", reason: "stop" }
      },
    }

    const events = await collect(
      CoreAgent.runThread({
        db,
        threadId: thread.id,
        provider: spy,
        model: "mock",
        user: "read this paper",
        tools,
        skills,
        injectSkill: "paper-reading",
      }),
    )

    expect(events.some((e) => e.type === "skill_load" && e.name === "paper-reading")).toBe(true)
    expect(systemSeen).toContain("EXTRACTION_BODY_MARKER")
    expect(systemSeen).toContain("paper-reading: Structured reading.")

    // The skill body must not leak into stored messages, so the next turn won't repeat it.
    const persisted = db.listMessages(thread.id).map((r) => r.content ?? "").join("\n")
    expect(persisted).not.toContain("EXTRACTION_BODY_MARKER")

    const trace = db.listTrace(project.id)
    expect(trace.some((t) => t.kind === "skill_load" && t.subject_ref === "paper-reading")).toBe(true)
    db.close()
  })
})
