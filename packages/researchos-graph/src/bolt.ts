import neo4j from "neo4j-driver"
import { backendCredentials, type GraphBackendConfig } from "./backend"

export async function checkBoltBackend(config: Exclude<GraphBackendConfig, { backend: "sqlite" }>) {
  const credentials = backendCredentials(config)
  const driver = neo4j.driver(config.uri, credentials ? neo4j.auth.basic(credentials.username, credentials.password) : undefined as never)
  try {
    const info = await driver.getServerInfo()
    return { backend: config.backend, address: info.address, agent: info.agent }
  } finally {
    await driver.close()
  }
}
