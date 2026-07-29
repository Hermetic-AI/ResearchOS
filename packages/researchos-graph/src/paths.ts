import { join } from "path"

export function graphDir(projectRoot: string): string {
  return join(projectRoot, ".researchos", "graph")
}

export function dbPath(projectRoot: string): string {
  return join(graphDir(projectRoot), "graph.db")
}

export function modelsDir(projectRoot: string): string {
  return join(graphDir(projectRoot), "models")
}

export function literatureDbPath(projectRoot: string): string {
  return join(projectRoot, ".researchos", "literature", "literature.db")
}
