import { existsSync } from "fs"
import { basename, join, resolve, sep } from "path"
import { buildDir } from "./paths"
import { forwardLookup, inverseLookup, loadSynctex } from "./synctex"

export interface SynctexArgs {
  mainFile?: string
  file?: string
  line?: number
  pdfPath?: string
  page?: number
  x?: number
  y?: number
}

export interface SynctexAnswer {
  found: boolean
  reason?: string
  file?: string
  line?: number
  page?: number
  x?: number
  y?: number
}

export async function synctexQuery(projectRoot: string, args: SynctexArgs): Promise<SynctexAnswer> {
  const root = resolve(projectRoot)
  if (args.pdfPath !== undefined && args.page !== undefined && args.x !== undefined && args.y !== undefined) {
    const synctexPath = resolveInside(root, args.pdfPath.replace(/\.pdf$/, "") + ".synctex.gz")
    if (!existsSync(synctexPath)) return { found: false, reason: `SyncTeX file not found for ${args.pdfPath}` }
    const hit = inverseLookup(await loadSynctex(synctexPath), args.page, args.x, args.y)
    return hit ? { found: true, ...hit } : { found: false, reason: "no record near the given coordinates" }
  }
  if (args.file !== undefined && args.line !== undefined && args.mainFile !== undefined) {
    const base = basename(args.mainFile).replace(/\.tex$/, "")
    const synctexPath = join(buildDir(root), `${base}.synctex.gz`)
    if (!existsSync(synctexPath)) return { found: false, reason: `No build output for ${args.mainFile}; compile first` }
    const hit = forwardLookup(await loadSynctex(synctexPath), args.file, args.line)
    return hit ? { found: true, ...hit } : { found: false, reason: "no record near the given line" }
  }
  throw new Error("synctex requires either pdfPath+page+x+y (inverse) or mainFile+file+line (forward)")
}

function resolveInside(root: string, path: string): string {
  // 与 compile 一致的安全白名单
  const resolved = resolve(root, path)
  if (!resolved.startsWith(root + sep)) throw new Error(`Path escapes project root: ${path}`)
  return resolved
}
