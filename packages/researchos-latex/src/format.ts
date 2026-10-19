import { existsSync, readFileSync } from "fs"
import { dirname, resolve, sep } from "path"
import { extractCiteKeys, parseBibtex } from "./bibtex"
import type { BibtexEntry, FormatIssue } from "./types"

export interface FormatCheckInput {
  projectRoot: string
  mainFile: string
  template?: "ieee" | "acm"
}

interface TexFile {
  path: string
  content: string
}

interface BibFile {
  path: string
  content: string
  entries: BibtexEntry[]
}

interface Project {
  tex: TexFile[]
  bib: BibFile[]
}

export function formatCheck(input: FormatCheckInput): { issues: FormatIssue[] } {
  const project = loadProject(input)
  const rules = [
    missingCiteKey,
    unusedBibEntry,
    unbalancedBraces,
    figureWithoutCaption,
    figureWithoutLabel,
    undefinedRef,
    ...(input.template === "ieee" ? [ieeeAbstractLength, ieeeSectionTitleCase, ieeePagestyle] : []),
    ...(input.template === "acm" ? [acmConference, acmAuthorAffiliation] : []),
  ]
  return { issues: rules.flatMap((rule) => rule(project)) }
}

function loadProject(input: FormatCheckInput): Project {
  const root = resolve(input.projectRoot)
  const main = resolve(root, input.mainFile)
  // 安全白名单：所有读取必须位于项目根内
  if (!main.startsWith(root + sep)) throw new Error(`main_file escapes project root: ${input.mainFile}`)
  if (!existsSync(main)) throw new Error(`main_file not found: ${input.mainFile}`)

  const tex: TexFile[] = []
  const visited = new Set<string>()
  const visit = (path: string): void => {
    if (visited.has(path) || !existsSync(path)) return
    visited.add(path)
    const content = readFileSync(path, "utf8")
    tex.push({ path, content })
    Array.from(content.matchAll(/\\(?:input|include)\{([^}]+)\}/g)).forEach((match) => {
      const name = match[1] ?? ""
      const child = resolve(dirname(path), name.endsWith(".tex") ? name : `${name}.tex`)
      if (child.startsWith(root + sep)) visit(child)
    })
  }
  visit(main)

  const bibNames = tex.flatMap((file) => [
    ...Array.from(file.content.matchAll(/\\bibliography\{([^}]+)\}/g)).flatMap((match) =>
      (match[1] ?? "").split(",").map((name) => ({ dir: dirname(file.path), name: name.trim() })),
    ),
    ...Array.from(file.content.matchAll(/\\addbibresource(?:\[[^\]]*\])?\{([^}]+)\}/g)).map((match) => ({
      dir: dirname(file.path),
      name: (match[1] ?? "").trim(),
    })),
  ])
  const bib = bibNames.flatMap(({ dir, name }) => {
    const path = resolve(dir, name.endsWith(".bib") ? name : `${name}.bib`)
    if (!path.startsWith(root + sep) || !existsSync(path) || visited.has(path)) return []
    visited.add(path)
    const content = readFileSync(path, "utf8")
    return [{ path, content, entries: parseBibtex(content) }]
  })
  return { tex, bib }
}

const LABEL_DEF = /\\label\{([^}]+)\}/g
const REF_USE = /\\(?:ref|eqref|pageref|autoref)\{([^}]+)\}/g

function missingCiteKey(project: Project): FormatIssue[] {
  const bibKeys = new Set(project.bib.flatMap((file) => file.entries.map((entry) => entry.key)))
  return project.tex.flatMap((file) =>
    file.content.split("\n").flatMap((line, index) => {
      const keys = extractCiteKeys(line)
      return keys
        .filter((key) => !bibKeys.has(key))
        .map((key) => issue(file.path, index + 1, "missing-cite-key", "error", `Citation key '${key}' is not defined in any .bib file`))
    }),
  )
}

function unusedBibEntry(project: Project): FormatIssue[] {
  const cited = new Set(project.tex.flatMap((file) => extractCiteKeys(file.content)))
  return project.bib.flatMap((file) =>
    file.entries
      .filter((entry) => !cited.has(entry.key))
      .map((entry) => {
        const line = file.content.split("\n").findIndex((line) => line.includes(`{${entry.key},`))
        return issue(file.path, line + 1 || 1, "unused-bib-entry", "info", `BibTeX entry '${entry.key}' is never cited`)
      }),
  )
}

function unbalancedBraces(project: Project): FormatIssue[] {
  return project.tex.flatMap((file) => {
    let depth = 0
    const found = file.content.split("\n").flatMap((line, index) => {
      const stripped = line.replace(/\\[{}]/g, "").replace(/(?<!\\)%.*$/, "")
      Array.from(stripped).forEach((char) => {
        if (char === "{") depth += 1
        if (char === "}") depth -= 1
      })
      return depth < 0 ? [index + 1] : []
    })
    if (found[0]) return [issue(file.path, found[0], "unbalanced-braces", "error", "Unbalanced braces (extra closing brace)")]
    if (depth > 0) return [issue(file.path, file.content.split("\n").length, "unbalanced-braces", "error", `Unbalanced braces (${depth} unclosed)`)]
    return []
  })
}

function figureBlocks(file: TexFile): Array<{ start: number; end: number; body: string }> {
  const blocks: Array<{ start: number; end: number; body: string }> = []
  let start = -1
  file.content.split("\n").forEach((line, index) => {
    if (/\\begin\{figure\}/.test(line)) start = index
    if (/\\end\{figure\}/.test(line) && start >= 0) {
      blocks.push({ start, end: index, body: "" })
      start = -1
    }
  })
  const lines = file.content.split("\n")
  return blocks.map((block) => ({ ...block, body: lines.slice(block.start, block.end + 1).join("\n") }))
}

function figureWithoutCaption(project: Project): FormatIssue[] {
  return project.tex.flatMap((file) =>
    figureBlocks(file)
      .filter((block) => !block.body.includes("\\caption"))
      .map((block) => issue(file.path, block.start + 1, "figure-without-caption", "warning", "Figure environment has no \\caption")),
  )
}

function figureWithoutLabel(project: Project): FormatIssue[] {
  return project.tex.flatMap((file) =>
    figureBlocks(file)
      .filter((block) => !block.body.includes("\\label"))
      .map((block) => issue(file.path, block.start + 1, "figure-without-label", "warning", "Figure environment has no \\label")),
  )
}

function undefinedRef(project: Project): FormatIssue[] {
  const defined = new Set(
    project.tex.flatMap((file) => Array.from(file.content.matchAll(LABEL_DEF), (match) => match[1] ?? "")),
  )
  return project.tex.flatMap((file) =>
    file.content.split("\n").flatMap((line, index) =>
      Array.from(line.matchAll(REF_USE))
        .filter((match) => match[1] && !defined.has(match[1]))
        .map((match) => issue(file.path, index + 1, "undefined-ref", "error", `Reference '${match[1]}' has no matching \\label`)),
    ),
  )
}

function abstractBody(file: TexFile): string {
  const match = /\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/.exec(file.content)
  return match?.[1] ?? ""
}

function ieeeAbstractLength(project: Project): FormatIssue[] {
  return project.tex.flatMap((file) => {
    const body = abstractBody(file)
    if (!body) return []
    const words = body.match(/[A-Za-z]+/g) ?? []
    if (words.length <= 250) return []
    return [issue(file.path, 1, "ieee-abstract-length", "warning", `Abstract has ${words.length} words; IEEE limit is about 250`)]
  })
}

function ieeeSectionTitleCase(project: Project): FormatIssue[] {
  const small = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "with"])
  return project.tex.flatMap((file) =>
    file.content.split("\n").flatMap((line, index) => {
      const match = /\\section\{([^}]*)\}/.exec(line)
      if (!match?.[1]) return []
      const wrong = match[1].split(/\s+/).filter((word) => word.length > 3 && !small.has(word.toLowerCase()) && /^[a-z]/.test(word))
      if (wrong.length === 0) return []
      return [issue(file.path, index + 1, "ieee-section-title-case", "warning", `Section title is not in Title Case: '${match[1]}'`)]
    }),
  )
}

function ieeePagestyle(project: Project): FormatIssue[] {
  return project.tex.flatMap((file) =>
    file.content.split("\n").flatMap((line, index) =>
      line.includes("\\pagestyle")
        ? [issue(file.path, index + 1, "ieee-pagestyle", "error", "IEEE templates forbid \\pagestyle overrides")]
        : [],
    ),
  )
}

function acmConference(project: Project): FormatIssue[] {
  const has = project.tex.some((file) => file.content.includes("\\acmConference"))
  return has ? [] : [issue(project.tex[0]?.path ?? "", 1, "acm-conference", "error", "ACM template requires \\acmConference")]
}

function acmAuthorAffiliation(project: Project): FormatIssue[] {
  return project.tex.flatMap((file) => {
    const authors = file.content.match(/\\author\{/g)?.length ?? 0
    const affiliations = file.content.match(/\\affiliation\{/g)?.length ?? 0
    if (authors === 0 || affiliations === authors) return []
    return [issue(file.path, 1, "acm-author-affiliation", "warning", `${authors} \\author commands but ${affiliations} \\affiliation blocks`)]
  })
}

function issue(file: string, line: number, rule: string, severity: FormatIssue["severity"], message: string): FormatIssue {
  return { file, line, rule, severity, message }
}
