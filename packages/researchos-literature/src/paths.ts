import { join } from "path"

export function literatureDir(projectRoot: string): string {
  return join(projectRoot, ".researchos", "literature")
}

export function dbPath(projectRoot: string): string {
  return join(literatureDir(projectRoot), "literature.db")
}

export function pdfDir(projectRoot: string): string {
  return join(literatureDir(projectRoot), "pdfs")
}

export function textDir(projectRoot: string): string {
  return join(literatureDir(projectRoot), "text")
}

export function modelsDir(projectRoot: string): string {
  return join(literatureDir(projectRoot), "models")
}

export function exportsDir(projectRoot: string): string {
  return join(literatureDir(projectRoot), "exports")
}
