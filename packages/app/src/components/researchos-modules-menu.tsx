import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@opencode/core/util/encode"
import { DropdownMenu } from "@opencode/ui/dropdown-menu"
import { Icon } from "@opencode/ui/icon"
import { IconButtonV2 } from "@opencode/ui/v2/icon-button-v2"
import { Icon as IconV2 } from "@opencode/ui/v2/icon"
import { TooltipV2 } from "@opencode/ui/v2/tooltip-v2"
import { researchosModules, useResearchosDirectory } from "./researchos-rail"

// 新布局（/server/:serverKey/session/:id）没有 dir 路由参数，
// 目录从当前会话的 Session 记录解析；主页则回落到当前选中的项目；
// researchos 路由仍挂在 legacy DirectoryLayout 下
export function ResearchosModulesMenu() {
  const navigate = useNavigate()
  const directory = useResearchosDirectory()
  const open = (route: string) => {
    const dir = directory()
    if (!dir) return
    navigate(`/${base64Encode(dir)}/${route}`)
  }

  return (
    <DropdownMenu gutter={4} modal={false} placement="bottom-start">
      <TooltipV2 placement="bottom" value="ResearchOS modules" class="shrink-0">
        <DropdownMenu.Trigger
          as={IconButtonV2}
          type="button"
          variant="ghost-muted"
          size="large"
          class="!w-9 shrink-0"
          icon={<IconV2 name="outline-sliders" />}
          disabled={!directory()}
          aria-label="ResearchOS modules"
        />
      </TooltipV2>
      <DropdownMenu.Portal>
        <DropdownMenu.Content class="desktop-app-menu">
          <DropdownMenu.Group>
            <DropdownMenu.GroupLabel class="desktop-app-menu-heading">ResearchOS</DropdownMenu.GroupLabel>
            {researchosModules.map((module) => (
              <DropdownMenu.Item onSelect={() => open(module.route)}>
                <Icon name={module.icon} size="small" />
                <DropdownMenu.ItemLabel>{module.label}</DropdownMenu.ItemLabel>
                <DropdownMenu.ItemDescription>{module.description}</DropdownMenu.ItemDescription>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Group>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu>
  )
}
