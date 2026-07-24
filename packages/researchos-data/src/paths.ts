import { join } from "path"

export function dataDir(projectRoot: string): string {
  return join(projectRoot, ".researchos", "data")
}

export function artifactsDir(projectRoot: string): string {
  return join(dataDir(projectRoot), "artifacts")
}

export function sandboxDir(projectRoot: string): string {
  return join(projectRoot, ".researchos", "venv")
}
