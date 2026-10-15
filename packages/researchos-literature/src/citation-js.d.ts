// @citation-js 不附带 TypeScript 声明，这里以 ambient module 声明本包用到的精确 API 面。
// 本文件是全局脚本（无 import/export），经 cite.ts 顶部的 /// <reference path> 进入编译程序，
// 因此 server 跨包编译 cite.ts 时同样生效。
declare module "@citation-js/core" {
  export interface CslAuthor {
    family?: string
    given?: string
    literal?: string
  }

  export interface CslItem {
    id?: string
    type?: string
    title?: string
    author?: CslAuthor[]
    issued?: { "date-parts": number[][] }
    DOI?: string
    URL?: string
    "container-title"?: string
  }

  export class Cite {
    constructor(data?: unknown)
    data: CslItem[]
    static async(data: unknown): Promise<Cite>
    format(format: string, options?: Record<string, unknown>): string
  }

  export const plugins: {
    config: {
      get(name: string): {
        styles: { add(name: string, xml: string): void }
      }
    }
  }
}

declare module "@citation-js/plugin-csl" {}
declare module "@citation-js/plugin-bibtex" {}
declare module "@citation-js/plugin-ris" {}
