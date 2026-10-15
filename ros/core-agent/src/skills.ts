export * as Skills from "./skills"

import { existsSync, readFileSync } from "fs"
import { basename, join } from "path"

export interface Skill {
  name: string
  description?: string
  version?: string
  content: string
  location: string
  scope: "project" | "global"
}

export interface SkillRoot {
  dir: string
  scope: "project" | "global"
}

// Minimal YAML-ish frontmatter reader: `key: value` lines between leading --- fences.
// Values keep everything after the first colon and drop surrounding quotes.
function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw)
  if (match === null) return undefined
  const data: Record<string, string> = {}
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const idx = line.indexOf(":")
    if (idx < 0) continue
    const key = line.slice(0, idx).trim()
    if (key === "") continue
    data[key] = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "")
  }
  return { data, body: (match[2] ?? "").trim() }
}

export function parseSkill(raw: string, location: string, scope: "project" | "global"): Skill | undefined {
  const parsed = parseFrontmatter(raw)
  if (parsed === undefined) return undefined
  const { data, body } = parsed
  if (typeof data.name !== "string" || data.name === "") return undefined
  return {
    name: data.name,
    description: data.description,
    version: data.version,
    content: body,
    location,
    scope,
  }
}

// Folder name must equal the declared skill name; opencode relies on this for `@name` resolution.
function folderMatchesName(location: string, name: string): boolean {
  return basename(join(location, "..")) === name
}

export function loadSkills(roots: SkillRoot[]): Skill[] {
  const byName = new Map<string, Skill>()
  for (const root of roots) {
    if (!existsSync(root.dir)) continue
    const glob = new Bun.Glob("**/SKILL.md")
    let paths: string[] = []
    try {
      paths = [...glob.scanSync({ cwd: root.dir, absolute: true })]
    } catch {
      continue
    }
    for (const path of paths.sort()) {
      const skill = parseSkill(readFileSync(path, "utf8"), path, root.scope)
      if (skill === undefined) continue
      if (!folderMatchesName(skill.location, skill.name)) continue
      // Project scope wins over global on name collision.
      const existing = byName.get(skill.name)
      if (existing && existing.scope === "project") continue
      byName.set(skill.name, skill)
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

// Progressive disclosure: only name + description enter the resident system prompt.
export function formatSkillList(skills: Skill[]): string {
  const described = skills.filter((skill) => skill.description !== undefined && skill.description !== "")
  if (described.length === 0) return ""
  return ["## Available Skills", ...described.map((s) => `- ${s.name}: ${s.description}`)].join("\n")
}

export type SkillProblem = { path?: string; message: string }

// Install-time validation: valid frontmatter, name/folder match, and no overreach tool claims.
const OVERREACH = /\b(shell|exec|network|http|fetch|curl|rm -rf|sudo)\b/i
export function validateSkillMarkdown(raw: string, folderName: string): SkillProblem[] {
  const problems: SkillProblem[] = []
  const skill = parseSkill(raw, folderName, "project")
  if (skill === undefined) {
    problems.push({ message: "missing or invalid frontmatter (need --- block with a name field)" })
    return problems
  }
  if (skill.name !== folderName)
    problems.push({ message: `skill name "${skill.name}" does not match folder "${folderName}"` })
  if (!skill.description) problems.push({ message: "missing description (skills stay undiscoverable without one)" })
  const toolSection = /^#{1,3}\s*(tools?|allowed-tools)\b([\s\S]*)$/im.exec(skill.content)
  if (toolSection && OVERREACH.test(toolSection[2] ?? ""))
    problems.push({ message: "declares an overreaching tool (shell/network/exec); install blocked" })
  return problems
}
