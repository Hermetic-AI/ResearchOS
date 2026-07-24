# /import-paper — import a paper by DOI, arXiv ID, URL, or local PDF path
---
command: import-paper
description: Import a paper into the local literature database
---
When invoked, ask the user for a DOI, arXiv ID, URL, or local PDF path. Then call `literature_import_pdf` to import, extract metadata, and add to the library.

# /search-papers — search literature across multiple sources
---
command: search-papers
description: Search academic papers across arXiv, Semantic Scholar, Crossref, and PubMed
---
When invoked, ask the user for a search query. Call `literature_search` with sources=["arxiv","semantic_scholar","crossref","pubmed"] and return results as paper cards.

# /build-graph — rebuild the knowledge graph for the current project
---
command: build-graph
description: Parse all wikilinks and citations and rebuild the knowledge graph
---
When invoked, scan all Markdown and LaTeX files in the project directory, call `graph.parse_wikilinks` and `graph.upsert` to rebuild the graph.

# /compile-paper — compile the current LaTeX project
---
command: compile-paper
description: Compile LaTeX project with Tectonic and show PDF preview
---
When invoked, detect the main .tex file, call `latex.compile`, and display the compiled PDF or error log.

# /run-analysis — run data analysis on a CSV/Parquet file
---
command: run-analysis
description: Profile and analyze a data file in the sandbox
---
When invoked, ask for the data file path. Call `data.profile` to show schema and statistics, then suggest relevant statistical tests.

# /generate-figure — generate a publication-quality figure
---
command: generate-figure
description: Create a scientific figure from data
---
When invoked, ask for the data source, chart type, and target journal theme. Call `plot.chart_create` and show the preview.
