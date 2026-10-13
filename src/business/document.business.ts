/* eslint-disable @typescript-eslint/no-explicit-any */
import { uniq } from "lodash";
import { cast, col, fn, Op, Order, where as sqlWhere, WhereOptions } from "sequelize";
import { IFilter, IPaging } from "src/models/IPaging";
import { LmsUserToken } from "src/models/token.model";
import { buildWhere } from "src/services/util.service";
import { v4 as uuidv4 } from 'uuid';
import { documents, documentsAttributes } from "../models/data-models/documents";
import { OrgContext } from "src/decorators/org.decorator";
import { andScope, findOwnedDocument } from "./content-scope";
import { DocumentMetadata } from "./document-media";
import { andOrganisation, extractOrganisationFilter } from "./row-owner";

/** The filter values that name a title as well as a key: `documentname` matches either (the key of a new upload is a uuid). */
const parts = (value: string): string[] => value.split(",").map((v) => v.trim());

/** The escape character of a tag search: `%`, `_` and itself are written literally into the pattern. */
export const TAG_ESCAPE = "!";
/** A tag filter value as a pattern that finds it anywhere inside a tag, with every character in it taken literally. */
export const tagPattern = (value: string): string => `%${value.replace(/[!%_]/g, "!$&")}%`;

/**
 * The document list's filters. `documentname` matches the key or the title (every comma-separated part must match one of
 * them); `documenttypeid` is an exact match on one id or a comma-separated list of ids (a substring match would return
 * type 10 for type 1); `documenttags` is a JSON list of text, so each comma-separated part must be found inside one of
 * its tags, whatever the case (a `LIKE` on a JSON column is compared against the JSON text, with its quotes, and never
 * matches; `JSON_SEARCH` alone is case-sensitive, so MySQL lowers the stored list and the pattern both); every other
 * filter keeps the shared substring behaviour.
 */
export const documentFilterWhere = (filter: IFilter[] | undefined): { and: WhereOptions<documentsAttributes>[]; others: IFilter[] } => {
  const and: WhereOptions<documentsAttributes>[] = [];
  const others: IFilter[] = [];
  for (const f of filter ?? []) {
    if (f.key === "documentname" && f.value) {
      for (const part of parts(f.value)) {
        and.push({ [Op.or]: [{ documentname: { [Op.like]: `%${part}%` } }, { documenttitle: { [Op.like]: `%${part}%` } }] });
      }
    } else if (f.key === "documenttags" && f.value) {
      for (const part of parts(f.value)) {
        and.push(sqlWhere(fn("JSON_SEARCH", fn("LOWER", cast(col("documenttags"), "CHAR")), "one", fn("LOWER", tagPattern(part)), TAG_ESCAPE), { [Op.ne]: null }));
      }
    } else if (f.key === "documenttypeid" && f.value) {
      const ids = parts(f.value).map((v) => Number(v));
      and.push({ documenttypeid: { [Op.in]: ids.filter((n) => Number.isInteger(n)) } });
    } else {
      others.push(f);
    }
  }
  return { and, others };
};

/**
 * Built with the caller's context, every read and write here is limited to the documents in scope (a document of
 * another organisation is reported exactly as an absent one); built without one it is unscoped (the sync payload).
 */
export class DocumentBusiness {
    constructor(private readonly org?: OrgContext) {}

    createdocument = async (document: documentsAttributes, user: LmsUserToken) => {
        // the upload generates the id first (it is part of the stored key); every other caller lets it be made here
        if (!document.documentid) {
            document.documentid = uuidv4();
        }
        document.isdeleted = false;
        document.created_by = user.lmsuserid;
        return await documents.create(document);
    };
    getdocumentbyid = (documentid: string) =>
        this.org
            ? findOwnedDocument(this.org, documentid, { where: { isdeleted: false } })
            : documents.findOne({ where: { documentid, isdeleted: false } });
    getdocumentall = async (paging: IPaging) => {
        let where: WhereOptions<documentsAttributes> = {
            isdeleted: false,
        }
        const order: Order = [["lastupdated", "DESC"]];
        const limit = (paging.pagesize || 20);
        let offset = 0;
        if ((paging.pageindex || 1) > 1) {
            offset = (limit * ((paging.pageindex || 1) - 1));
        }

        const { organisationid, rest: withoutOrganisation } = extractOrganisationFilter(paging.filter);
        const { and, others } = documentFilterWhere(withoutOrganisation);
        where = { ...buildWhere<documentsAttributes>({ ...paging, filter: others }, where) };
        if (and.length > 0) {
            where = { ...where, [Op.and]: [...((where as { [Op.and]?: WhereOptions<documentsAttributes>[] })[Op.and] ?? []), ...and] };
        }
        where = await andScope(this.org, "document", where);
        where = await andOrganisation(where, "document", organisationid);

        return await documents.findAndCountAll({ where, order, limit, offset });
    };
    /** The title, licence and attribution only: never the file, the key, the type, the tags or the owner. */
    updatemetadata = async (documentid: string, values: DocumentMetadata, user: LmsUserToken) => {
        const document = await this.getdocumentbyid(documentid);
        if (!document) {
            return false;
        }
        const fields: Array<keyof documentsAttributes> = [];
        for (const key of ["documenttitle", "documentlicence", "documentattribution"] as const) {
            if (values[key] !== undefined) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (document as any)[key] = values[key];
                fields.push(key);
            }
        }
        document.lastupdated = new Date();
        document.updated_at = new Date();
        document.updated_by = user.lmsuserid;
        await document.save({ fields: [...fields, "lastupdated", "updated_at", "updated_by"] as Array<keyof documentsAttributes> });
        return true;
    };
    getdocumentname = (documentname: string) => documents.findOne({ where: { documentname, isdeleted: false } });
    // The organisation payload (format 3): whole rows, the owner included, for the documents in scope.
    getdocumentsWithOwner = async () => documents.findAll({ where: await andScope(this.org, "document") });
    deletedocument = async (documentid: string, user: LmsUserToken) => {
        const tempdt = await this.getdocumentbyid(documentid);
        if (tempdt) {
            tempdt.isdeleted = true;
            tempdt.deleted_at = new Date();
            tempdt.deleted_by = user.lmsuserid;
            await tempdt.save({ fields: ['isdeleted', 'deleted_at', 'deleted_by'] });
            return true;
        } else {
            return false;
        }
    };

    adddocumentTag = async (documentid: string, tag: string, user: LmsUserToken) => {
        const tempdt = await this.getdocumentbyid(documentid);
        if (tempdt) {
            tempdt.isdeleted = true;
            const temptags: Array<string> = (<Array<string>>tempdt.documenttags) || [];
            tempdt.documenttags = [...temptags, tag];
            tempdt.documenttags = uniq(<Array<string>>tempdt.documenttags);
            tempdt.lastupdated = new Date();
            tempdt.updated_at = new Date();
            tempdt.updated_by = user.lmsuserid;
            await tempdt.save({ fields: ['documenttags', 'lastupdated', 'updated_at', 'updated_by'] });
            return true;
        } else {
            return false;
        }
    };

    deletedocumentTag = async (documentid: string, tag: string, user: LmsUserToken) => {
        const tempdt = await this.getdocumentbyid(documentid);
        if (tempdt) {
            tempdt.isdeleted = true;
            const temptags: Array<string> = (<Array<string>>tempdt.documenttags) || [];
            tempdt.documenttags = [...temptags, tag];
            tempdt.documenttags = (<Array<string>>tempdt.documenttags).filter(x => x !== tag);
            tempdt.lastupdated = new Date();
            tempdt.updated_at = new Date();
            tempdt.updated_by = user.lmsuserid;
            await tempdt.save({ fields: ['documenttags', 'lastupdated', 'updated_at', 'updated_by'] });
            return true;
        } else {
            return false;
        }
    };
    isexistsdocumentName = async (document: Omit<documentsAttributes, "organisationid">) => {
        const where: WhereOptions<documentsAttributes> = {
            documentname: document.documentname,
            isdeleted: false
        }
        if ((document.documentid ?? "").trim().length > 0) {
            where.documentid =
            {
                [Op.not]: document.documentid
            }
        }
        // A file's name is its key in the one file store every organisation shares, so a name is unique across all of
        // them (never limited to the caller's documents): a second file of the same name would overwrite the first.
        const tempdt = await documents.count({ where });
        return tempdt > 0;
    };


    isexistsdocumentID = async (documentid: string) => {
        const where: WhereOptions<documentsAttributes> = {
            documentid,
            isdeleted: false
        }
        const tempdt = await documents.count({ where: await andScope(this.org, "document", where) });
        return tempdt > 0;
    };

}
