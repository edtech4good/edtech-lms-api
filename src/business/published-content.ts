import { Op } from "sequelize";
import { Logger } from "src/config";
import { ApiError } from "src/models/ApiError";
import { curriculumpublications } from "src/models/data-models/curriculumpublications";
import { curriculums } from "src/models/data-models/curriculums";
import { organisations } from "src/models/data-models/organisations";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { CurriculumPayload, Tables } from "./curriculum-publication";
import {
  confine,
  contextOfOrganisation,
  CONTENT_TABLE_KEYS,
  ContentTableKey,
  CURRICULUM_CONTENT_KEYS,
  CurriculumContentKey,
  exportableTranslations,
  keyOf,
  organisationRowOf,
  OrganisationContentPayload,
  readLiveTables,
  Row,
  shapePayload,
  SHAPE,
} from "./organisation-content-export";

/**
 * What the two sync routes serve (docs/content-publishing-design.md, option A, step 2): the PUBLISHED copy of each
 * curriculum, merged, plus the live tables the organisation owns outright. `GET /sync/content` and `POST /sync/cloud` both
 * reach it through `SyncBusiness.syncontentVersion3`; no route serves the live curriculum tables any more. The payload has
 * the shape `buildOrganisationContent` has (format 3, the same keys in the same order).
 *
 * ## Which curricula
 *
 * Every curriculum of the organisation whose LATEST publication (`publishedat`) is `published`. A curriculum that was
 * never published, or whose latest publication is `withdrawn` (retired), is not in the payload, and neither are the rows
 * only it uses (its questions and documents, decision 4); the student side marks it deleted and leaves learner progress
 * alone. The publications are found by the organisation they were made for, but a publication is served only while its
 * live `curriculums` row exists and is not soft-deleted: a curriculum deleted on central after it was published is not
 * served (the student side marks it deleted, as it did when the sync read the live tables), and neither are the rows only
 * it uses; a bank row another served curriculum also uses stays.
 *
 * An organisation with NO published curriculum gets the live tables and every content table empty. The student side then
 * marks every curriculum of the organisation deleted: decision 2's consequence, and the reason the initial publication
 * (`npm run publish:initial`) is run before this ships.
 *
 * ## The merge (decision 8)
 *
 * A bank row (a question, a document) can be in several curricula's publications, and so can a grade that moved from one
 * curriculum to another, and the student side refuses a repeated id. Per table, by primary key (compared without regard
 * to case, as `confine` does), the copy in the NEWEST publication (`publishedat`; a tie, which two curricula published in
 * the same millisecond can make, goes to the larger `publicationid`, so the pick never depends on the order the rows were
 * read in) wins, whole: the winning copy is that publication's row, never a mixture. Publishing curriculum B therefore
 * ships B's copy of a question both share to curriculum A's learners too, which is what the publish summary's `shared` list
 * says.
 *
 * ## Translations (bilingual content, decision 10)
 *
 * A translation is merged WITH its parent row, never by itself: it is taken from the publication that the winning copy of
 * its parent row (`tablename`, `rowid`) was taken from, and from no other. A translation in a publication that lost the
 * parent is dropped, and so is one whose parent is in no publication. The organisation's `contentlanguage` is read live
 * (it belongs to the organisation, not to a curriculum): no translations are sent while it is unset, and none in that
 * language (`exportableTranslations`, as the export does), against the merged questions' templates.
 *
 * ## Then
 *
 * The live tables are read exactly as the export reads them (`readLiveTables`), the whole is passed through `confine`
 * (rows that hang from a row that is not in the payload are left out; a row naming a question, document, subject or
 * country that is not in it refuses the sync, as the export always has) and its id lists are trimmed (`trimIdLists`, which
 * `confine` ends with): `schools.curriculums` and `curriculumbaselines.schoolid` keep only entries that are rows of the
 * merged payload, so a school lists only the curricula that are published.
 *
 * A latest publication whose payload is missing (pruned) is not skipped: that would make the student side delete the
 * curriculum. The retention rule never prunes the latest, so it is a broken store, and the sync is refused (500).
 */

type PublishedLight = { publicationid: string; curriculumid: string; publishedat: Date; status: string };

/** One curriculum's latest publication, whole. */
export interface PublishedSet {
  publicationid: string;
  curriculumid: string;
  publishedat: Date | string;
  payload: CurriculumPayload;
}

const timeOf = (value: Date | string): number => new Date(value).getTime();

/** Newest first wins: later `publishedat`, then the larger `publicationid`. Negative when `a` is older than `b`. */
export const byAge = (a: Pick<PublishedSet, "publishedat" | "publicationid">, b: Pick<PublishedSet, "publishedat" | "publicationid">): number =>
  timeOf(a.publishedat) - timeOf(b.publishedat) || (a.publicationid < b.publicationid ? -1 : a.publicationid > b.publicationid ? 1 : 0);

const NO_ROWS: Row[] = [];

/** The rows of `table` in the set's payload (an absent or malformed table is no rows). */
const rowsOf = (set: PublishedSet, table: CurriculumContentKey): Row[] => {
  const list = (set.payload?.tables as Partial<Record<CurriculumContentKey, Row[]>> | undefined)?.[table];
  return Array.isArray(list) ? list : NO_ROWS;
};

/**
 * The merged curriculum tables of the given publications (see above): per table, one copy of each row, the newest
 * publication's; translations from the publication their parent was taken from. Pure; the rows are not copied. The order
 * of the rows is the order of the publications by curriculum name and id, and within a publication its payload's order, so
 * the same publications give the same bytes whatever order they are passed in.
 */
export const mergePublished = (sets: PublishedSet[]): Tables => {
  const emit = [...sets].sort((a, b) => {
    const name = (s: PublishedSet) => String(rowsOf(s, "curriculums")[0]?.curriculumname ?? "");
    return name(a).localeCompare(name(b)) || (a.curriculumid < b.curriculumid ? -1 : a.curriculumid > b.curriculumid ? 1 : 0);
  });

  // table -> row key -> the publication that wins it
  const winner = new Map<string, Map<string, PublishedSet>>();
  for (const table of CURRICULUM_CONTENT_KEYS) {
    if (table === "contenttranslations") continue;
    const pk = SHAPE[table].pk;
    const won = new Map<string, PublishedSet>();
    for (const set of sets) {
      for (const row of rowsOf(set, table)) {
        const id = keyOf(row[pk]);
        if (id === null) continue;
        const held = won.get(id);
        if (held === undefined || byAge(held, set) < 0) won.set(id, set);
      }
    }
    winner.set(table, won);
  }

  const merged = {} as Tables;
  for (const table of CURRICULUM_CONTENT_KEYS) {
    const out: Row[] = [];
    if (table === "contenttranslations") {
      const poly = SHAPE.contenttranslations.polymorphic;
      if (poly === undefined) throw new Error("published content: translations have no polymorphic parent in the export's shape");
      for (const set of emit) {
        for (const row of rowsOf(set, table)) {
          const parentTable = row[poly.tablefield];
          const parentId = keyOf(row[poly.idfield]);
          if (typeof parentTable !== "string" || parentId === null) continue;
          if (winner.get(parentTable)?.get(parentId) === set) out.push(row);
        }
      }
    } else {
      const pk = SHAPE[table].pk;
      const won = winner.get(table);
      const taken = new Set<string>();
      for (const set of emit) {
        for (const row of rowsOf(set, table)) {
          const id = keyOf(row[pk]);
          if (id === null || won?.get(id) !== set || taken.has(id)) continue;
          taken.add(id);
          out.push(row);
        }
      }
    }
    merged[table] = out;
  }
  return merged;
};

const unreadable = (what: string) =>
  new ApiError(ErrorCode.INTERNAL, `Content can't be sent: ${what} Nothing was sent.`, {
    hint: "A published curriculum's stored copy is missing or does not belong to this organisation. Publish the curriculum again.",
  });

/** The organisation's curricula whose latest publication is `published` and which are live (not deleted), with that publication whole. */
export const readPublishedSets = async (organisationid: string): Promise<PublishedSet[]> => {
  const history = (await curriculumpublications.findAll({
    where: { organisationid },
    attributes: ["publicationid", "curriculumid", "publishedat", "status"],
    order: [["publishedat", "DESC"]],
  })) as unknown as PublishedLight[];
  const latest = new Map<string, PublishedLight>();
  for (const row of history) {
    if (!latest.has(row.curriculumid)) latest.set(row.curriculumid, row);
  }
  const published = [...latest.values()].filter((row) => row.status === "published");
  if (published.length === 0) return [];
  // a curriculum deleted on central after it was published is not served: its live row must exist and not be deleted
  const rowsThere = (await curriculums.findAll({
    where: { organisationid, isdeleted: false, curriculumid: { [Op.in]: published.map((p) => p.curriculumid) } },
    attributes: ["curriculumid"],
  })) as unknown as Array<{ curriculumid: string }>;
  const stillThere = new Set(rowsThere.map((c) => keyOf(c.curriculumid)));
  const live = published.filter((row) => stillThere.has(keyOf(row.curriculumid)));
  if (live.length === 0) return [];
  const rows = (await curriculumpublications.findAll({
    where: { publicationid: { [Op.in]: live.map((l) => l.publicationid) } },
    attributes: ["publicationid", "curriculumid", "publishedat", "payload"],
  })) as unknown as Array<{ publicationid: string; curriculumid: string; publishedat: Date; payload: CurriculumPayload | null }>;
  const byId = new Map(rows.map((r) => [r.publicationid, r]));
  return live.map((light) => {
    const row = byId.get(light.publicationid);
    const payload = row?.payload;
    if (payload === null || payload === undefined || typeof payload !== "object" || typeof payload.tables !== "object" || payload.tables === null) {
      throw unreadable("a published curriculum has no stored copy.");
    }
    if (keyOf(payload.organisationid) !== keyOf(organisationid) || keyOf(payload.curriculumid) !== keyOf(light.curriculumid)) {
      throw unreadable("a published curriculum's stored copy is for another curriculum or organisation.");
    }
    return { publicationid: light.publicationid, curriculumid: light.curriculumid, publishedat: light.publishedat, payload };
  });
};

/**
 * The organisation's content as learners get it: the published copy of each curriculum, merged, plus the live tables
 * (see the top of this file). The same payload shape as `buildOrganisationContent`.
 */
export const buildPublishedOrganisationContent = async (organisation: organisations): Promise<OrganisationContentPayload> => {
  const row = organisationRowOf(organisation);
  const org = contextOfOrganisation(row.organisationid);

  const sets = await readPublishedSets(row.organisationid);
  const content = mergePublished(sets);
  // the translations the student API would refuse are left out, as the export does (the organisation's language is live)
  const translations = exportableTranslations(content.contenttranslations, row.contentlanguage, content.questions);

  const tables: Record<ContentTableKey, Row[]> = {
    ...(await readLiveTables(org)),
    ...content,
    contenttranslations: translations,
  };
  for (const key of CONTENT_TABLE_KEYS) {
    if (tables[key] === undefined) throw new Error(`published content: ${key} is missing`);
  }
  const checked = confine(tables) as Record<ContentTableKey, Row[]>;
  Logger.info(`published content: ${sets.length} published curriculum${sets.length === 1 ? "" : "s"} served for an organisation`);
  return shapePayload(row, checked);
};
