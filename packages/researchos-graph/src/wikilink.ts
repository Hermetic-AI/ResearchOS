import { fromMarkdown } from "mdast-util-from-markdown"
import type { Root, RootContent } from "mdast"
import type { GraphEdge, GraphNode } from "./types"

export type CiteKeyResolver = (key: string) => { nodeId: string; refId: string; label: string } | undefined

export interface ParseInput {
  path: string
  content: string
  citeKeyToPaperId?: CiteKeyResolver
  existingNode?: (id: string) => GraphNode | null
}

export interface ParsedFile {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

const WIKILINK = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g
const LATEX_CITE = /\\cite\{([^}]+)\}/g
const DOI = /^10\.\d{4,9}\/\S+$/

export function parseFile(input: ParseInput): ParsedFile {
  if (/\.(tex|latex)$/i.test(input.path)) return parseLatex(input)
  return parseMarkdown(input)
}

function parseMarkdown(input: ParseInput): ParsedFile {
  const frontmatter = parseFrontmatter(input.content)
  const self: GraphNode = frontmatter.doi
    ? {
      id: `paper:${slug(frontmatter.doi)}`,
      type: "paper",
      label: frontmatter.title ?? frontmatter.doi,
      refId: null,
      sourcePath: input.path,
      attrs: { doi: frontmatter.doi },
      x: null,
      y: null,
    }
    : {
      id: `note:${input.path}`,
      type: "note",
      label: frontmatter.title ?? input.path,
      refId: null,
      sourcePath: input.path,
      attrs: {},
      x: null,
      y: null,
    }

  const nodes = new Map<string, GraphNode>([[self.id, self]])
  const edges = new Map<string, GraphEdge>()
  blocks(fromMarkdown(input.content)).forEach((block) => {
    Array.from(block.matchAll(WIKILINK), (match) => ({ target: match[1]?.trim() ?? "", block })).forEach(({ target, block }) => {
      if (!target) return
      const resolved = resolveTarget(target, input)
      nodes.set(resolved.id, resolved)
      // 任何指向 paper 目标的链接都记 cites（笔记引用文献即引用关系），其余目标记 mentions
      const relation = resolved.type === "paper" ? "cites" : "mentions"
      edges.set(`${self.id}${resolved.id}${relation}`, {
        from: self.id,
        to: resolved.id,
        relation,
        context: block.replace(/\s+/g, " ").trim().slice(0, 200),
        sourcePath: input.path,
      })
    })
  })
  return { nodes: Array.from(nodes.values()), edges: Array.from(edges.values()) }
}

function parseLatex(input: ParseInput): ParsedFile {
  const self: GraphNode = {
    id: `note:${input.path}`,
    type: "note",
    label: input.path,
    refId: null,
    sourcePath: input.path,
    attrs: {},
    x: null,
    y: null,
  }
  const nodes = new Map<string, GraphNode>([[self.id, self]])
  const edges: GraphEdge[] = []
  Array.from(input.content.matchAll(LATEX_CITE)).forEach((match) => {
    ;(match[1] ?? "").split(",").map((key) => key.trim()).filter(Boolean).forEach((key) => {
      const resolved = input.citeKeyToPaperId?.(key)
      // 未解析的 bibkey 不建节点，避免伪造文献条目
      if (!resolved) return
      nodes.set(resolved.nodeId, {
        id: resolved.nodeId,
        type: "paper",
        label: resolved.label,
        refId: resolved.refId,
        sourcePath: null,
        attrs: {},
        x: null,
        y: null,
      })
      edges.push({ from: self.id, to: resolved.nodeId, relation: "cites", context: null, sourcePath: input.path })
    })
  })
  return { nodes: Array.from(nodes.values()), edges }
}

// 目标解析顺序：bibkey/DOI 命中 → paper:；已有 concept → concept:；已有 note 路径 → note:；否则新建 concept:<slug>
function resolveTarget(target: string, input: ParseInput): GraphNode {
  const viaCiteKey = input.citeKeyToPaperId?.(target)
  if (viaCiteKey) {
    return { id: viaCiteKey.nodeId, type: "paper", label: viaCiteKey.label, refId: viaCiteKey.refId, sourcePath: null, attrs: {}, x: null, y: null }
  }
  if (DOI.test(target)) {
    return { id: `paper:${slug(target)}`, type: "paper", label: target, refId: null, sourcePath: null, attrs: { doi: target }, x: null, y: null }
  }
  const base: Omit<GraphNode, "id" | "type"> = { label: target, refId: null, sourcePath: null, attrs: {}, x: null, y: null }
  const concept = input.existingNode?.(`concept:${slug(target)}`)
  if (concept) return concept
  const note = input.existingNode?.(`note:${target}`)
  if (note) return note
  return { ...base, id: `concept:${slug(target)}`, type: "concept" }
}

function parseFrontmatter(content: string): { title?: string; doi?: string } {
  const match = /^---\n([\s\S]*?)\n---/.exec(content)
  const body = match?.[1]
  if (!body) {
    const title = /^#\s+(.+?)\s*$/m.exec(content)?.[1]
    return title ? { title } : {}
  }
  const field = (name: string) => new RegExp(`^${name}:\\s*(.+?)\\s*$`, "m").exec(body)?.[1]
  const title = field("title") ?? /^#\s+(.+?)\s*$/m.exec(content)?.[1]
  const doi = field("doi")
  return {
    ...(title ? { title } : {}),
    ...(doi ? { doi } : {}),
  }
}

function blocks(root: Root): string[] {
  const out: string[] = []
  const walk = (node: Root | RootContent): void => {
    if (node.type === "paragraph" || node.type === "heading") {
      out.push(textOf(node))
      return
    }
    ;("children" in node ? node.children : []).forEach((child) => walk(child))
  }
  walk(root)
  return out
}

function textOf(node: Root | RootContent): string {
  if ("value" in node && typeof node.value === "string") return node.value
  return ("children" in node ? node.children : []).map((child) => textOf(child)).join(" ")
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "")
}
