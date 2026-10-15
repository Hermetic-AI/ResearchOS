import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { CoreAgent } from "../src/index"

function writeSkill(root: string, folder: string, markdown: string) {
  const dir = join(root, folder)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "SKILL.md"), markdown)
  return dir
}

const reading = `---
name: paper-reading
description: Structured paper reading.
version: 1.0.0
---
# Reading
Extract method, innovation, limitations.
`

describe("skill frontmatter + loading", () => {
  test("parseSkill reads name/description/version and body", () => {
    const skill = CoreAgent.parseSkill(reading, "/x/paper-reading/SKILL.md", "project")
    expect(skill?.name).toBe("paper-reading")
    expect(skill?.description).toBe("Structured paper reading.")
    expect(skill?.version).toBe("1.0.0")
    expect(skill?.content).toContain("Extract method")
  })

  test("loadSkills skips folder/name mismatches and keeps matches", () => {
    const root = mkdtempSync(join(tmpdir(), "ros-skills-"))
    writeSkill(root, "paper-reading", reading)
    writeSkill(root, "wrong-folder", reading) // name paper-reading != folder wrong-folder
    const skills = CoreAgent.loadSkills([{ dir: root, scope: "project" }])
    expect(skills.map((s) => s.name)).toEqual(["paper-reading"])
  })

  test("formatSkillList only exposes name + description", () => {
    const text = CoreAgent.formatSkillList([
      { name: "a", description: "first", content: "SECRET BODY", location: "l", scope: "project" },
      { name: "b", content: "no desc", location: "l", scope: "project" },
    ])
    expect(text).toContain("a: first")
    expect(text).not.toContain("SECRET BODY")
    expect(text).not.toContain("- b")
  })
})

describe("install-time validation", () => {
  test("rejects missing frontmatter", () => {
    expect(CoreAgent.validateSkillMarkdown("# no frontmatter", "x").length).toBeGreaterThan(0)
  })

  test("rejects name/folder mismatch and missing description", () => {
    const problems = CoreAgent.validateSkillMarkdown("---\nname: other\n---\nbody", "folder")
    expect(problems.some((p) => p.message.includes("does not match folder"))).toBe(true)
    expect(problems.some((p) => p.message.includes("description"))).toBe(true)
  })

  test("blocks overreaching tool declarations", () => {
    const markdown = "---\nname: evil\ndescription: bad\n---\n# Tools\n- shell exec and network fetch\n"
    const problems = CoreAgent.validateSkillMarkdown(markdown, "evil")
    expect(problems.some((p) => p.message.includes("overreaching"))).toBe(true)
  })

  test("accepts a well-formed skill", () => {
    expect(CoreAgent.validateSkillMarkdown(reading, "paper-reading")).toEqual([])
  })
})
