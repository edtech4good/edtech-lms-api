/* eslint-disable @typescript-eslint/no-explicit-any */
import { Op, WhereOptions } from "sequelize";
import { IPaging } from "src/models/IPaging";
import { LmsUserToken } from "src/models/token.model";
import { GradeAllBase } from "src/modules/grade/models/GradeGetAllResponse";
import { v4 as uuidv4 } from "uuid";
import {
  curriculums,
  grades,
  gradesAttributes,
  students,
} from "../models/data-models/init-models";
import { buildWhere } from "../services/util.service";

export class GradeBusiness {
  createGrade = async (grade: gradesAttributes, user: LmsUserToken) => {
    grade.gradeid = uuidv4();
    grade.isdeleted = false;
    grade.gradestatus = true;
    grade.created_by = user.lmsuserid;
    return await grades.create(grade);
  };
  getGradebyid = async (gradeid: string) => {
    curriculums.belongsTo(grades, {
      foreignKey: "curriculumid",
    });
    grades.hasOne(curriculums, {
      foreignKey: "curriculumid",
      sourceKey: "curriculumid",
    });
    const data = await grades.findOne({
      where: { gradeid, isdeleted: false },
      include: [
        {
          model: curriculums,
          attributes: {
            exclude: [`isdeleted`, "curriculumdescription", "curriculumstatus"],
          },
        },
      ],
    });
    return data
      ? <GradeAllBase>{
          curriculumid: data.curriculumid,
          gradedescription: data.gradedescription,
          isdeleted: data.isdeleted,
          gradeid: data.gradeid,
          gradename: data.gradename,
          gradeorder: data.gradeorder,
          gradestatus: data.gradestatus,
          curriculumname: data.curriculum.curriculumname,
          passing_points: data.passing_points,
          points: data.points,
        }
      : null;
  };
  getGradeid = (gradeid: string) =>
    grades.findOne({
      where: { gradeid, isdeleted: false },
    });

  getGradeByCurriculumid = async (curriculumid: string) => {
    const data = await grades.findAll({
      where: { curriculumid, isdeleted: false },
      include: [
        {
          model: curriculums,
          attributes: {
            exclude: [`isdeleted`, "curriculumdescription", "curriculumstatus"],
          },
          as: "curriculum"
        },
      ],
    });
    return data.map(
      (x) =>
        <GradeAllBase>{
          curriculumid: x.curriculumid,
          gradedescription: x.gradedescription,
          isdeleted: x.isdeleted,
          gradeid: x.gradeid,
          gradename: x.gradename,
          gradeorder: x.gradeorder,
          gradestatus: x.gradestatus,
          curriculumname: x.curriculum.curriculumname,
          passing_points: x.passing_points,
          points: x.points,
        }
    );
  }
  getGradeall = async (paging: IPaging) => {
    curriculums.belongsTo(grades, {
      foreignKey: "curriculumid",
    });
    grades.hasOne(curriculums, {
      foreignKey: "curriculumid",
      sourceKey: "curriculumid",
    });
    let where: WhereOptions<gradesAttributes> = {
      isdeleted: false,
    };
    const order = ["curriculumid", "gradeorder"];
    const limit = paging.pagesize || 20;
    let offset = 0;
    if ((paging.pageindex || 1) > 1) {
      offset = limit * ((paging.pageindex || 1) - 1);
    }
    where = { ...buildWhere<gradesAttributes>(paging, where) };
    const data = await grades.findAndCountAll({
      where,
      order,
      limit,
      offset,
      include: [
        {
          model: curriculums,
          attributes: {
            exclude: [
              `isdeleted`,
              "curriculumid",
              "curriculumdescription",
              "curriculumstatus",
            ],
          },
        },
      ],
    });
    return {
      count: data.count,
      rows: data.rows.map(
        (x) =>
          <GradeAllBase>{
            curriculumid: x.curriculumid,
            gradedescription: x.gradedescription,
            isdeleted: x.isdeleted,
            gradeid: x.gradeid,
            gradename: x.gradename,
            gradeorder: x.gradeorder,
            gradestatus: x.gradestatus,
            curriculumname: x.curriculum.curriculumname,
            passing_points: x.passing_points,
            points: x.points,
          }
      ),
    };
  };
  getGradesWithFilter = async (gradename: string, curid: string, studentid: string, standardid: string, schoolname: string) => {
    const where: WhereOptions<gradesAttributes> = {
      isdeleted: false,
      gradestatus: true,
      gradename: {
        [Op.like]: `%${gradename.trim()}%`
      }
    };
    if(curid){
      where.curriculumid = curid;
    }
    if(!curid && (studentid || standardid)) {
      const wherestd: any = {};
      if(studentid) wherestd.studentid = studentid;
      if(standardid) wherestd.standard = standardid;
      if(schoolname) wherestd.schoolname = schoolname;
      const std = await students.findOne({
        where: wherestd, attributes: [],
        include: [
          {
            model: curriculums,
            as: 'curriculum',
            attributes: ['curriculumid']
          }
        ]
      });
      if(std) where.curriculumid = std.curriculum.curriculumid
    }
    const order = ["gradename"];

    return await grades.findAll({ where, order });
  };
  getGrades = async () => {
    const where: WhereOptions<gradesAttributes> = {
      //isdeleted: false,
    };
    const order = ["gradename"];

    return await grades.findAll({ where, order });
  };
  getGradename = (gradename: string) =>
    grades.findOne({
      where: { gradename, isdeleted: false },
    });
  updateGrade = async (grade: gradesAttributes, user: LmsUserToken) => {
    const tempdt = await this.getGradeid(grade.gradeid);
    if (tempdt) {
      tempdt.gradename = grade.gradename;
      tempdt.gradedescription = grade.gradedescription;
      tempdt.gradeorder = grade.gradeorder;
      tempdt.passing_points = grade.passing_points ?? 8;
      tempdt.curriculumid = grade.curriculumid;
      tempdt.updated_at = new Date();
      tempdt.updated_by = user.lmsuserid;
      await tempdt.save({
        fields: ["gradename", "gradedescription", "gradeorder", "curriculumid", "passing_points", 'updated_at', 'updated_by'],
      });
      //await tempdt.reload();
      return tempdt;
    } else {
      return null;
    }
  };
  deleteGrade = async (gradeid: string, user: LmsUserToken) => {
    const tempdt = await this.getGradeid(gradeid);
    if (tempdt) {
      tempdt.isdeleted = true;
      tempdt.deleted_at = new Date();
      tempdt.deleted_by = user.lmsuserid;
      await tempdt.save({ fields: ["isdeleted", 'deleted_at', 'deleted_by'] });
      return true;
    } else {
      return false;
    }
  };

  activateGrade = async (gradeid: string) => {
    const tempdt = await this.getGradeid(gradeid);
    if (tempdt) {
      tempdt.gradestatus = true;
      await tempdt.save({ fields: ["gradestatus"] });
      return true;
    } else {
      return false;
    }
  };

  deavtivateGrade = async (gradeid: string) => {
    const tempdt = await this.getGradeid(gradeid);
    if (tempdt) {
      tempdt.gradestatus = false;
      await tempdt.save({ fields: ["gradestatus"] });
      return true;
    } else {
      return false;
    }
  };
  isexistsGradeName = async (grade: gradesAttributes) => {
    let where: WhereOptions<gradesAttributes> = {
      gradename: grade.gradename,
      isdeleted: false,
      curriculumid: grade.curriculumid,
    };
    if ((grade.gradeid ?? "").trim().length > 0) {
      where = {
        ...where,
        gradeid: {
          [Op.not]: grade.gradeid,
        },
      };
    }
    const tempdt = await grades.count({ where });
    return tempdt > 0;
  };

  isexistsGradeID = async (gradeid: string) => {
    const where: WhereOptions<gradesAttributes> = {
      gradeid,
      isdeleted: false,
    };
    const tempdt = await grades.count({ where });
    return tempdt > 0;
  };
}
