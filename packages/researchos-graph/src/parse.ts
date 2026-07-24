import type { GraphNode, GraphEdge } from "./types"

export function parseWikilinks(content: string, basePath: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const wikiRegex = /\[\[([^\]]+)\]\]/g
  const citeRegex = /\\cite\{([^}]+)\}/g

  const nodes: Map<string, GraphNode> = new Map()
  const edges: GraphEdge[] = []

  const sourceId = `note:${basePath}`

  const addConceptNode = (name: string) => {
    const id = `concept:${name.toLowerCase()}`
    if (!nodes.has(id)) {
      nodes.set(id, { id, type: "concept", label: name, x: 0, y: 0 })
    }
    return id
  }

  for (const match of content.matchAll(wikiRegex)) {
    const target = match[1].trim()
    if (!target) continue

    if (target.includes("/10.") || target.startsWith("10.")) {
      const paperId = `paper:${hash(target)}`
      if (!nodes.has(paperId)) {
        nodes.set(paperId, { id: paperId, type: "paper", label: target, refId: target, x: 0, y: 0 })
      }
      edges.push({ from: sourceId, to: paperId, relation: "cites" })
    } else {
      const conceptId = addConceptNode(target)
      edges.push({ from: sourceId, to: conceptId, relation: "mentions" })
    }
  }

  for (const match of content.matchAll(citeRegex)) {
    const keys = match[1].split(",").map((k) => k.trim()).filter(Boolean)
    for (const key of keys) {
      const paperId = `paper:${key}`
      if (!nodes.has(paperId)) {
        nodes.set(paperId, { id: paperId, type: "paper", label: key, x: 0, y: 0 })
      }
      edges.push({ from: sourceId, to: paperId, relation: "cites" })
    }
  }

  if (!nodes.has(sourceId)) {
    nodes.set(sourceId, { id: sourceId, type: "note", label: basePath, x: 0, y: 0 })
  }

  return { nodes: Array.from(nodes.values()), edges }
}

function hash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(16).padStart(8, "0")
}

export function computeLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number = 800,
  height: number = 600,
): GraphNode[] {
  const positions = nodes.map((n) => ({ ...n }))

  for (let iter = 0; iter < 50; iter++) {
    const forces = positions.map(() => ({ x: 0, y: 0 }))

    for (const edge of edges) {
      const fi = positions.findIndex((n) => n.id === edge.from)
      const ti = positions.findIndex((n) => n.id === edge.to)
      if (fi < 0 || ti < 0) continue
      const dx = positions[ti].x - positions[fi].x
      const dy = positions[ti].y - positions[fi].y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const f = (dist - 100) / dist * 0.01
      forces[fi].x += dx * f
      forces[fi].y += dy * f
      forces[ti].x -= dx * f
      forces[ti].y -= dy * f
    }

    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = positions[j].x - positions[i].x
        const dy = positions[j].y - positions[i].y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const f = 500 / (dist * dist) * 0.1
        forces[i].x -= dx * f
        forces[i].y -= dy * f
        forces[j].x += dx * f
        forces[j].y += dy * f
      }
    }

    const centerX = width / 2
    const centerY = height / 2
    for (let i = 0; i < positions.length; i++) {
      forces[i].x += (centerX - positions[i].x) * 0.01
      forces[i].y += (centerY - positions[i].y) * 0.01
    }

    for (let i = 0; i < positions.length; i++) {
      positions[i].x += forces[i].x * 0.5
      positions[i].y += forces[i].y * 0.5
    }
  }

  return positions
}
