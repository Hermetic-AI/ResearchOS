export function graphDir(projectRoot: string): string {
  return `${projectRoot}/.researchos`
}

export function dbPath(projectRoot: string): string {
  return `${graphDir(projectRoot)}/graph.db`
}
