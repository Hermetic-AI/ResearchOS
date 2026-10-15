# ResearchOS graph backends

SQLite is the default backend and stores the local graph at `.researchos/graph/graph.db`.
It needs no Docker service. Neo4j, Memgraph, and TuGraph are optional server backends.

## Start a backend

```powershell
docker compose -f docker-compose.researchos.yml --profile neo4j up -d
docker compose -f docker-compose.researchos.yml --profile memgraph up -d
docker compose -f docker-compose.researchos.yml --profile tugraph up -d
```

Only start one profile at a time because each exposes Bolt on port `7687`.
Use a different host port when running more than one backend.

## Project configuration

Create `.opencode/researchos.json` in the project:

```jsonc
{
  "graph": {
    "backend": "sqlite"
  }
}
```

For a server backend, configure the URI and refer to credentials only through environment variable names:

```jsonc
{
  "graph": {
    "backend": "neo4j",
    "uri": "bolt://127.0.0.1:7687",
    "database": "neo4j",
    "usernameEnv": "RESEARCHOS_NEO4J_USER",
    "passwordEnv": "RESEARCHOS_NEO4J_PASSWORD"
  }
}
```

The source files remain authoritative. Switching a backend must export/import and verify nodes, edges, and source hashes before it changes the active backend.
