/* eslint-disable @typescript-eslint/no-explicit-any */
import { uniq } from "lodash";
import { Op, Order, WhereOptions } from "sequelize";
import { IPaging } from "src/models/IPaging";
import { LmsUserToken } from "src/models/token.model";
import { buildWhere } from "src/services/util.service";
import { v4 as uuidv4 } from 'uuid';
import { documents, documentsAttributes } from "../models/data-models/documents";
import { studentApiAttributes } from "./student-api-payload";
import { OrgContext } from "src/decorators/org.decorator";
import { andScope, findOwnedDocument } from "./content-scope";

/**
 * Built with the caller's context, every read and write here is limited to the documents in scope (a document of
 * another organisation is reported exactly as an absent one); built without one it is unscoped (the sync payload).
 */
export class DocumentBusiness {
    constructor(private readonly org?: OrgContext) {}

    createdocument = async (document: documentsAttributes, user: LmsUserToken) => {
        document.documentid = uuidv4();
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

        where = { ...buildWhere<documentsAttributes>(paging, where) };
        where = await andScope(this.org, "document", where);

        return await documents.findAndCountAll({ where, order, limit, offset });
    };
    getdocumentname = (documentname: string) => documents.findOne({ where: { documentname, isdeleted: false } });
    // sync payload (student API): see student-api-payload.ts
    getdocuments = () => documents.findAll({ attributes: studentApiAttributes });
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
    isexistsdocumentName = async (document: documentsAttributes) => {
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


    /**
     * Does a live document that is not in scope already hold this name? (Always false for the platform, and for a
     * business class built without a caller.) The name is the document's key in the shared file store.
     */
    isNameHeldByAnother = async (documentname: string) => {
        if (!this.org) {
            return false;
        }
        const where: WhereOptions<documentsAttributes> = { documentname, isdeleted: false };
        const all = await documents.count({ where });
        const own = await documents.count({ where: await andScope(this.org, "document", where) });
        return all > own;
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
