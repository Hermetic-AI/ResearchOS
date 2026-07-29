import { arxivAdapter } from "./adapters/arxiv"
import { crossrefAdapter } from "./adapters/crossref"
import { pubmedAdapter } from "./adapters/pubmed"
import { semanticScholarAdapter, semanticScholarCitationsAdapter } from "./adapters/semantic-scholar"
import { HubImpl, type HubOptions } from "./hub"

export function createAcademicHub(options: HubOptions = {}) {
  const hub = new HubImpl(options)
  hub.register(arxivAdapter)
  hub.register(crossrefAdapter)
  hub.register(semanticScholarAdapter)
  hub.register(semanticScholarCitationsAdapter)
  hub.register(pubmedAdapter)
  return hub
}
