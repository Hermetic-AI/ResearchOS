/// <reference path="./citation-js.d.ts" />
import { Cite, plugins, type CslAuthor, type CslItem } from "@citation-js/core"
import "@citation-js/plugin-csl"
import "@citation-js/plugin-bibtex"
import "@citation-js/plugin-ris"
import type { CitationStyle, PaperMeta } from "./types"

const STYLE_FILES: Record<CitationStyle, string> = {
  ieee: "ieee.csl",
  acm: "acm-sig-proceedings.csl",
  apa: "apa.csl",
  nature: "nature.csl",
  springer: "springer-basic-author-date.csl",
}

// 模块级懒注册：CSL 文件只从包内 csl/ 目录读一次，运行时不联网
let registered: Promise<void> | undefined

function registerStyles(): Promise<void> {
  registered ??= Promise.all(
    Object.entries(STYLE_FILES).map(async ([name, file]) => {
      const xml = await Bun.file(new URL(`../csl/${file}`, import.meta.url)).text()
      plugins.config.get("@csl").styles.add(name, xml)
    }),
  ).then(() => undefined)
  return registered
}

export function toCslJson(paper: PaperMeta): CslItem {
  return {
    id: paper.id,
    type: cslType(paper),
    title: paper.title,
    author: paper.authors.map((author) => splitName(author.name)),
    ...(paper.year ? { issued: { "date-parts": [[paper.year]] } } : {}),
    ...(paper.doi ? { DOI: paper.doi } : {}),
    ...(paper.venue ? { "container-title": paper.venue } : {}),
    ...(paper.arxivId ? { URL: `https://arxiv.org/abs/${paper.arxivId}` } : {}),
  }
}

export async function formatCitations(papers: PaperMeta[], style: CitationStyle): Promise<string[]> {
  await registerStyles()
  const output = new Cite(papers.map(toCslJson)).format("bibliography", {
    format: "text",
    template: style,
    lang: "en-US",
  })
  return output.split("\n").map((line) => line.trim()).filter(Boolean)
}

export async function parseBibtex(content: string): Promise<CslItem[]> {
  return (await Cite.async(content)).data
}

export async function parseRis(content: string): Promise<CslItem[]> {
  return (await Cite.async(content)).data
}

function cslType(paper: PaperMeta): string {
  const venue = paper.venue?.toLowerCase() ?? ""
  if (/conference|proceedings|symposium|workshop|neurips|nips|information processing systems|icml|iclr|acl|naacl|emnlp|cvpr|iccv|eccv|aaai|ijcai|kdd|sigir/.test(venue)) {
    return "paper-conference"
  }
  return "article-journal"
}

function splitName(name: string): CslAuthor {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const family = parts.at(-1)
  if (parts.length < 2 || !family) return { literal: name }
  return { family, given: parts.slice(0, -1).join(" ") }
}
