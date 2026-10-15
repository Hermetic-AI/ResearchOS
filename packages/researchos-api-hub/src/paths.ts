import path from "path"

export function apiHubDir(projectRoot: string) {
  return path.join(projectRoot, ".researchos")
}

export function apiCachePath(projectRoot: string) {
  return path.join(apiHubDir(projectRoot), "api-cache.db")
}
