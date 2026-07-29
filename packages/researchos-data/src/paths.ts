import { join } from "path"

export function dataDir(projectRoot: string): string {
  return join(projectRoot, ".researchos")
}

export function dbPath(projectRoot: string): string {
  return join(dataDir(projectRoot), "data-analysis.db")
}

export function artifactsDir(projectRoot: string): string {
  return join(dataDir(projectRoot), "artifacts")
}

export function datasetsDir(projectRoot: string): string {
  return join(dataDir(projectRoot), "datasets")
}
