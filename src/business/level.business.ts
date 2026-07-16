/* eslint-disable @typescript-eslint/no-explicit-any */
import { col, fn, Op, WhereOptions } from "sequelize";
import { IPaging } from "src/models/IPaging";
import { LmsUserToken } from "src/models/token.model";
import { LevelAllBase } from "src/modules/level/models/LevelGetAllResponse";
import { v4 as uuidv4 } from "uuid";
import {
  grades,
  lessons,
  levels,
  levelsAttributes,
} from "../models/data-models/init-models";
import { buildWhere } from "../services/util.service";

export class LevelBusiness {
  createLevel = async (level: levelsAttributes, user: any) => {
    level.levelid = uuidv4();
    level.isdeleted = false;
    level.levelstatus = true;
    level.created_by = user?.lmsuserid;
    const lvl = await levels.create(level);
    await new LevelBusiness().updateLevelPoints(lvl);
    return lvl;
  };
  getLevelbyid = async (levelid: string) => {
    grades.belongsTo(levels, {
      foreignKey: "gradeid",
    });
    levels.hasOne(grades, {
      foreignKey: "gradeid",
      sourceKey: "gradeid",
    });
    const data = await levels.findOne({
      where: { levelid, isdeleted: false },
      include: [
        {
          model: grades,
          attributes: {
            exclude: [`isdeleted`, "gradedescription", "gradestatus"],
          },
        },
      ],
    });
    return data
      ? <LevelAllBase>{
          gradeid: data.gradeid,
          leveldescription: data.leveldescription,
          isdeleted: data.isdeleted,
          levelid: data.levelid,
          levelname: data.levelname,
          levelorder: data.levelorder,
          levelstatus: data.levelstatus,
          gradename: data.grade.gradename,
          quiz_points: data.quiz_points,
          passing_points: data.passing_points,
        }
      : null;
  };
  getLevelid = async (levelid: string) =>
    levels.findOne({
      where: { levelid, isdeleted: false },
    });
  getLevelByGradeId = async (grades: Array<string>) =>
    levels.findAll({
      where: {
        gradeid: {
          [Op.in]: grades,
        },
        isdeleted: false,
      },
    });
  getLevelall = async (paging: IPaging) => {
    grades.belongsTo(levels, {
      foreignKey: "gradeid",
    });
    levels.hasOne(grades, {
      foreignKey: "gradeid",
      sourceKey: "gradeid",
    });
    let where: WhereOptions<levelsAttributes> = {
      isdeleted: false,
    };
    const order = ["gradeid", "levelorder"];
    const limit = paging.pagesize || 20;
    let offset = 0;
    if ((paging.pageindex || 1) > 1) {
      offset = limit * ((paging.pageindex || 1) - 1);
    }
    where = { ...buildWhere<levelsAttributes>(paging, where) };
    const data = await levels.findAndCountAll({
      where,
      order,
      limit,
      offset,
      include: [
        {
          model: grades,
          attributes: {
            exclude: [
              `isdeleted`,
              "gradeid",
              "gradedescription",
              "gradestatus",
              "gradeorder",
              "curriculumid",
            ],
          },
        },
      ],
    });
    return {
      count: data.count,
      rows: data.rows.map(
        (x) =>
          <LevelAllBase>{
            gradeid: x.gradeid,
            leveldescription: x.leveldescription,
            isdeleted: x.isdeleted,
            levelid: x.levelid,
            levelname: x.levelname,
            levelorder: x.levelorder,
            levelstatus: x.levelstatus,
            gradename: x.grade.gradename,
            quiz_points: x.quiz_points,
            passing_points: x.passing_points,
          }
      ),
    };
  };
  getLevels = async () => {
    const where: WhereOptions<levelsAttributes> = {
      //isdeleted: false,
    };
    const order = ["levelname"];

    return await levels.findAll({ where, order });
  };
  getLevelsWithFilter = async (gradeid: string, levelname: string) => {
    const where: WhereOptions<levelsAttributes> = {
      isdeleted: false,
      levelstatus: true,
      levelname: {
        [Op.like]: `%${levelname.trim()}%`
      }
    };
    if(gradeid){
      where.gradeid = gradeid;
    }  
    const order = ["levelname"];

    return await levels.findAll({ where, order });
  };
  getLevelname = (levelname: string) =>
    levels.findOne({
      where: { levelname, isdeleted: false },
    });
  updateLevel = async (level: levelsAttributes, user: any) => {
    const tempdt = await this.getLevelid(level.levelid);
    if (tempdt) {
      tempdt.levelname = level.levelname;
      tempdt.leveldescription = level.leveldescription;
      tempdt.levelorder = level.levelorder;
      tempdt.gradeid = level.gradeid;
      tempdt.quiz_points = level.quiz_points ?? 10;
      tempdt.passing_points = level.passing_points ?? 8;
      tempdt.updated_at = new Date();
      tempdt.updated_by = user?.lmsuserid;
      await tempdt.save({
        fields: [
          "levelname",
          "leveldescription",
          "levelorder",
          "gradeid",
          "passing_points",
          "quiz_points",
          "updated_at",
          "updated_by",
        ],
      });
      //await tempdt.reload();
      await new LevelBusiness().updateLevelPoints(tempdt);
      return tempdt;
    } else {
      return null;
    }
  };
  deleteLevel = async (levelid: string, user: LmsUserToken) => {
    const tempdt = await this.getLevelid(levelid);
    if (tempdt) {
      tempdt.isdeleted = true;
      tempdt.deleted_at = new Date();
      tempdt.deleted_by = user.lmsuserid;
      await tempdt.save({ fields: ["isdeleted", 'deleted_at', 'deleted_by'] });
      await new LevelBusiness().updateLevelPoints(tempdt);
      return true;
    } else {
      return false;
    }
  };

  activateLevel = async (levelid: string) => {
    const tempdt = await this.getLevelid(levelid);
    if (tempdt) {
      tempdt.levelstatus = true;
      await tempdt.save({ fields: ["levelstatus"] });
      return true;
    } else {
      return false;
    }
  };

  deavtivateLevel = async (levelid: string) => {
    const tempdt = await this.getLevelid(levelid);
    if (tempdt) {
      tempdt.levelstatus = false;
      await tempdt.save({ fields: ["levelstatus"] });
      return true;
    } else {
      return false;
    }
  };
  isexistsLevelName = async (level: levelsAttributes) => {
    let where: WhereOptions<levelsAttributes> = {
      levelname: level.levelname,
      isdeleted: false,
      gradeid: level.gradeid,
    };
    if ((level.levelid ?? "").trim().length > 0) {
      where = {
        ...where,
        levelid: {
          [Op.not]: level.levelid,
        },
      };
    }
    const tempdt = await levels.count({ where });
    return tempdt > 0;
  };

  isexistsLevelID = async (levelid: string) => {
    const where: WhereOptions<levelsAttributes> = {
      levelid,
      isdeleted: false,
    };
    const tempdt = await levels.count({ where });
    return tempdt > 0;
  };

  updateLevelPoints = async (level?: levels, levelid?: string, ) => {
    if (level) {
      const lessonspoints = await lessons.findAll({
        where: {
          levelid: level ? level.levelid : levelid,
        },
        attributes: [
          [fn("sum", col("total_points")), "total_points"],
        ],
      });
      level.points = (+lessonspoints[0]?.total_points ?? 0) + (+level.quiz_points ?? 0);
      await level.save({ fields: ["points"] });
      const grade = await level.getGrade();
      const lvls = await levels.findAll({
        where: {
          gradeid: grade.gradeid
        },
        attributes: [
          [fn("sum", col("points")), "points"],
        ],
      });
      grade.points = lvls[0]?.points ?? 0;
      await grade.save({ fields: ["points"]});
    }
  };

  updateLevelQuizPoints = async (user: any) => {
    const lvls = await levels.findAll({
      where: { levelstatus: true, isdeleted: false }
    });
    for await (const tempdt of lvls) {
      tempdt.quiz_points = 100;
      tempdt.updated_at = new Date();
      tempdt.updated_by = user?.lmsuserid;
      await tempdt.save({
        fields: [
          "quiz_points",
          "updated_at",
          "updated_by",
        ],
      });
      //await tempdt.reload();
      await new LevelBusiness().updateLevelPoints(tempdt);
    }
  };
}
