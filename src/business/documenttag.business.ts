/* eslint-disable @typescript-eslint/no-explicit-any */
import { Op, WhereOptions } from "sequelize";
import { IPaging } from "src/models/IPaging";
import { LmsUserToken } from "src/models/token.model";
import { buildWhere } from "src/services/util.service";
import { v4 as uuidv4 } from "uuid";
import {
  documenttags,
  documenttagsAttributes,
} from "../models/data-models/init-models";

export class DocumentTagBusiness {
  createdocumentTag = async (documenttag: documenttagsAttributes, user: LmsUserToken) => {
    documenttag.documenttagid = uuidv4();
    documenttag.isdeleted = false;
    documenttag.created_by = user.lmsuserid;
    documenttag.documenttagname = documenttag.documenttagname
      .trim()
      .toLowerCase();
    return await documenttags.create(documenttag);
  };
  getdocumentTagbyid = (documenttagid: string) =>
    documenttags.findOne({ where: { documenttagid, isdeleted: false } });
  getdocumentTagall = async (paging: IPaging) => {
    let where: WhereOptions<documenttagsAttributes> = {
      isdeleted: false,
    };
    
    const order = ["documenttagname"];
    const limit = paging.pagesize || 20;
    let offset = 0;
    if ((paging.pageindex || 1) > 1) {
      offset = limit * ((paging.pageindex || 1) - 1);
    }
    where = { ...buildWhere<documenttagsAttributes>(paging, where) };

    return await documenttags.findAndCountAll({ where, order, limit, offset });
  };
  getdocumentTagname = (documenttagname: string) =>
    documenttags.findOne({ where: { documenttagname, isdeleted: false } });
  updatedocumentTagName = async (documenttag: documenttagsAttributes, user: LmsUserToken) => {
    const tempdt = await this.getdocumentTagbyid(documenttag.documenttagid);
    if (tempdt) {
      tempdt.documenttagname = documenttag.documenttagname;
      tempdt.updated_by = user.lmsuserid;
      tempdt.updated_at = new Date();
      await tempdt.save({ fields: ["documenttagname", "updated_at", "updated_by"] });
      //await tempdt.reload();
      return tempdt;
    } else {
      return null;
    }
  };
  deletedocumentTag = async (documenttagid: string, user: LmsUserToken) => {
    const tempdt = await this.getdocumentTagbyid(documenttagid);
    if (tempdt) {
      tempdt.isdeleted = true;
      tempdt.deleted_by = user.lmsuserid;
      tempdt.deleted_at = new Date();
      await tempdt.save({ fields: ["isdeleted", "deleted_at", "deleted_by"] });
      return true;
    } else {
      return false;
    }
  };
  isexistsdocumentTagName = async (documenttag: documenttagsAttributes) => {
    const where: WhereOptions<documenttagsAttributes> = {
      documenttagname: documenttag.documenttagname,
      isdeleted: false,
    };
    if ((documenttag.documenttagid ?? "").trim().length > 0) {
      where.documenttagid = {
        [Op.not]: documenttag.documenttagid,
      };
    }
    const tempdt = await documenttags.count({ where });
    return tempdt > 0;
  };

  isexistsdocumentTagID = async (documenttagid: string) => {
    const where: WhereOptions<documenttagsAttributes> = {
      documenttagid,
      isdeleted: false,
    };
    const tempdt = await documenttags.count({ where });
    return tempdt > 0;
  };
}
