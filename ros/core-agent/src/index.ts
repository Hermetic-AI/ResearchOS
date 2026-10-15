export * as CoreAgent from "./index"

import { relative, resolve } from "path"
import { readFileSync } from "fs"
import { Db, parseToolCalls, type MessageRow } from "@researchos/core-db"
import type { ChatMessage, Provider, StreamRequest, ToolCall, ToolSpec } from "@researchos/core-provider"
import { formatSkillList, type Skill } from "./skills"

export { loadSkills, formatSkillList, validateSkillMarkdown, parseSkill, type Skill, type SkillRoot } from "./skills"

export interface ToolResult {
  ok: boolean
  output: string
}

export interface Tool {
  name: string
  description: string
  parameters: unknown
  readOnly: boolean
  execute(args: Record<string, unknown>): ToolResult
}

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>()

  register(tool: Tool): void {
    this.tools.set(tool.name, tool)
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  specs(): ToolSpec[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }))
  }
}

const MAX_TOOL_OUTPUT = 8000

export function readFileTool(rootDirectory: string): Tool {
  return {
    name: "read_file",
    description: "Read a text file inside the project directory. Returns at most 8000 characters.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Path relative to the project directory" } },
      required: ["path"],
    },
    readOnly: true,
    execute(args) {
      const requested = String(args.path ?? "")
      const absolute = resolve(rootDirectory, requested)
      const inside = relative(rootDirectory, absolute)
      if (inside.startsWith("..") || inside.includes(":"))
        return { ok: false, output: `access denied: ${requested} is outside the project directory` }
      try {
        const text = readFileSync(absolute, "utf8")
        if (text.length <= MAX_TOOL_OUTPUT) return { ok: true, output: text }
        return { ok: true, output: `${text.slice(0, MAX_TOOL_OUTPUT)}\n[truncated ${text.length - MAX_TOOL_OUTPUT} chars]` }
      } catch {
        return { ok: false, output: `cannot read file: ${requested}` }
      }
    },
  }
}

// Agent can pull a skill body on demand when it judges the description relevant.
export function loadSkillTool(skills: Skill[]): Tool {
  return {
    name: "load_skill",
    description: "Load the full instructions of a named skill listed in Available Skills.",
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "Skill name from the Available Skills list" } },
      required: ["name"],
    },
    readOnly: true,
    execute(args) {
      const name = String(args.name ?? "")
      const skill = skills.find((candidate) => candidate.name === name)
      if (skill === undefined) return { ok: false, output: `unknown skill: ${name}` }
      return { ok: true, output: skill.content }
    },
  }
}

// Keyword recall over the project literature library (FTS5, vector semantic still degraded).
export function searchLibraryTool(db: Db, projectId: string): Tool {
  return {
    name: "literature_search",
    description:
      "Search the project's literature library by keyword. Returns matching paper ids, titles, years, abstract snippets, and body-paragraph excerpts (¶ refs) from pasted full text. Call this before answering questions about the user's collected papers.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Keywords to match against paper titles, abstracts, and full-text paragraphs" } },
      required: ["query"],
    },
    readOnly: true,
    execute(args) {
      const query = String(args.query ?? "").trim()
      if (query === "") return { ok: false, output: "query is required" }
      const hits = db.searchPapers(projectId, query, 8)
      const passages = db.searchParagraphs(projectId, query, 5)
      if (hits.length === 0 && passages.length === 0) return { ok: true, output: `文献库中没有匹配「${query}」的论文` }
      const lines = hits.map((paper) => {
        const authors = (JSON.parse(paper.authors || "[]") as string[]).join(", ")
        const meta = [paper.year ?? "n.d.", authors, `被引 ${paper.citation_count}`].filter(Boolean).join(" · ")
        const excerpt = paper.abstract ? `\n     ${paper.abstract.slice(0, 180)}` : ""
        return `[${paper.id}] ${paper.title}（${meta}）${excerpt}`
      })
      const passageLines = passages.map(
        (p) => `¶${p.seq}${p.page != null ? ` p.${p.page}` : ""} [${p.paper_id}] ${p.paper_title}：${p.text.slice(0, 140)}`,
      )
      const header = passages.length > 0 ? "（关键词检索 · 命中正文段落 · 向量语义在建 degraded）" : "（关键词检索 · 向量语义在建 degraded）"
      const body = lines.length > 0 ? `文献库命中 ${lines.length} 篇${header}：\n${lines.join("\n")}` : `标题/摘要未命中，${passages.length} 段正文命中${header}：`
      const passageBlock = passages.length > 0 ? `\n正文命中：\n${passageLines.join("\n")}` : ""
      return { ok: true, output: `${body}${passageBlock}` }
    },
  }
}

export type AgentEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "tool_result"; call: ToolCall; result: ToolResult }
  | { type: "skill_load"; name: string; tokens: number }
  | { type: "finish"; reason: "stop" | "max_steps" }

export interface RunInput {
  db: Db
  threadId: string
  provider: Provider
  model: string
  user: string
  tools: ToolRegistry
  system?: string
  skills?: Skill[]
  injectSkill?: string
  maxSteps?: number
  signal?: AbortSignal
  confirm?: (call: ToolCall) => boolean
}

export async function* runThread(input: RunInput): AsyncGenerator<AgentEvent> {
  const maxSteps = input.maxSteps ?? 8
  input.db.appendMessage(input.threadId, { role: "user", content: input.user })

  const thread = input.db.getThread(input.threadId)
  if (thread)
    input.db.appendTrace({
      projectId: thread.project_id,
      threadId: thread.id,
      kind: "chat",
      summary: input.user.slice(0, 60),
    })

  // Progressive disclosure: the skill body is injected into this run's system prompt only
  // (system is rebuilt per step and never persisted), so the next turn drops it unless re-triggered.
  const injected = input.injectSkill
    ? (input.skills ?? []).find((skill) => skill.name === input.injectSkill)
    : undefined
  if (injected) {
    const tokens = Math.ceil(injected.content.length / 4)
    yield { type: "skill_load", name: injected.name, tokens }
    if (thread)
      input.db.appendTrace({
        projectId: thread.project_id,
        threadId: thread.id,
        kind: "skill_load",
        subjectRef: injected.name,
        summary: `Injected skill "${injected.name}" (${tokens} tok)`,
        payload: { tokens, location: injected.location },
      })
  }

  for (let step = 0; step < maxSteps; step++) {
    const request = buildRequest(input, injected)
    let text = ""
    const calls: ToolCall[] = []
    let finishReason: "stop" | "tool_calls" = "stop"

    for await (const event of input.provider.stream(request, input.signal)) {
      if (event.type === "text_delta") {
        text += event.text
        yield event
      } else if (event.type === "tool_call") {
        calls.push(event.call)
        yield event
      } else {
        finishReason = event.reason
      }
    }

    input.db.appendMessage(input.threadId, {
      role: "assistant",
      content: text === "" ? null : text,
      toolCalls: calls.length > 0 ? calls : null,
    })

    if (finishReason === "stop" || calls.length === 0) {
      yield { type: "finish", reason: "stop" }
      return
    }

    for (const call of calls) {
      const result = executeTool(input, call)
      yield { type: "tool_result", call, result }
      input.db.appendMessage(input.threadId, {
        role: "tool",
        content: result.output,
        toolCallId: call.id,
        name: call.name,
      })
    }
  }

  yield { type: "finish", reason: "max_steps" }
}

function executeTool(input: RunInput, call: ToolCall): ToolResult {
  const tool = input.tools.get(call.name)
  if (tool === undefined) return { ok: false, output: `unknown tool: ${call.name}` }
  if (!tool.readOnly) {
    const allowed = input.confirm?.(call) ?? false
    if (!allowed) return { ok: false, output: `approval denied for write tool: ${call.name}` }
  }
  let args: Record<string, unknown>
  try {
    args = JSON.parse(call.arguments) as Record<string, unknown>
  } catch {
    return { ok: false, output: `invalid tool arguments: ${call.arguments}` }
  }
  return tool.execute(args)
}

function buildRequest(input: RunInput, injected?: Skill): StreamRequest {
  const history = toChatMessages(input.db.listMessages(input.threadId))
  const system = composeSystem(input, injected)
  const messages: ChatMessage[] =
    system === undefined || history.some((m) => m.role === "system")
      ? history
      : [{ role: "system", content: system }, ...history]
  return { model: input.model, messages, tools: input.tools.specs() }
}

function composeSystem(input: RunInput, injected?: Skill): string | undefined {
  const parts: string[] = []
  if (input.system !== undefined) parts.push(input.system)
  const list = input.skills && input.skills.length > 0 ? formatSkillList(input.skills) : ""
  if (list !== "") parts.push(list)
  if (injected) parts.push(`## Active Skill: ${injected.name}\n${injected.content}`)
  return parts.length === 0 ? undefined : parts.join("\n\n")
}

function toChatMessages(rows: MessageRow[]): ChatMessage[] {
  return rows.map((row) => {
    // Some OpenAI-compatible providers (Kimi/Moonshot) reject null content on assistant
    // tool-call turns with "tokenization failed"; send "" at the boundary while the DB keeps null.
    if (row.role === "assistant") {
      const toolCalls = parseToolCalls(row)
      return {
        role: "assistant",
        content: row.content ?? "",
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      }
    }
    if (row.role === "tool")
      return { role: "tool", content: row.content ?? "", tool_call_id: row.tool_call_id ?? "", name: row.name ?? undefined }
    return { role: row.role, content: row.content }
  })
}

export const projectSystemPrompt = (directory: string) =>
  `You are the ResearchOS assistant. The project directory is ${directory}. ` +
  "Use the read_file tool to inspect files before answering questions about them. " +
  "When a question concerns the user's collected literature, call literature_search first and cite the returned paper ids."
