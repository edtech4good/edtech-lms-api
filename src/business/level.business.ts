/* eslint-disable @typescript-eslint/no-explicit-any */
import { reorderChildren } from "./reorder-children";
import { col, fn, Op, WhereOptions } from "sequelize";
import { IPaging } from "src/models/IPaging";
import { LmsUserToken } from "src/models/token.model";
import { LevelAllBase } from "src/modules/level/models/LevelGetAllResponse";
import { v4 as uuidv4 } from "uuid";
import {
  grades,
  lessons,
  levelquizquestions,
  levels,
  levelsAttributes,
} from "../models/data-models/init-models";
import { buildWhere } from "../services/util.service";
import { OrgContext } from "src/decorators/org.decorator";
import { andScope, findOwnedGrade, findOwnedLevel } from "./content-scope";
import { andOrganisation, extractOrganisationFilter, ownersOfGrades } from "./row-owner";

/**
 * Built with the caller's context, every read and write here is limited to the levels in scope (a level of another
 * organisation is reported exactly as an absent one); built without one it is unscoped (the sync payloads).
 */
export class LevelBusiness {
  constructor(private readonly org?: OrgContext) {}

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
    if (this.org) {
      await findOwnedLevel(this.org, levelid, { where: { isdeleted: false } });
    }
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
    this.org
      ? findOwnedLevel(this.org, levelid, { where: { isdeleted: false } })
      : levels.findOne({
          where: { levelid, isdeleted: false },
        });
  getLevelByGradeId = async (grades: Array<string>) =>
    levels.findAll({
      where: await andScope(this.org, "level", {
        gradeid: {
          [Op.in]: grades,
        },
        isdeleted: false,
      }),
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
    const { organisationid, rest } = extractOrganisationFilter(paging.filter);
    where = { ...buildWhere<levelsAttributes>({ ...paging, filter: rest }, where) };
    where = await andScope(this.org, "level", where);
    where = await andOrganisation(where, "level", organisationid);
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
    const owners = await ownersOfGrades(data.rows.map((x) => x.gradeid));
    return {
      count: data.count,
      rows: data.rows.map(
        (x) =>
          <LevelAllBase>{
            organisationid: owners.get(x.gradeid) ?? null,
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

    return await levels.findAll({ where: await andScope(this.org, "level", where), order });
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

    return await levels.findAll({ where: await andScope(this.org, "level", where), order });
  };
  getLevelname = (levelname: string) =>
    levels.findOne({
      where: { levelname, isdeleted: false },
    });
  updateLevel = async (level: levelsAttributes, user: any) => {
    const tempdt = await this.getLevelid(level.levelid);
    if (tempdt) {
      const previousGradeid = tempdt.gradeid;
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
      // a level moved to another grade leaves the first grade's total
      if (previousGradeid !== tempdt.gradeid) await new LevelBusiness().updateGradePoints(previousGradeid);
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
      // the grade's points count the levels that are switched on
      await new LevelBusiness().updateGradePoints(tempdt.gradeid);
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
      // the grade's points count the levels that are switched on
      await new LevelBusiness().updateGradePoints(tempdt.gradeid);
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
    const tempdt = await levels.count({ where: await andScope(this.org, "level", where) });
    return tempdt > 0;
  };

  isexistsLevelID = async (levelid: string) => {
    const where: WhereOptions<levelsAttributes> = {
      levelid,
      isdeleted: false,
    };
    const tempdt = await levels.count({ where: await andScope(this.org, "level", where) });
    return tempdt > 0;
  };

  /**
   * A level's `points` are the sum of the `total_points` of its lessons that a learner can reach (not deleted, switched on: the
   * student API serves no other), plus its `quiz_points` ONLY WHEN the level has a level quiz, that is at least one active
   * `levelquizquestions` row (`levelquizquestionstatus`, the same "active" the student API reports as `level_has_quiz`): a learner
   * can only earn the quiz points through that quiz, so a level without one is not worth them. `quiz_points` itself is left as it is.
   * Then the grade's are recomputed (`updateGradePoints`). Called wherever a lesson or a level's quiz questions change.
   */
  updateLevelPoints = async (level?: levels, levelid?: string, ) => {
    if (level) {
      const lessonspoints = await lessons.findAll({
        where: {
          levelid: level ? level.levelid : levelid,
          isdeleted: false,
          lessonstatus: true,
        },
        attributes: [
          [fn("sum", col("total_points")), "total_points"],
        ],
      });
      const quizRows = await levelquizquestions.count({
        where: { levelid: level.levelid, levelquizquestionstatus: true },
      });
      level.points = +(lessonspoints[0]?.total_points ?? 0) + (quizRows > 0 ? +(level.quiz_points ?? 0) : 0);
      await level.save({ fields: ["points"] });
      await this.updateGradePoints(level.gradeid);
    }
  };

  /**
   * A grade's `points` are the sum of the `points` of its levels that are switched on and not deleted: what a learner's progress
   * (`points * 100 / grade.points`, on the student API) is out of. Called wherever a level is written, switched on or off, moved or deleted.
   */
  updateGradePoints = async (gradeid: string) => {
    const grade = await grades.findOne({ where: { gradeid } });
    if (!grade) return;
    const lvls = await levels.findAll({
      where: {
        gradeid,
        levelstatus: true,
        isdeleted: false,
      },
      attributes: [
        [fn("sum", col("points")), "points"],
      ],
    });
    grade.points = lvls[0]?.points ?? 0;
    await grade.save({ fields: ["points"]});
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

  /**
   * Sets the order of a grade's levels to 1..n in the order given, in one call. The grade in the path is the caller's,
   * or the 404 an absent one gets; the list must hold every one of its levels once each (reorder-children.ts).
   */
  reorderLevels = async (gradeid: string, levelids: string[]) => {
    if (this.org) {
      await findOwnedGrade(this.org, gradeid);
    }
    return reorderChildren(
      this.org,
      {
        kind: "level",
        model: levels,
        idColumn: "levelid",
        parentColumn: "gradeid",
        orderColumn: "levelorder",
        field: "levelids",
        noun: "level",
        parentNoun: "grade",
        softDelete: true,
      },
      gradeid,
      levelids,
    );
  };
}
