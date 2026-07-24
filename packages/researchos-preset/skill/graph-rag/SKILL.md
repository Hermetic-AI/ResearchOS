---
name: graph-rag
description: Graph RAG methodology — retrieve relevant subgraph via vector similarity then expand via k-hop traversal to answer research questions grounded in the knowledge graph.
version: 1.0.0
---

# Graph RAG Skill

## Goal

Answer research questions by retrieving relevant nodes from the knowledge graph using a two-stage process: vector similarity search followed by k-hop subgraph expansion.

## Workflow

1. Convert the user query to a vector embedding.
2. Search the node vector index for the top-K semantically similar nodes.
3. Expand from each candidate node via k-hop traversal (default: k=2).
4. Collect all nodes and edges in the expanded subgraph.
5. Package the subgraph context (node labels, types, edge relations) into a compact prompt.
6. Generate an answer grounded in the retrieved subgraph, citing source nodes.

## Configuration

- Default k-hop depth: 2
- Default top-K: 5
- Edge traversal directions: both incoming and outgoing

## Tips

- Narrow queries work best (specific concepts, papers, or methods).
- For broad questions ("summarize this field"), use `literature_search` first, then narrow with Graph RAG.
