/* eslint-disable @typescript-eslint/no-explicit-any */
import { Op, WhereOptions } from "sequelize";
import { IPaging } from "src/models/IPaging";
import { LmsUserToken } from "src/models/token.model";
import { buildWhere } from "src/services/util.service";
import { v4 as uuidv4 } from "uuid";
import {
  questiontags,
  questiontagsAttributes,
} from "../models/data-models/init-models";

export class QuestionTagBusiness {
  createquestionTag = async (questiontag: questiontagsAttributes, user: LmsUserToken) => {
    questiontag.questiontagid = uuidv4();
    questiontag.isdeleted = false;
    questiontag.created_by = user.lmsuserid;
    questiontag.questiontagname = questiontag.questiontagname
      .trim()
      .toLowerCase();
    return await questiontags.create(questiontag);
  };
  getquestionTagbyid = (questiontagid: string) =>
    questiontags.findOne({ where: { questiontagid, isdeleted: false } });
  getquestionTagall = async (paging: IPaging) => {
    let where: WhereOptions<questiontagsAttributes> = {
      isdeleted: false,
    };
    const order = ["questiontagname"];
    const limit = paging.pagesize || 20;
    let offset = 0;
    if ((paging.pageindex || 1) > 1) {
      offset = limit * ((paging.pageindex || 1) - 1);
    }
    where = { ...buildWhere<questiontagsAttributes>(paging, where) };

    return await questiontags.findAndCountAll({ where, order, limit, offset });
  };
  getquestionTagname = (questiontagname: string) =>
    questiontags.findOne({ where: { questiontagname, isdeleted: false } });
  updatequestionTagName = async (questiontag: questiontagsAttributes, user: LmsUserToken) => {
    const tempdt = await this.getquestionTagbyid(questiontag.questiontagid);
    if (tempdt) {
      tempdt.questiontagname = questiontag.questiontagname;
      tempdt.updated_at = new Date();
      tempdt.updated_by = user.lmsuserid;
      await tempdt.save({ fields: ["questiontagname", "updated_at", "updated_by"] });
      //await tempdt.reload();
      return tempdt;
    } else {
      return null;
    }
  };
  deletequestionTag = async (questiontagid: string, user: LmsUserToken) => {
    const tempdt = await this.getquestionTagbyid(questiontagid);
    if (tempdt) {
      tempdt.isdeleted = true;
      tempdt.deleted_at = new Date();
      tempdt.deleted_by = user.lmsuserid;
      await tempdt.save({ fields: ["isdeleted", "deleted_at", "deleted_by"] });
      return true;
    } else {
      return false;
    }
  };
  isexistsquestionTagName = async (questiontag: questiontagsAttributes) => {
    const where: WhereOptions<questiontagsAttributes> = {
      questiontagname: questiontag.questiontagname,
      isdeleted: false,
    };
    if ((questiontag.questiontagid ?? "").trim().length > 0) {
      where.questiontagid = { [Op.not]: questiontag.questiontagid };
    }
    const tempdt = await questiontags.count({ where });
    return tempdt > 0;
  };

  isexistsquestionTagID = async (questiontagid: string) => {
    const where: WhereOptions<questiontagsAttributes> = {
      questiontagid,
      isdeleted: false,
    };
    const tempdt = await questiontags.count({ where });
    return tempdt > 0;
  };
}
