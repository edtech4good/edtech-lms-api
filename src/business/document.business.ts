/* eslint-disable @typescript-eslint/no-explicit-any */
import { uniq } from "lodash";
import { Op, Order, WhereOptions } from "sequelize";
import { IPaging } from "src/models/IPaging";
import { LmsUserToken } from "src/models/token.model";
import { buildWhere } from "src/services/util.service";
import { v4 as uuidv4 } from 'uuid';
import { documents, documentsAttributes } from "../models/data-models/documents";
export class DocumentBusiness {
    createdocument = async (document: documentsAttributes, user: LmsUserToken) => {
        document.documentid = uuidv4();
        document.isdeleted = false;
        document.created_by = user.lmsuserid;
        return await documents.create(document);
    };
    getdocumentbyid = (documentid: string) => documents.findOne({ where: { documentid, isdeleted: false } });
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

        return await documents.findAndCountAll({ where, order, limit, offset });
    };
    getdocumentname = (documentname: string) => documents.findOne({ where: { documentname, isdeleted: false } });
    getdocuments = () => documents.findAll({});
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
        const tempdt = await documents.count({ where });
        return tempdt > 0;
    };


    isexistsdocumentID = async (documentid: string) => {
        const where: WhereOptions<documentsAttributes> = {
            documentid,
            isdeleted: false
        }
        const tempdt = await documents.count({ where });
        return tempdt > 0;
    };

}
