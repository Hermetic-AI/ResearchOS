export function rewriteAcademic(text: string): string {
  return text
    .replace(/\bwe\b/gi, "this work")
    .replace(/\bdon't\b/gi, "do not")
    .replace(/\bcan't\b/gi, "cannot")
    .replace(/\bit's\b/gi, "it is")
    .replace(/\bI think\b/gi, "it is hypothesized that")
}

export function rewriteConcise(text: string): string {
  return text
    .replace(/it is worth noting that /gi, "")
    .replace(/it should be noted that /gi, "")
    .replace(/in order to /gi, "to ")
    .replace(/due to the fact that /gi, "because ")
    .replace(/a number of /gi, "several ")
}

export function rewritePassive(text: string): string {
  return text
    .replace(/\bwe measured\b/gi, "X was measured")
    .replace(/\bwe observed\b/gi, "it was observed that")
    .replace(/\bwe conducted\b/gi, "experiments were conducted")
    .replace(/\bwe found\b/gi, "it was found that")
}

export function rewrite(text: string, style: "academic" | "concise" | "passive"): string {
  switch (style) {
    case "academic": return rewriteAcademic(text)
    case "concise": return rewriteConcise(text)
    case "passive": return rewritePassive(text)
  }
}
