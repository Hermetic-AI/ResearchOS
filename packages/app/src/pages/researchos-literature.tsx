import { For, createSignal, type Component } from "solid-js"
import { useParams } from "@solidjs/router"

interface PaperCardData {
  id: string
  title: string
  year: number | null
  venue: string | null
  authors: Array<{ name: string }>
  citationCount: number
  source: string
  isRead: boolean
  isFavorite: boolean
}

const mockPapers: PaperCardData[] = [
  { id: "1", title: "Attention Is All You Need", year: 2017, venue: "NeurIPS", authors: [{ name: "Vaswani et al." }], citationCount: 120000, source: "arxiv", isRead: true, isFavorite: true },
  { id: "2", title: "BERT: Pre-training of Deep Bidirectional Transformers", year: 2018, venue: "NAACL", authors: [{ name: "Devlin et al." }], citationCount: 100000, source: "arxiv", isRead: false, isFavorite: false },
  { id: "3", title: "GPT-3: Language Models are Few-Shot Learners", year: 2020, venue: "NeurIPS", authors: [{ name: "Brown et al." }], citationCount: 80000, source: "arxiv", isRead: false, isFavorite: true },
]

const categories = [
  { id: "all", label: "All Papers", count: 126 },
  { id: "unread", label: "Unread", count: 45 },
  { id: "favorites", label: "Favorites", count: 12 },
  { id: "2024", label: "2024", count: 23 },
  { id: "2023", label: "2023", count: 31 },
]

const LiteraturePage: Component = () => {
  const params = useParams<{ dir: string }>()
  const [selectedCategory, setSelectedCategory] = createSignal("all")
  const [selectedPaper, setSelectedPaper] = createSignal<PaperCardData | null>(null)

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <nav style={{ width: "180px", padding: "16px", "border-right": "1px solid var(--color-border)", "overflow-y": "auto" }}>
        <h3 style={{ "font-size": "13px", "font-weight": 600, margin: "0 0 12px" }}>Collections</h3>
        <ul style={{ "list-style": "none", padding: 0, margin: 0 }}>
          <For each={categories}>
            {(cat) => (
              <li
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  padding: "6px 8px",
                  cursor: "pointer",
                  "border-radius": "4px",
                  "font-size": "12px",
                  background: selectedCategory() === cat.id ? "var(--color-surface-raised)" : "transparent",
                  display: "flex",
                  "justify-content": "space-between",
                }}
              >
                <span>{cat.label}</span>
                <span style={{ color: "var(--color-text-weak)" }}>{cat.count}</span>
              </li>
            )}
          </For>
        </ul>
      </nav>

      <section style={{ width: "320px", "border-right": "1px solid var(--color-border)", "overflow-y": "auto" }}>
        <div style={{ padding: "12px 16px", "border-bottom": "1px solid var(--color-border)" }}>
          <input
            type="text"
            placeholder="Search papers..."
            style={{
              width: "100%",
              padding: "6px 10px",
              "font-size": "12px",
              "border-radius": "4px",
              border: "1px solid var(--color-border)",
              background: "var(--color-surface-base)",
              color: "var(--color-text)",
            }}
          />
        </div>
        <For each={mockPapers}>
          {(paper) => (
            <div
              onClick={() => setSelectedPaper(paper)}
              style={{
                padding: "12px 16px",
                cursor: "pointer",
                "border-bottom": "1px solid var(--color-border-subtle)",
                background: selectedPaper()?.id === paper.id ? "var(--color-surface-raised)" : "transparent",
              }}
            >
              <div style={{ "font-size": "13px", "font-weight": 500, "line-height": "1.4", "margin-bottom": "4px" }}>
                {paper.title}
              </div>
              <div style={{ "font-size": "11px", color: "var(--color-text-weak)" }}>
                {paper.authors[0]?.name} · {paper.year} · {paper.venue}
              </div>
              <div style={{ "font-size": "11px", color: "var(--color-text-weak)", "margin-top": "2px" }}>
                {paper.citationCount.toLocaleString()} citations · {paper.source}
              </div>
            </div>
          )}
        </For>
      </section>

      <main style={{ flex: 1, padding: "24px", "overflow-y": "auto" }}>
        {selectedPaper() ? (
          <>
            <h1 style={{ "font-size": "16px", "font-weight": 600, margin: "0 0 8px" }}>
              {selectedPaper()!.title}
            </h1>
            <p style={{ "font-size": "13px", color: "var(--color-text-weak)", margin: "0 0 16px" }}>
              {selectedPaper()!.authors.map((a) => a.name).join(", ")} · {selectedPaper()!.year} · {selectedPaper()!.venue}
            </p>
            <div style={{ "font-size": "13px", "line-height": "1.6", color: "var(--color-text)" }}>
              <p>Citations: {selectedPaper()!.citationCount.toLocaleString()}</p>
              <p>Source: {selectedPaper()!.source}</p>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", "align-items": "center", "justify-content": "center", height: "100%", color: "var(--color-text-weak)", "font-size": "13px" }}>
            Select a paper from the list
          </div>
        )}
      </main>
    </div>
  )
}

export default LiteraturePage
