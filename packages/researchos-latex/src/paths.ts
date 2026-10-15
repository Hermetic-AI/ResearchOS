import { join } from "path"

export function latexDir(projectRoot: string): string {
  return join(projectRoot, ".researchos", "latex")
}

export function buildDir(projectRoot: string): string {
  return join(latexDir(projectRoot), "build")
}

export function binDir(projectRoot: string): string {
  return join(latexDir(projectRoot), "bin")
}
