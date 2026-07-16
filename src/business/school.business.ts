import { col, fn, Op, WhereOptions } from "sequelize";
import { countries } from "src/models/data-models/countries";
import { curriculums } from "src/models/data-models/curriculums";
import { schools, schoolsAttributes } from "src/models/data-models/school";
import { students } from "src/models/data-models/students";
import { IMultiPaging } from "src/models/IPaging";
import { LmsUserToken } from "src/models/token.model";
import { SchoolCurriculumBase } from "src/modules/school/models/SchoolResponse";
import { constructWhere } from "src/services/util.service";
// import { buildWhere } from "src/services/util.service";
import { v4 as uuidv4 } from "uuid";
import { CurriculumBusiness } from "./curriculum.business";
import { StudentBusiness } from "./student.business";

export class SchoolBusiness {
  getschoolbyname = (schoolname: string) =>
    schools.findOne({
      where: { schoolname },
    });

  getallschools = () =>
    students.findAll({
      attributes: [
        [fn("min", col("schooltype")), "schooltype"],
        "schoolname",
        [fn("min", col("city")), "city"],
        [fn("min", col("country")), "country"],
        [fn("min", col("state")), "state"],
      ],
      group: "schoolname",
    });

  getschoolsbycountry = (countryid: string) =>
    schools.findAll({
      where: { countryid }
    })

  createschool = async (school: schoolsAttributes, user: LmsUserToken) => {
    school.schoolid = uuidv4();
    school.isdeleted = false;
    school.created_by = user.lmsuserid;
    return await schools.create(school);
  };
  getschoolbyid = (schoolid: string) =>
    schools.findOne({ where: { schoolid, isdeleted: false }});
  getschoolall = async (paging: IMultiPaging) => {
    let where: WhereOptions<schoolsAttributes> = {
      isdeleted: false,
    };
    const order = ["schoolname"];
    const limit = paging.pagesize || 20;
    let offset = 0;
    if ((paging.pageindex || 1) > 1) {
      offset = limit * ((paging.pageindex || 1) - 1);
    }
    where = { ...constructWhere<schoolsAttributes>(paging, where) };

    const allschoolscount = await schools.findAndCountAll({ where, order, limit, offset, 
      include:[
        { 
          model: countries,
          as: "countries"
        }
      ]
      });
    const filterschools = await Promise.all(allschoolscount.rows.map(async school => {
      // const curs = school.curriculums;
      const newcurs: Array<string | undefined> = [];
      for (let index = 0; index < school.curriculums?.length; index++) {
        const cur = await curriculums.findOne({ where: { curriculumid: school.curriculums[index] } });
        newcurs.push(cur?.curriculumname);
      }
      school.curriculums = newcurs as [string];
      return school
    }));
    allschoolscount.rows = filterschools;
    return allschoolscount
  };
  getSchoolsWithFilter = async (schoolname: string, countryid: string, user?: LmsUserToken) => {
    const where: WhereOptions<schoolsAttributes> = {
      isdeleted: false,
      schoolname: {
        [Op.like]: `%${schoolname.trim()}%`
      }
    };
    const order = ["schoolname"];
    if(countryid) {
      where.countryid = countryid;
    }
    if(user && user.schools && user.schools.length > 0) {
      where.schoolid = {
        [Op.in]: user.schools
      }
    }
    return await schools.findAll({ 
      where, order,
    });
  };
  getschoolname = (schoolname: string) =>
    schools.findAll({ where: { schoolname, isdeleted: false } });
  updateschoolName = async (school: schoolsAttributes, user: LmsUserToken) => {
    const tempdt = await this.getschoolbyid(school.schoolid);
    if (tempdt) {
      tempdt.schoolname = school.schoolname;
      tempdt.countryid = school.countryid;
      tempdt.curriculums = school.curriculums;
      tempdt.updated_at = new Date();
      tempdt.updated_by = user.lmsuserid;
      await tempdt.save({ fields: ["schoolname", "countryid", "curriculums", "updated_at", "updated_by"] });
      //await tempdt.reload();
      return tempdt;
    } else {
      return null;
    }
  };
  deleteschool = async (schoolid: string, user: LmsUserToken) => {
    const tempdt = await this.getschoolbyid(schoolid);
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
  isexistsschoolName = async (school: schoolsAttributes) => {
    const where: WhereOptions<schoolsAttributes> = {
      schoolname: school.schoolname,
      isdeleted: false,
    };
    if ((school.schoolid ?? "").trim().length > 0) {
      where.schoolid = {
        [Op.not]: school.schoolid,
      };
    }
    const tempdt = await schools.count({ where });
    return tempdt > 0;
  };

  isexistsschoolID = async (schoolid: string) => {
    const where: WhereOptions<schoolsAttributes> = {
      schoolid,
      isdeleted: false,
    };
    const tempdt = await schools.count({ where });
    return tempdt > 0;
  };

  schoolstudentexists = async (schoolid: string) => {
    const where: WhereOptions<schoolsAttributes> = {
      schoolid,
      isdeleted: false,
    };
    const tempdt = await schools.findOne({ where });

    const count = await new StudentBusiness().getstudentcountbyschool(
      tempdt?.schoolname || ""
    );

    return count > 0;
  };

  getschoolcurriculums = async (schoolid: string, curriculumids: Array<string>) => {
    const data: Array<SchoolCurriculumBase> = [];
    for (const curriculumid of curriculumids) {
      const curriculum = await new CurriculumBusiness().getCurriculumbyid(curriculumid);
      data.push({
        schoolid: schoolid,
        curriculumid: curriculumid,
        curriculumname: curriculum?.curriculumname as string
      })
    }
    return data;
  }

  getSchools = async () => {
    const where: WhereOptions<schoolsAttributes> = {
      //isdeleted: false,
    };
    const order = ["schoolname"];

    return await schools.findAll({ where, order });
  };
}
