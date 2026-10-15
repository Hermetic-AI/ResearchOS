import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force"
import { select } from "d3-selection"
import { zoom as createZoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from "d3-zoom"
import { edgeStyles, finite, nodeColors, type GraphEdgeData, type GraphNodeData } from "./graph-colors"

const WIDTH = 1200
const HEIGHT = 800
const NODE_RADIUS = 14

interface SimNode extends SimulationNodeDatum {
  id: string
  type: GraphNodeData["type"]
  label: string
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  relation: GraphEdgeData["relation"]
}

export function GraphCanvas(props: {
  nodes: ReadonlyArray<GraphNodeData>
  edges: ReadonlyArray<GraphEdgeData>
  layout: "force" | "circle"
  selectedId?: string
  highlightIds?: ReadonlySet<string>
  focusRequest?: { id: string; seq: number }
  onSelect: (id: string | undefined) => void
  onPersist: (positions: Array<{ id: string; x: number; y: number }>) => void
}) {
  let svgRef!: SVGSVGElement
  let simNodes: SimNode[] = []
  let simLinks: SimLink[] = []
  const [tick, setTick] = createSignal(0)
  const [transform, setTransform] = createSignal({ x: 0, y: 0, k: 1 })
  const [hoveredId, setHoveredId] = createSignal<string>()

  const simulation: Simulation<SimNode, SimLink> = forceSimulation<SimNode>([])
    .force("charge", forceManyBody().strength(-260))
    .force("collide", forceCollide(NODE_RADIUS * 2.2))
    .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
    .alphaDecay(0.03)
    .on("tick", () => setTick((value) => value + 1))
  onCleanup(() => simulation.stop())

  // props 变化时 reconcile 模拟节点（保留已有位置），再按布局模式应用
  createEffect(() => {
    const previous = new Map(simNodes.map((node) => [node.id, node]))
    simNodes = props.nodes.map((node) => {
      const old = previous.get(node.id)
      const x = finite(node.x)
      const y = finite(node.y)
      const pinned = x !== undefined && y !== undefined
      return {
        id: node.id,
        type: node.type,
        label: node.label,
        x: old?.x ?? x ?? WIDTH / 2 + (Math.random() - 0.5) * 240,
        y: old?.y ?? y ?? HEIGHT / 2 + (Math.random() - 0.5) * 240,
        fx: pinned ? x : old?.fx ?? null,
        fy: pinned ? y : old?.fy ?? null,
      }
    })
    const ids = new Set(simNodes.map((node) => node.id))
    simLinks = props.edges
      .filter((edge) => ids.has(edge.from) && ids.has(edge.to))
      .map((edge) => ({ source: edge.from, target: edge.to, relation: edge.relation }))
    applyLayout()
  })

  createEffect(() => applyLayout(props.layout))

  function applyLayout(mode: "force" | "circle" = props.layout) {
    if (mode === "circle") {
      simulation.stop()
      const count = Math.max(1, simNodes.length)
      const radius = Math.min(WIDTH, HEIGHT) / 2 - 80
      simNodes.forEach((node, index) => {
        node.fx = WIDTH / 2 + radius * Math.cos((2 * Math.PI * index) / count)
        node.fy = HEIGHT / 2 + radius * Math.sin((2 * Math.PI * index) / count)
      })
      setTick((value) => value + 1)
      return
    }
    simulation.nodes(simNodes)
    simulation.force("link", forceLink<SimNode, SimLink>(simLinks).id((node) => node.id).distance(110))
    simulation.alpha(0.7).restart()
  }

  const zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> = createZoom<SVGSVGElement, unknown>()
    .scaleExtent([0.2, 4])
    .on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
      setTransform({ x: event.transform.x, y: event.transform.y, k: event.transform.k })
    })
  createEffect(() => {
    select(svgRef).call(zoomBehavior)
    onCleanup(() => select(svgRef).on(".zoom", null))
  })

  // 搜索定位：zoom 到目标节点并同步 d3 zoom 内部状态
  createEffect(() => {
    const request = props.focusRequest
    if (!request) return
    const node = simNodes.find((candidate) => candidate.id === request.id)
    if (!node) return
    const k = 1.5
    const next = zoomIdentity
      .translate(WIDTH / 2 - (node.x ?? 0) * k, HEIGHT / 2 - (node.y ?? 0) * k)
      .scale(k)
    select(svgRef).call(zoomBehavior.transform, next)
    props.onSelect(node.id)
  })

  const drag = (() => {
    let active: SimNode | undefined
    return {
      start(node: SimNode, event: PointerEvent) {
        active = node
        ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
        event.stopPropagation()
      },
      move(event: PointerEvent) {
        if (!active) return
        const point = toGraph(event)
        active.fx = point.x
        active.fy = point.y
        simulation.alpha(0.3).restart()
      },
      end() {
        if (!active) return
        const node = active
        active = undefined
        props.onPersist([{ id: node.id, x: node.fx ?? node.x ?? 0, y: node.fy ?? node.y ?? 0 }])
      },
    }
  })()

  function toGraph(event: PointerEvent) {
    const rect = svgRef.getBoundingClientRect()
    const viewX = ((event.clientX - rect.left) / rect.width) * WIDTH
    const viewY = ((event.clientY - rect.top) / rect.height) * HEIGHT
    const t = transform()
    return { x: (viewX - t.x) / t.k, y: (viewY - t.y) / t.k }
  }

  const focusId = createMemo(() => hoveredId() ?? props.selectedId)
  const focusNeighbors = createMemo(() => {
    const id = focusId()
    if (!id) return new Set<string>()
    const linked = props.edges.flatMap((edge) => {
      if (edge.from === id) return [edge.to]
      if (edge.to === id) return [edge.from]
      return []
    })
    return new Set([id, ...linked])
  })
  const isDimmed = (id: string) => {
    if (props.highlightIds && props.highlightIds.size > 0) return !props.highlightIds.has(id)
    return Boolean(focusId()) && !focusNeighbors().has(id)
  }

  const nodesView = () => {
    tick()
    return simNodes
  }
  const linksView = () => {
    tick()
    return simLinks
  }
  const endpoint = (value: string | number | SimNode) => (typeof value === "object" ? value.id : String(value))
  const positionOf = (id: string) => simNodes.find((node) => node.id === id)

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      class="h-full w-full bg-background-base"
      onPointerMove={drag.move}
      onPointerUp={drag.end}
      onClick={() => props.onSelect(undefined)}
    >
      <defs>
        <marker id="graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 1 L 9 5 L 0 9 z" fill={edgeStyles.evolves.color} />
        </marker>
      </defs>
      <g transform={`translate(${transform().x},${transform().y}) scale(${transform().k})`}>
        {linksView().map((link) => {
          const style = edgeStyles[link.relation]
          const source = positionOf(endpoint(link.source))
          const target = positionOf(endpoint(link.target))
          return (
            <line
              x1={source?.x ?? 0}
              y1={source?.y ?? 0}
              x2={target?.x ?? 0}
              y2={target?.y ?? 0}
              stroke={style.color}
              stroke-width={1.5}
              stroke-dasharray={style.dash}
              marker-end={style.arrow ? "url(#graph-arrow)" : undefined}
              opacity={isDimmed(endpoint(link.source)) && isDimmed(endpoint(link.target)) ? 0.12 : 0.6}
            />
          )
        })}
        {nodesView().map((node) => (
          <g
            transform={`translate(${node.x ?? 0},${node.y ?? 0})`}
            opacity={isDimmed(node.id) ? 0.25 : 1}
            onPointerDown={(event) => drag.start(node, event)}
            onPointerEnter={() => setHoveredId(node.id)}
            onPointerLeave={() => setHoveredId(undefined)}
            onClick={(event) => {
              event.stopPropagation()
              props.onSelect(node.id)
            }}
            style={{ cursor: "pointer" }}
          >
            <circle
              r={NODE_RADIUS}
              fill={nodeColors[node.type]}
              stroke={props.selectedId === node.id ? "currentColor" : "transparent"}
              stroke-width={3}
              class="text-text-base"
            />
            <text y={NODE_RADIUS + 14} text-anchor="middle" class="fill-text-weak" font-size="11">
              {node.label.length > 24 ? `${node.label.slice(0, 24)}…` : node.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  )
}
