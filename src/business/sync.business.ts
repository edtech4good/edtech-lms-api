import { organisations } from "src/models/data-models/organisations";
import { buildOrganisationContent } from "./organisation-content-export";

export class SyncBusiness {
  // One organisation's content in the format the student API reads (format 3): see organisation-content-export.ts.
  syncontentVersion3 = async (organisation: organisations) =>
    JSON.stringify(await buildOrganisationContent(organisation));
}
