import type { OutlineItem } from "./types"

const LEVELS: Record<string, number> = {
  part: 1,
  chapter: 2,
  section: 3,
  subsection: 4,
  subsubsection: 5,
  paragraph: 6,
}

export function parseOutline(content: string): OutlineItem[] {
  return content.split("\n").flatMap((line, index) => {
    const match = /\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\{([^}]*)\}/.exec(line)
    if (!match?.[1] || !match[2]) return []
    return [{ level: LEVELS[match[1]] ?? 3, title: match[2], line: index + 1 }]
  })
}
