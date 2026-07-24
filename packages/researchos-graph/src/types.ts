import { z } from "zod"

export const GraphNode = z.object({
  id: z.string(),
  type: z.enum(["paper", "note", "concept", "repo"]),
  label: z.string(),
  refId: z.string().nullish(),
  x: z.number().default(0),
  y: z.number().default(0),
})

export type GraphNode = z.infer<typeof GraphNode>

export const GraphEdge = z.object({
  from: z.string(),
  to: z.string(),
  relation: z.enum(["cites", "mentions", "implements", "evolves"]),
})

export type GraphEdge = z.infer<typeof GraphEdge>

export const Subgraph = z.object({
  nodes: z.array(GraphNode),
  edges: z.array(GraphEdge),
})

export const GraphQueryResult = z.object({
  subgraph: Subgraph,
  answer: z.string(),
})
