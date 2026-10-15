import { useNavigate } from "@solidjs/router"
import { For } from "solid-js"
import { Menu } from "@opencode/ui/menu"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Tooltip } from "@opencode/ui/tooltip"
import { researchosModules, useResearchosHref } from "./researchos-rail"

// 会话页标题栏的模块切换菜单：目录从当前会话的记录解析，主页回落到选中的项目。
export function ResearchosModulesMenu() {
  const href = useResearchosHref()
  const navigate = useNavigate()

  return (
    <Menu gutter={4} modal={false} placement="bottom-start">
      <Tooltip placement="bottom" value="ResearchOS modules" class="shrink-0">
        <Menu.Trigger
          as={IconButton}
          type="button"
          variant="ghost-muted"
          size="large"
          class="!w-9 shrink-0"
          icon={<Icon name="outline-sliders" />}
          disabled={!href()}
          aria-label="ResearchOS modules"
        />
      </Tooltip>
      <Menu.Portal>
        <Menu.Content class="max-w-80">
          <Menu.Group>
            <Menu.GroupLabel>ResearchOS</Menu.GroupLabel>
            <For each={researchosModules}>
              {(module) => (
                <Menu.Item disabled={!href()} onSelect={() => href() && navigate(href()!(module.route))}>
                  <Icon name={module.icon} size="small" />
                  <span class="flex min-w-0 flex-col">
                    <span>{module.label}</span>
                    <span class="truncate text-11-regular text-text-weaker">{module.description}</span>
                  </span>
                </Menu.Item>
              )}
            </For>
          </Menu.Group>
        </Menu.Content>
      </Menu.Portal>
    </Menu>
  )
}
