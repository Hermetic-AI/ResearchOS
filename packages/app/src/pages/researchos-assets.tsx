import { For, type Component } from "solid-js"
import { useParams } from "@solidjs/router"

const assetTypes = [
  { id: "skill", label: "Skills", count: 0 },
  { id: "mcp", label: "MCP", count: 0 },
  { id: "model", label: "Models", count: 0 },
  { id: "agent", label: "SubAgents", count: 0 },
  { id: "command", label: "Commands", count: 0 },
  { id: "rules", label: "Rules", count: 0 },
  { id: "plugin", label: "Hooks & Plugins", count: 0 },
]

const AssetsPage: Component = () => {
  const params = useParams<{ dir: string }>()

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <nav style={{ width: "200px", padding: "16px", "border-right": "1px solid var(--color-border)" }}>
        <h2 style={{ "font-size": "14px", "font-weight": 600, margin: "0 0 12px" }}>
          Asset Center
        </h2>
        <ul style={{ "list-style": "none", padding: 0, margin: 0 }}>
          <For each={assetTypes}>
            {(item) => (
              <li
                style={{
                  padding: "8px 12px",
                  cursor: "pointer",
                  "border-radius": "4px",
                  "font-size": "13px",
                  display: "flex",
                  "justify-content": "space-between",
                }}
              >
                <span>{item.label}</span>
                <span style={{ color: "var(--color-text-weak)", "font-size": "12px" }}>
                  {item.count}
                </span>
              </li>
            )}
          </For>
        </ul>
      </nav>
      <main style={{ flex: 1, padding: "24px" }}>
        <h1 style={{ "font-size": "16px", "font-weight": 600, margin: "0 0 8px" }}>
          ResearchOS Asset Management Center
        </h1>
        <p style={{ "font-size": "13px", color: "var(--color-text-weak)" }}>
          Project: {params.dir} — Select an asset type from the sidebar to manage.
        </p>
      </main>
    </div>
  )
}

export default AssetsPage
