import { hashPassword } from "src/services/password.service";
import { Op, Transaction, WhereOptions } from "sequelize";
import {
  schoolusers,
  schoolusersAttributes,
} from "src/models/data-models/schoolusers";
import { SchoolRole } from "src/models/enums/school.role.enum";
import { IPaging } from "src/models/IPaging";
import { dbinstance, rollbackQuietly } from "src/services/dbservice";
import { buildWhere } from "src/services/util.service";
import { v4 } from "uuid";
import { OrgContext } from "src/decorators/org.decorator";
import { requireOwnedSchoolById } from "./school-scope";
import { extractSchoolFilters, schoolIdsWhere } from "./school-filter";
import { andInOwnedSchools, schoolScope } from "./school-scope";
import { studentApiAttributes } from "./student-api-payload";

export class TeacherBusiness {
  // A school's teachers, for the export a classroom Pi imports (a payload for the
  // student API: see student-api-payload.ts).
  getteacheruserbyschoolid = (schoolid: string) =>
    schoolusers.findAll({
      where: {
        schoolid,
        schooluserrole: SchoolRole.TEACHER,
      },
      attributes: studentApiAttributes,
    });
  getteacherusersbyschoolid = (
    schoolid: string,
    teachersusername: Array<string>
  ) =>
    schoolusers.findAll({
      where: {
        schoolid,
        schooluserrole: SchoolRole.TEACHER,
        schoolusername: {
          [Op.in]: teachersusername,
        },
      },
    });
  addteacheruserbyschoolid = async (
    teachers: Array<any>,
    schoolid: string,
    org: OrgContext,
  ) => {
    const tnx = await dbinstance.getdbinstance().transaction();
    try {
      // The school is read inside the transaction, locked by primary key (shared); its
      // own stored name is what is written next to the id. It must be one of the caller's.
      const school = await requireOwnedSchoolById(org, schoolid, tnx);
      const su = await schoolusers.bulkCreate(
        teachers.map((x) => ({
          schooluserpasswordhash: hashPassword(x.teacheruserpassword),
          schoolusername: x.teacherusername,
          schooluserrole: SchoolRole.TEACHER,
          isdisabled: false,
          schooluserid: v4(),
          schoolname: school.schoolname,
          schoolid: school.schoolid,
        })),
        { transaction: tnx }
      );
      await tnx.commit();
      return su;
    } catch (error) {
      await rollbackQuietly(tnx);
      throw error;
    }
  };

  getAllTeachers = async (paging: IPaging, org: OrgContext) => {
    let schooluserwhere: WhereOptions<schoolusersAttributes> = {};
    const limit = paging.pagesize || 20;
    let offset = 0;
    if ((paging.pageindex || 1) > 1) {
      offset = limit * ((paging.pageindex || 1) - 1);
    }

    // A search by school name is carried out on the schools and the rows are
    // limited to those schools' ids (see school-filter.ts).
    const { rest, schoolids } = await extractSchoolFilters(paging.filter, schoolScope(org));
    schooluserwhere = {
      ...buildWhere<schoolusersAttributes>(
        {
          ...paging,
          filter: rest,
        },
        schooluserwhere
      ),
      ...schoolIdsWhere(schoolids),
      schooluserrole: SchoolRole.TEACHER,
      // Soft-deleted teachers drop off the roster, same as learners.
      isdeleted: false,
    };

    const data = await schoolusers.findAndCountAll({
      // The caller's schools are ANDed on the outside: a filter (which builds its own `Op.and`) cannot replace them.
      where: await andInOwnedSchools(schooluserwhere, org),
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
