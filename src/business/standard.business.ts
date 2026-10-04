/* eslint-disable @typescript-eslint/no-explicit-any */
import { Op, WhereOptions } from "sequelize";
import { LmsUserToken } from "src/models/token.model";
import { constructWhere } from "src/services/util.service";
import { v4 as uuidv4 } from "uuid";
import {
  standards,
  standardsAttributes,
  students,
} from "../models/data-models/init-models";
import { StudentBusiness } from "./student.business";
import { schools } from '../models/data-models/school';
import { IMultiPaging } from '../models/IPaging';
import { dbinstance, rollbackQuietly } from "src/services/dbservice";
import { OrgContext } from "src/decorators/org.decorator";
import { andInOwnedSchools, findOwnedSchool, findOwnedStandard, requireOwnedSchoolById } from "./school-scope";

export class StandardBusiness {
  // A class carries a copy of its school's name. The school is read inside the
  // transaction under a shared lock (see school-identity.ts), so a rename of the
  // school cannot commit between this read and the insert, and the class stores
  // the school's own current name.
  createstandard = async (standard: standardsAttributes, user: LmsUserToken, org: OrgContext) => {
    standard.standardid = uuidv4();
    standard.isdeleted = false;
    standard.created_by = user.lmsuserid;
    const transaction = await dbinstance.getdbinstance().transaction();
    try {
      // The school must be one of the caller's (unknown or not theirs: 404).
      const school = await requireOwnedSchoolById(org, standard.schoolid, transaction);
      standard.schoolname = school.schoolname;
      const created = await standards.create(standard, { transaction });
      await transaction.commit();
      return created;
    } catch (e) {
      await rollbackQuietly(transaction);
      throw e;
    }
  };
  getstandardbyid = (standardid: string) =>
    standards.findOne({ where: { standardid, isdeleted: false } });

  getstandardall = async (paging: IMultiPaging, org: OrgContext) => {
    let where: WhereOptions<standardsAttributes> = {
      isdeleted: false,
    };

    const order = ["standardname"];
    const limit = paging.pagesize || 20;
    let offset = 0;
    if ((paging.pageindex || 1) > 1) {
      offset = limit * ((paging.pageindex || 1) - 1);
    }
    // The caller's schools are ANDed on the outside: a filter (which builds its own `Op.and`) cannot replace them.
    where = await andInOwnedSchools({ ...constructWhere<standardsAttributes>(paging, where) }, org);

    return await standards.findAndCountAll({ where, order, limit, offset,
      include: [
      {
        model: schools,
        required: false,
        attributes: ["schoolname"],
      },
    ], 
  });
  };
  getstandardname = (standardname: string) =>
    standards.findOne({ where: { standardname, isdeleted: false } });
  updatestandardName = async (standard: standardsAttributes, user: LmsUserToken, org: OrgContext) => {
    // The class must be one of the caller's, and so must the school it is moved to (404 otherwise).
    const tempdt = await findOwnedStandard(org, standard.standardid);
    tempdt.standardname = standard.standardname;
    tempdt.schoolid = standard.schoolid;
    tempdt.updated_at = new Date();
    tempdt.updated_by = user.lmsuserid;
    const transaction = await dbinstance.getdbinstance().transaction();
    try {
      const school = await requireOwnedSchoolById(org, standard.schoolid, transaction);
      tempdt.schoolname = school.schoolname;
      await tempdt.save({ fields: ["standardname", "updated_at", "updated_by", "schoolid", "schoolname"], transaction });
      await transaction.commit();
    } catch (e) {
      await rollbackQuietly(transaction);
      throw e;
    }
    return tempdt;
  };
  deletestandard = async (standardid: string, user: LmsUserToken, org: OrgContext) => {
    const tempdt = await findOwnedStandard(org, standardid);
    tempdt.isdeleted = true;
    tempdt.deleted_at = new Date();
    tempdt.deleted_by = user.lmsuserid;
    await tempdt.save({ fields: ["isdeleted", "deleted_at", "deleted_by"] });
    return true;
  };
  isexistsstandardName = async (standard: standardsAttributes) => {
    const where: WhereOptions<standardsAttributes> = {
      standardname: standard.standardname,
      schoolid: standard.schoolid,
      isdeleted: false,
    };
    if ((standard.standardid ?? "").trim().length > 0) {
      where.standardid = {
        [Op.not]: standard.standardid,
      };
    }
    const tempdt = await standards.count({ where });
    return tempdt > 0;
  };

  isexistsstandardID = async (standardid: string) => {
    const where: WhereOptions<standardsAttributes> = {
      standardid,
      isdeleted: false,
    };
    const tempdt = await standards.count({ where });
    return tempdt > 0;
  };

  standardstudentexists = async (standardid: string) => {
    const where: WhereOptions<standardsAttributes> = {
      standardid,
      isdeleted: false,
    };
    const tempdt = await standards.findOne({ where });

    const count = await new StudentBusiness().getstudentcountbystandard(
      tempdt?.standardname || ""
    );

    return count > 0;
  };

  migrateStandards = async () => {
    const alloldstandards = await standards.findAll({
      attributes: ['standardname'],
      where: { isdeleted: false, schoolid: { [Op.is]: null as any } }
    });
    const allschools = await schools.findAll({
      where: { isdeleted: false }
    })
    const transaction = await dbinstance.getdbinstance().transaction();
    try {
      for await (const school of allschools) {
        for await (const standard of alloldstandards) {
          const standardexist = await standards.findOne({
            where: {
              standardname: standard.standardname,
              schoolid: school.schoolid, 
            }
          });
          if(standardexist) continue;
          await standards.create({
            standardid: uuidv4(),
            standardname: standard.standardname,
            schoolid: school.schoolid,
            schoolname: school.schoolname,
          }, { transaction })
        }
      }
      await transaction.commit();
    } catch (e) {
        await transaction.rollback();
        throw e;
    }
    return alloldstandards;
  }
  /** A school's classes. The school must be one of the caller's (unknown or not theirs: 404). */
  getSchoolidStandard = async (schoolid: string, org: OrgContext) => {
    await findOwnedSchool(org, schoolid, { includeDeleted: true });
    return standards.findAll({where: { schoolid: schoolid, isdeleted: false },
      include:[{
        model: schools,
        required: true,
        attributes: ["schoolname"],
      }]
    });
  };

  getStandards = async () => {
    const where: WhereOptions<standardsAttributes> = {
      //isdeleted: false,
    };
    const order = ["standardname"];

    return await standards.findAll({ where, order });
  };

  // `schoolid` is already resolved by the route (see resolveSchoolRef); undefined = every school.
  getStandardsWithFilter = async (standardname: string, schoolid: string | undefined, org: OrgContext) => {
    const where: WhereOptions<standardsAttributes> = {
      standardname: {
        [Op.like]: `%${standardname.trim()}%`
      }
    };
    if(schoolid) where.schoolid = schoolid;

    return await standards.findAll(
      {
        where: await andInOwnedSchools(where, org),
        attributes: ['standardid','standardname'],
        include: [
          {
            model: schools,
            as: 'school',
            attributes: ['schoolname']
          }
        ]
      }
    );
  };

  removeStandards = async () => {
    const alloldstandards = await standards.findAll({
      attributes: ['standardid', 'standardname'],
      where: { isdeleted: false }
    });
    const transaction = await dbinstance.getdbinstance().transaction();
    try {
      for await (const standard of alloldstandards) {
        const student = await students.findOne({
          where: {
            standard: standard.standardid
          }
        });
        if(!student) {
          await standard.destroy({transaction});
        }
      }
      await transaction.commit();
    } catch (e) {
        await transaction.rollback();
        throw e;
    }
  }
}
