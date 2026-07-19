import * as md5 from "md5";
import { Op, Transaction, WhereOptions } from "sequelize";
import {
  schoolusers,
  schoolusersAttributes,
} from "src/models/data-models/schoolusers";
import { SchoolRole } from "src/models/enums/school.role.enum";
import { IPaging } from "src/models/IPaging";
import { dbinstance } from "src/services/dbservice";
import { buildWhere } from "src/services/util.service";
import { v4 } from "uuid";

export class TeacherBusiness {
  getteacheruserbyschoolname = (schoolname: string) =>
    schoolusers.findAll({
      where: {
        schoolname,
        schooluserrole: SchoolRole.TEACHER,
      },
    });
  getteacherusersbyschoolname = (
    schoolname: string,
    teachersusername: Array<string>
  ) =>
    schoolusers.findAll({
      where: {
        schoolname,
        schooluserrole: SchoolRole.TEACHER,
        schoolusername: {
          [Op.in]: teachersusername,
        },
      },
    });
  addteacheruserbyschoolname = async (
    teachers: Array<any>,
    schoolname: string
  ) => {
    const tnx = await dbinstance.getdbinstance().transaction();
    try {
      const su = await schoolusers.bulkCreate(
        teachers.map((x) => ({
          schooluserpasswordhash: md5.default(x.teacheruserpassword),
          schoolusername: x.teacherusername,
          schooluserrole: SchoolRole.TEACHER,
          isdisabled: false,
          schooluserid: v4(),
          schoolname,
        })),
        { transaction: tnx }
      );
      tnx.commit();
      return su;
    } catch (error) {
      tnx.rollback();
    }
  };

  getAllTeachers = async (paging: IPaging) => {
    let schooluserwhere: WhereOptions<schoolusersAttributes> = {};
    const limit = paging.pagesize || 20;
    let offset = 0;
    if ((paging.pageindex || 1) > 1) {
      offset = limit * ((paging.pageindex || 1) - 1);
    }

    schooluserwhere = {
      ...buildWhere<schoolusersAttributes>(
        {
          ...paging,
          filter: paging.filter,
        },
        schooluserwhere
      ),
      schooluserrole: SchoolRole.TEACHER,
      // Soft-deleted teachers drop off the roster, same as learners.
      isdeleted: false,
    };

    const data = await schoolusers.findAndCountAll({
      where: schooluserwhere,
      limit,
      offset,
    });
    return {
      count: data.count,
      rows: data.rows.map((x: schoolusers) => {
        return {
          ...x.get({ plain: true }),
          schooluserpasswordhash: undefined,
        };
      }),
    };
  };

  getTeacherByID = (teacherid: string) =>
    schoolusers.findOne({
      where: {
        schooluserid: teacherid,
        schooluserrole: SchoolRole.TEACHER,
      },
    });

  getTeacherByName = (teacherusername: string) =>
    schoolusers.findOne({
      where: {
        schoolusername: teacherusername,
        schooluserrole: SchoolRole.TEACHER,
      },
    });

  getTeachersByName = (schooluserdata: Array<string>) =>
    schoolusers.findAll({
      where: {
        schoolusername: {
          [Op.in]: schooluserdata.map((x) => x.trim().toLowerCase())
        },
        schooluserrole: SchoolRole.TEACHER,
      },
      attributes: {
        exclude: [
          "schooluserid",
          "schooluserstatus",
          "schoolname",
          "isdisabled",
          "schooluserpasswordhash",
          "schooluserrole",
        ],
      },
    });

  deleteTeacher = (schooluserid: string, transaction: Transaction) =>
    schoolusers.destroy({
      where: {
        schooluserid,
        schooluserrole: SchoolRole.TEACHER,
      },
      transaction,
    });
}
