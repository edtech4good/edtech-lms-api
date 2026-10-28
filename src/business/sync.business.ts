import { organisations } from "src/models/data-models/organisations";
import { buildPublishedOrganisationContent } from "./published-content";

export class SyncBusiness {
  // One organisation's content in the format the student API reads (format 3): the PUBLISHED copy of each of its
  // curricula, merged, with the live tables it owns outright. See published-content.ts. Both sync routes (GET sync/content
  // and POST sync/cloud) call this and nothing else: no route serves the live curriculum tables.
  syncontentVersion3 = async (organisation: organisations) =>
    JSON.stringify(await buildPublishedOrganisationContent(organisation));
}
