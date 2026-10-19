import { InvalidRequestError } from "@opencode/protocol/errors"
import { Effect } from "effect"
import path from "path"

const assetName = /^[a-z0-9][a-z0-9-]*$/

export function resolveAssetPath(
  input: {
    readonly kind: "skill" | "agent" | "command" | "rules"
    readonly name: string
    readonly scope: "project" | "global"
  },
  project: string,
  global: string,
) {
  if (input.kind !== "rules" && !assetName.test(input.name)) {
    return Effect.fail(
      new InvalidRequestError({
        message: `Invalid ${input.kind} name: ${input.name || "<empty>"}`,
        field: "name",
      }),
    )
  }

  const root = input.scope === "project" ? project : global
  if (input.kind === "rules") return Effect.succeed(path.join(root, "AGENTS.md"))

  const base = path.join(root, input.scope === "project" ? ".opencode" : "", input.kind)
  const target = input.kind === "skill"
    ? path.resolve(base, input.name, "SKILL.md")
    : path.resolve(base, `${input.name}.md`)
  const relative = path.relative(path.resolve(base), target)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return Effect.fail(
      new InvalidRequestError({
        message: `Asset path escapes its ${input.kind} directory`,
        field: "name",
      }),
    )
  }
  return Effect.succeed(target)
}
