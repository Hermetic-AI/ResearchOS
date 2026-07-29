import { z } from "zod"

export const NodeType = z.enum(["paper", "note", "concept", "repo"])
export type NodeType = z.infer<typeof NodeType>

// ID 约定（设计 §5.2）：paper:<doi-slug> / note:<vault 相对路径> / concept:<slug> / repo:<host>/<owner>/<name>
export const GraphNode = z.object({
  id: z.string(),
  type: NodeType,
  label: z.string(),
  refId: z.string().nullish(),
  sourcePath: z.string().nullish(),
  attrs: z.record(z.string(), z.unknown()).default({}),
  x: z.number().nullish(),
  y: z.number().nullish(),
})
export type GraphNode = z.infer<typeof GraphNode>

export const EdgeRelation = z.enum(["cites", "mentions", "implements", "evolves"])
export type EdgeRelation = z.infer<typeof EdgeRelation>

export const GraphEdge = z.object({
  from: z.string(),
  to: z.string(),
  relation: EdgeRelation,
  context: z.string().nullish(),
  sourcePath: z.string().nullish(),
})
export type GraphEdge = z.infer<typeof GraphEdge>

export const Subgraph = z.object({
  nodes: z.array(GraphNode),
  edges: z.array(GraphEdge),
})
export type Subgraph = z.infer<typeof Subgraph>

export const RagScope = z.object({
  centerNode: z.string().optional(),
  depth: z.number().int().min(1).max(2).default(1),
})
export type RagScope = z.infer<typeof RagScope>

export const GraphRagResult = z.object({
  subgraph: Subgraph,
  contextPack: z.string(),
  seeds: z.array(GraphNode),
  degraded: z.boolean(),
})
export type GraphRagResult = z.infer<typeof GraphRagResult>
