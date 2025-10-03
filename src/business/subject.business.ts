/* eslint-disable @typescript-eslint/no-explicit-any */
import { Op, WhereOptions } from "sequelize";
import { IMultiPaging } from "src/models/IPaging";
import { LmsUserToken } from "src/models/token.model";
import { constructWhere } from "src/services/util.service";
import { v4 as uuidv4 } from "uuid";
import {
  curriculums,
  curriculumsAttributes,
  documenttags,
} from "../models/data-models/init-models";
import { subjects, subjectsAttributes } from "src/models/data-models/subjects";

export class SubjectBusiness {
  createsubject = async (subject: subjectsAttributes, user: LmsUserToken) => {
    subject.subjectid = uuidv4();
    subject.isdeleted = false;
    subject.created_by = user.lmsuserid;
    subject.subjectstatus = true;
    return await subjects.create(subject);
  };
  getsubjectbyid = (subjectid: string) =>
    subjects.findOne({ where: { subjectid, isdeleted: false } });
  getsubjectall = async (paging: IMultiPaging) => {
    let where: WhereOptions<subjectsAttributes> = {
      isdeleted: false,
    };

    const order = ["subjectname"];
    const limit = paging.pagesize || 20;
    let offset = 0;
    if ((paging.pageindex || 1) > 1) {
      offset = limit * ((paging.pageindex || 1) - 1);
    }
    where = { ...constructWhere<subjectsAttributes>(paging, where) };

    return await subjects.findAndCountAll({ where, order, limit, offset });
  };
  getdocumentTagname = (documenttagname: string) =>
    documenttags.findOne({ where: { documenttagname, isdeleted: false } });
  updatesubject = async (
    subject: subjectsAttributes,
    user: LmsUserToken
  ) => {
    const tempdt = await this.getsubjectbyid(subject.subjectid);
    if (tempdt) {
      tempdt.subjectname = subject.subjectname;
      tempdt.subjectdescription = subject.subjectdescription;
      tempdt.updated_by = user.lmsuserid;
      tempdt.updated_at = new Date();
      await tempdt.save({
        fields: ["subjectname", "subjectdescription", "updated_at", "updated_by"],
      });
      //await tempdt.reload();
      return tempdt;
    } else {
      return null;
    }
  };
  deletesubject = async (subjectid: string, user: LmsUserToken) => {
    const tempdt = await this.getsubjectbyid(subjectid);
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
  isexistssubjectName = async (subject: subjectsAttributes) => {
    const where: WhereOptions<subjectsAttributes> = {
      subjectname: subject.subjectname,
      isdeleted: false,
    };
    if ((subject.subjectid ?? "").trim().length > 0) {
      where.subjectid = {
        [Op.not]: subject.subjectid,
      };
    }
    const tempdt = await subjects.count({ where });
    return tempdt > 0;
  };

  isexistssubjectID = async (subjectid: string) => {
    const where: WhereOptions<subjectsAttributes> = {
      subjectid,
      isdeleted: false,
    };
    const tempdt = await subjects.count({ where });
    return tempdt > 0;
  };
  getSubjects = async () => {
    const where: WhereOptions<subjectsAttributes> = {
      //isdeleted: false,
    };
    const order = ["subjectname"];

    return await subjects.findAll({ where, order });
  };
  subjectbindtocurriculum = async (subjectid: string) => {
    const where: WhereOptions<curriculumsAttributes> = {
      isdeleted: false,
      curriculumstatus: true,
      subjectid
    };

    return await curriculums.findOne({ where });
  }
}
