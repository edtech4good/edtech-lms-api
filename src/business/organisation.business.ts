import { Op, Transaction, WhereOptions } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { LmsUserToken } from "src/models/token.model";
import { dbinstance, rollbackQuietly } from "src/services/dbservice";
import { countries } from "../models/data-models/countries";
import {
  organisations,
  organisationsAttributes,
} from "../models/data-models/organisations";
import { organisationcountry } from "../models/data-models/organisationcountry";

export interface OrganisationCountryView {
  countryid: string;
  countryname: string;
}

/** An organisation as the API returns it: the row plus its live linked countries. */
export type OrganisationView = Omit<
  organisationsAttributes,
  "organisationstatus" | "uitheme" | "isdeleted"
> & {
  organisationstatus: boolean;
  uitheme: string;
  isdeleted: boolean;
  countries: OrganisationCountryView[];
};

export interface OrganisationPaging {
  pageindex?: number;
  pagesize?: number;
  /** Substring match on the name; case-insensitive by the column's collation. */
  organisationname?: string;
}

/** The only keys `brandingconfig` may hold. */
export interface OrganisationBranding {
  logourl?: string;
  displayname?: string;
  tilecolour?: string;
}

const hasOwn = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);

/**
 * Builds the branding that is STORED from the three named keys, reading each
 * one explicitly. It never spreads, copies or iterates the incoming object, so
 * whatever else it carries - an own `__proto__` key from `JSON.parse`, extra
 * keys, a huge payload - cannot reach the database, even if validation upstream
 * were bypassed. `undefined` means "not given" (leave unchanged), `null` means
 * "clear".
 */
export const pickBranding = (raw: unknown): OrganisationBranding | null | undefined => {
  if (raw === undefined || raw === null) {
    return raw;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ApiError(ErrorCode.INVALID_INPUT, "Some of the information isn't valid.", {
      fields: [{ field: "brandingconfig", message: "Branding isn't valid." }],
    });
  }
  const out: OrganisationBranding = {};
  const source = raw as Record<string, unknown>;
  if (hasOwn(source, "logourl") && typeof source.logourl === "string") {
    out.logourl = source.logourl;
  }
  if (hasOwn(source, "displayname") && typeof source.displayname === "string") {
    out.displayname = source.displayname.trim();
  }
  if (hasOwn(source, "tilecolour") && typeof source.tilecolour === "string") {
    out.tilecolour = source.tilecolour;
  }
  return out;
};

export interface NewOrganisation {
  organisationname: string;
  organisationcode: string;
  organisationshortname: string;
  organisationpreset: string;
  uitheme?: string;
  brandingconfig?: OrganisationBranding | null;
}

/**
 * What an update may change. `organisationcode` and `organisationpreset` are
 * deliberately not here, and `settingsconfig` is not either: they are not
 * writable in this package. `save({ fields })` below is built from this list,
 * so even a caller that smuggles them in cannot persist them.
 */
export interface OrganisationChanges {
  organisationname: string;
  organisationshortname: string;
  uitheme?: string;
  brandingconfig?: OrganisationBranding | null;
  organisationstatus?: boolean;
}

/** What the list returns: every column but `settingsconfig` (the full row is for GET by id). */
const LIST_COLUMNS: Array<keyof organisationsAttributes> = [
  "organisationid",
  "organisationname",
  "organisationcode",
  "organisationshortname",
  "organisationpreset",
  "organisationstatus",
  "uitheme",
  "brandingconfig",
  "isdeleted",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "deleted_at",
  "deleted_by",
];

const notFound = () =>
  new ApiError(ErrorCode.NOT_FOUND, "That organisation doesn't exist.");

const countriesInvalid = () =>
  new ApiError(ErrorCode.INVALID_INPUT, "Some of the information isn't valid.", {
    fields: [
      {
        field: "countryids",
        message: "Choose countries that exist, each only once.",
      },
    ],
  });

/** Escapes the LIKE wildcards so a typed `%` or `_` matches itself. */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

export class OrganisationBusiness {
  /**
   * Live (not deleted) organisations, one page, each with its live linked
   * countries. Paging follows the other list endpoints: `pageindex` is 1-based
   * (0 and 1 both mean the first page) and `pagesize` defaults to 20.
   */
  getorganisationall = async (paging: OrganisationPaging) => {
    const limit = paging.pagesize || 20;
    const pageindex = Math.max(paging.pageindex || 1, 1);
    const offset = limit * (pageindex - 1);

    const where: WhereOptions<organisationsAttributes> = { isdeleted: false };
    const search = (paging.organisationname ?? "").trim();
    if (search.length > 0) {
      where.organisationname = { [Op.like]: `%${escapeLike(search)}%` };
    }

    // Two steps, so the sort never carries wide columns. Step 1 orders and
    // pages ids only (name and id are scalars; the name has its own index).
    // Step 2 fetches those rows with an explicit column list - never
    // `settingsconfig`, which the list has no use for - and no ORDER BY. A row
    // with a large JSON value in the sort made MySQL run out of sort memory.
    const page = await organisations.findAndCountAll({
      attributes: ["organisationid"],
      where,
      order: [
        ["organisationname", "ASC"],
        ["organisationid", "ASC"],
      ],
      limit,
      offset,
    });
    const ids = page.rows.map((r) => r.organisationid);
    const found =
      ids.length === 0
        ? []
        : await organisations.findAll({
            attributes: LIST_COLUMNS,
            where: { organisationid: { [Op.in]: ids } },
          });
    const byId = new Map(found.map((r) => [r.organisationid, r]));
    const rows = ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    const linked = await this.countriesFor(ids);
    return {
      rows: rows.map((r) => this.toView(r, linked.get(r.organisationid) ?? [])),
      count: page.count,
      pageindex,
      pagesize: limit,
    };
  };

  /** One live organisation, or a NOT_FOUND (404) for a missing or deleted one. */
  getorganisationbyid = async (
    organisationid: string,
    transaction?: Transaction,
  ): Promise<OrganisationView> => {
    const row = await organisations.findOne({
      where: { organisationid, isdeleted: false },
      transaction,
    });
    if (!row) {
      throw notFound();
    }
    const linked = await this.countriesFor([organisationid], transaction);
    return this.toView(row, linked.get(organisationid) ?? []);
  };

  /**
   * The organisation and its country links are written in ONE transaction: if
   * the links fail, no organisation row is left behind.
   */
  createorganisation = async (
    input: NewOrganisation,
    countryids: string[],
    user: LmsUserToken,
  ): Promise<OrganisationView> => {
    const tnx = await dbinstance.getdbinstance().transaction();
    let organisationid: string;
    try {
      await this.assertCountriesUsable(countryids, tnx);
      organisationid = uuidv4();
      const attributes: organisationsAttributes = {
        organisationid,
        organisationname: input.organisationname,
        organisationcode: input.organisationcode,
        organisationshortname: input.organisationshortname,
        organisationpreset: input.organisationpreset,
        isdeleted: false,
        created_by: user.lmsuserid,
      };
      // Left to the column defaults when absent: uitheme 'kids', branding null.
      if (input.uitheme !== undefined) attributes.uitheme = input.uitheme;
      const branding = pickBranding(input.brandingconfig);
      if (branding !== undefined) attributes.brandingconfig = branding;
      await organisations.create(attributes, { transaction: tnx });
      await organisationcountry.bulkCreate(
        countryids.map((countryid) => ({
          organisationcountryid: uuidv4(),
          organisationid,
          countryid,
        })),
        { transaction: tnx },
      );
      await tnx.commit();
    } catch (error) {
      await rollbackQuietly(tnx);
      throw error;
    }
    return this.getorganisationbyid(organisationid);
  };

  /**
   * Updates the editable fields and REPLACES the country set, in one
   * transaction. The row is locked first, so two concurrent updates of the same
   * organisation run one after the other.
   */
  updateorganisation = async (
    organisationid: string,
    changes: OrganisationChanges,
    countryids: string[],
    user: LmsUserToken,
  ): Promise<OrganisationView> => {
    const tnx = await dbinstance.getdbinstance().transaction();
    try {
      const row = await organisations.findOne({
        where: { organisationid, isdeleted: false },
        transaction: tnx,
        lock: Transaction.LOCK.UPDATE,
      });
      if (!row) {
        throw notFound();
      }

      await this.assertCountriesUsable(countryids, tnx);
      const fields: Array<keyof organisationsAttributes> = [
        "organisationname",
        "organisationshortname",
        "updated_at",
        "updated_by",
      ];
      row.organisationname = changes.organisationname;
      row.organisationshortname = changes.organisationshortname;
      if (changes.uitheme !== undefined) {
        row.uitheme = changes.uitheme;
        fields.push("uitheme");
      }
      const branding = pickBranding(changes.brandingconfig);
      if (branding !== undefined) {
        row.brandingconfig = branding;
        fields.push("brandingconfig");
      }
      if (changes.organisationstatus !== undefined) {
        row.organisationstatus = changes.organisationstatus;
        fields.push("organisationstatus");
      }
      row.updated_at = new Date();
      row.updated_by = user.lmsuserid;
      await row.save({ fields, transaction: tnx });

      const current = await organisationcountry.findAll({
        where: { organisationid },
        transaction: tnx,
      });
      const wanted = new Set(countryids);
      const have = new Set(current.map((c) => c.countryid));
      const removeids = current
        .filter((c) => !wanted.has(c.countryid))
        .map((c) => c.organisationcountryid);
      if (removeids.length > 0) {
        await organisationcountry.destroy({
          where: { organisationcountryid: { [Op.in]: removeids } },
          transaction: tnx,
        });
      }
      const add = countryids.filter((id) => !have.has(id));
      if (add.length > 0) {
        await organisationcountry.bulkCreate(
          add.map((countryid) => ({
            organisationcountryid: uuidv4(),
            organisationid,
            countryid,
          })),
          { transaction: tnx },
        );
      }
      await tnx.commit();
    } catch (error) {
      await rollbackQuietly(tnx);
      throw error;
    }
    return this.getorganisationbyid(organisationid);
  };

  /**
   * Soft delete. One conditional UPDATE, so it is atomic and a second delete of
   * the same organisation is a NOT_FOUND rather than a silent success. The row
   * keeps its code (never reissued) and its country links; only the name is
   * released, by the live-only unique index.
   */
  deleteorganisation = async (organisationid: string, user: LmsUserToken) => {
    const [affected] = await organisations.update(
      { isdeleted: true, deleted_at: new Date(), deleted_by: user.lmsuserid },
      { where: { organisationid, isdeleted: false } },
    );
    if (affected === 0) {
      throw notFound();
    }
    return true;
  };

  /**
   * Is this name taken by another LIVE organisation? The comparison is made by
   * MySQL through the column's collation (utf8mb4_0900_as_ci), which is the very
   * comparison the live-name unique index makes: case-insensitive, but Khmer
   * marks (bantoc, nikahit, musikatoan) are significant. Nothing here lowercases
   * or normalises in JavaScript, so the check and the index cannot disagree.
   */
  isexistsorganisationname = async (organisationname: string, excludeid?: string) => {
    const where: WhereOptions<organisationsAttributes> = {
      organisationname,
      isdeleted: false,
    };
    if (excludeid) {
      where.organisationid = { [Op.ne]: excludeid };
    }
    return (await organisations.count({ where })) > 0;
  };

  /** Is this code taken by ANY organisation, deleted ones included? */
  isexistsorganisationcode = async (organisationcode: string) =>
    (await organisations.count({ where: { organisationcode } })) > 0;

  /** The ids in `countryids` that are not live countries. */
  findunusablecountries = async (countryids: string[]) => {
    if (countryids.length === 0) {
      return [];
    }
    const found = await countries.findAll({
      attributes: ["countryid"],
      where: { countryid: { [Op.in]: countryids }, isdeleted: false },
    });
    const ok = new Set(found.map((c) => c.countryid));
    return countryids.filter((id) => !ok.has(id));
  };

  /**
   * Inside the write transaction: every id is a live country and none is
   * repeated. The countries are read with a shared lock, so a concurrent
   * soft-delete of one of them waits until this transaction ends - the
   * request-level rule that checked the same thing earlier cannot be stale by
   * the time the links are written.
   */
  private assertCountriesUsable = async (countryids: string[], tnx: Transaction) => {
    const distinct = new Set(countryids);
    if (countryids.length === 0 || distinct.size !== countryids.length) {
      throw countriesInvalid();
    }
    const found = await countries.findAll({
      attributes: ["countryid"],
      where: { countryid: { [Op.in]: countryids }, isdeleted: false },
      transaction: tnx,
      lock: Transaction.LOCK.SHARE,
    });
    if (found.length !== distinct.size) {
      throw countriesInvalid();
    }
  };

  /** Live linked countries for each of the organisations, one query. */
  private countriesFor = async (organisationids: string[], transaction?: Transaction) => {
    const byOrganisation = new Map<string, OrganisationCountryView[]>();
    if (organisationids.length === 0) {
      return byOrganisation;
    }
    const links = await organisationcountry.findAll({
      where: { organisationid: { [Op.in]: organisationids } },
      include: [
        {
          model: countries,
          as: "country",
          required: true,
          attributes: ["countryid", "countryname"],
          where: { isdeleted: false },
        },
      ],
      transaction,
    });
    for (const link of links) {
      const list = byOrganisation.get(link.organisationid) ?? [];
      list.push({
        countryid: link.country.countryid,
        countryname: link.country.countryname,
      });
      byOrganisation.set(link.organisationid, list);
    }
    for (const list of byOrganisation.values()) {
      list.sort((a, b) => a.countryname.localeCompare(b.countryname) || a.countryid.localeCompare(b.countryid));
    }
    return byOrganisation;
  };

  private toView = (
    row: organisations,
    linked: OrganisationCountryView[],
  ): OrganisationView => ({
    ...(row.get({ plain: true }) as Omit<OrganisationView, "countries">),
    countries: linked,
  });
}
