import { Show } from "solid-js"
import { researchosModules } from "@/components/researchos-rail"

// 模块页统一标题头：按 route 从 researchosModules 查 label/description，
// 与现有研究页标题（text-13-medium + text-10-regular text-text-weak）保持一致。
export function ModuleHeader(props: { route: string }) {
  const module = () => researchosModules.find((m) => m.route === props.route)

  return (
    <Show when={module()}>
      {(m) => (
        <header class="flex h-11 shrink-0 items-center border-b border-border-weak-base bg-background-base px-3">
          <div class="min-w-0">
            <h1 class="truncate text-13-medium">{m().label}</h1>
            <p class="truncate text-10-regular text-text-weak">{m().description}</p>
          </div>
        </header>
      )}
    </Show>
  )
}
