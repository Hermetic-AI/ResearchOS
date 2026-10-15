import type { createResearchosClient } from "@/utils/researchos-client"
export type PlotClient = ReturnType<typeof createResearchosClient>["server.researchos-plot"]
export type PlotArtifact = { id: string; kind: string; chartId?: string; path: string; previewSvg?: string; texFile?: string; texLabel?: string; createdAt: number }
export function svgUrl(svg: string) { return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}` }
