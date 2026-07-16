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
import { dbinstance } from "src/services/dbservice";
import { BadRequestException } from "@nestjs/common";

export class StandardBusiness {
  createstandard = async (standard: standardsAttributes, user: LmsUserToken) => {
    standard.standardid = uuidv4();
    standard.isdeleted = false;
    standard.created_by = user.lmsuserid;
    const school = await schools.findOne({ where: { schoolid: standard.schoolid }});
    if(!school) throw new BadRequestException('no school found');
    standard.schoolname = school.schoolname;
    return await standards.create(standard);
  };
  getstandardbyid = (standardid: string) =>
    standards.findOne({ where: { standardid, isdeleted: false },
      // include:[{        
      //   model: schools,
      //   required: false,
      //   attributes: ["schoolname"],
      // }] 
    });

  getstandardall = async (paging: IMultiPaging) => {
    let where: WhereOptions<standardsAttributes> = {
      isdeleted: false,
    };

    const order = ["standardname"];
    const limit = paging.pagesize || 20;
    let offset = 0;
    if ((paging.pageindex || 1) > 1) {
      offset = limit * ((paging.pageindex || 1) - 1);
    }
    where = { ...constructWhere<standardsAttributes>(paging, where) };

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
  updatestandardName = async (standard: standardsAttributes, user: LmsUserToken) => {
    const tempdt = await this.getstandardbyid(standard.standardid);
    if (tempdt) {
      tempdt.standardname = standard.standardname;
      tempdt.schoolid = standard.schoolid;
      tempdt.updated_at = new Date();
      tempdt.updated_by = user.lmsuserid;
      const school = await schools.findOne({ where: { schoolid: standard.schoolid }});
      if(!school) throw new BadRequestException('no school found');
      tempdt.schoolname = school.schoolname;
      await tempdt.save({ fields: ["standardname", "updated_at", "updated_by", "schoolid", "schoolname"]});
      //await tempdt.reload();
      return tempdt;
    } else {
      return null;
    }
  };
  deletestandard = async (standardid: string, user: LmsUserToken) => {
    const tempdt = await this.getstandardbyid(standardid);
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
      where: { isdeleted: false, schoolid: null }
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
  getSchoolidStandard = (schoolid: string) =>
    standards.findAll({where: { schoolid: schoolid, isdeleted: false },
      include:[{
        model: schools,
        required: true,
        attributes: ["schoolname"],
      }]
    });

  getStandards = async () => {
    const where: WhereOptions<standardsAttributes> = {
      //isdeleted: false,
    };
    const order = ["standardname"];

    return await standards.findAll({ where, order });
  };

  getStandardsWithFilter = async (standardname: string, schoolname: string) => {
    const where: WhereOptions<standardsAttributes> = {
      standardname: {
        [Op.like]: `%${standardname.trim()}%`
      }
    };
    if(schoolname) where["$school.schoolname$"] = schoolname;

    return await standards.findAll(
      {
        where,
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
