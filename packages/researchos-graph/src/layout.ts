import type { GraphNode } from "./types"

// 力导布局在前端跑；后端只提供坐标读取/持久化（store.saveLayout）与环形布局计算
export function circleLayout(nodes: GraphNode[], radius: number = 300): Array<{ id: string; x: number; y: number }> {
  const count = Math.max(1, nodes.length)
  return nodes.map((node, index) => ({
    id: node.id,
    x: Math.round(radius * Math.cos((2 * Math.PI * index) / count)),
    y: Math.round(radius * Math.sin((2 * Math.PI * index) / count)),
  }))
}
