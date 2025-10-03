/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException } from "@nestjs/common";
import { col, fn, literal, Op, WhereOptions } from "sequelize";
import { IPaging } from "src/models/IPaging";
import { LmsUserToken } from "src/models/token.model";
import { LessonAllBase } from "src/modules/lesson/models/LessonGetAllResponse";
import { v4 as uuidv4 } from "uuid";
import {
  lessonlearnings,
  lessonpractices,
  lessonquizzes,
  lessons,
  lessonsAttributes,
  levels,
} from "../models/data-models/init-models";
import { buildWhere } from "../services/util.service";
import { LessonLearningBusiness } from "./lessonlearning.business";
import { LessonPracticeBusiness } from "./lessonpractice.business";
import { LessonQuizBusiness } from "./lessonquiz.business";
import { LevelBusiness } from "./level.business";

export class LessonBusiness {
  createLesson = async (lesson: lessonsAttributes, user: any) => {
    lesson.lessonid = uuidv4();
    lesson.isdeleted = false;
    lesson.lessonstatus = true;
    lesson.created_at = new Date();
    lesson.created_by = user?.lmsuserid;
    const ls = await lessons.create(lesson);
    return ls;
  };
  getLessonbyid = async (lessonid: string) => {
    levels.belongsTo(lessons, {
      foreignKey: "levelid",
    });
    lessons.hasOne(levels, {
      foreignKey: "levelid",
      sourceKey: "levelid",
    });
    const data = await lessons.findOne({
      where: { lessonid, isdeleted: false },
      include: [
        {
          model: levels,
          attributes: {
            exclude: [`isdeleted`, "leveldescription", "levelstatus"],
          },
        },
      ],
    });
    return data
      ? <LessonAllBase>{
          levelid: data.levelid,
          lessondescription: data.lessondescription,
          isdeleted: data.isdeleted,
          lessonid: data.lessonid,
          lessonname: data.lessonname,
          lessonorder: data.lessonorder,
          lessonstatus: data.lessonstatus,
          levelname: data.level.levelname,
          total_points: data.total_points,
          learning_points: data.learning_points,
          passing_points: data.passing_points,
        }
      : null;
  };
  getLessonid = async (lessonid: string) =>
    lessons.findOne({
      where: { lessonid, isdeleted: false },
    });
  getLessonByLevelID = async (levels: Array<string>) =>
    lessons.findAll({
      where: {
        levelid: {
          [Op.in]: levels,
        },
        isdeleted: false,
      },
    });
  getLessonall = async (paging: IPaging) => {
    levels.belongsTo(lessons, {
      foreignKey: "levelid",
    });
    lessons.hasOne(levels, {
      foreignKey: "levelid",
      sourceKey: "levelid",
    });
    let where: WhereOptions<lessonsAttributes> = {
      isdeleted: false,
    };
    const order = ["levelid", "lessonorder"];
    const limit = paging.pagesize || 20;
    let offset = 0;
    if ((paging.pageindex || 1) > 1) {
      offset = limit * ((paging.pageindex || 1) - 1);
    }
    where = { ...buildWhere<lessonsAttributes>(paging, where) };
    const data = await lessons.findAndCountAll({
      where,
      order,
      limit,
      offset,
      include: [
        {
          model: levels,
          attributes: {
            exclude: [
              `isdeleted`,
              "levelid",
              "leveldescription",
              "levelstatus",
              "levelorder",
              "gradeid",
            ],
          },
        },
      ],
    });
    return {
      count: data.count,
      rows: data.rows.map(
        (x) =>
          <LessonAllBase>{
            levelid: x.levelid,
            lessondescription: x.lessondescription,
            isdeleted: x.isdeleted,
            lessonid: x.lessonid,
            lessonname: x.lessonname,
            lessonorder: x.lessonorder,
            lessonstatus: x.lessonstatus,
            levelname: x.level.levelname,
            total_points: x.total_points,
            learning_points: x.learning_points,
            passing_points: x.passing_points,
          }
      ),
    };
  };
  getLessons = async () => {
    const where: WhereOptions<lessonsAttributes> = {
      //isdeleted: false,
    };
    const order = ["lessonname"];

    return await lessons.findAll({ where, order });
  };
  getLessonsWithFilter = async (levelid: string, lessonname: string) => {
    const where: WhereOptions<lessonsAttributes> = {
      isdeleted: false,
      lessonstatus: true,
      lessonname: {
        [Op.like]: literal(`'%${lessonname.trim()}%'`)
      }
    };
    if(levelid){
      where.levelid = levelid;
    }  
    const order = ["lessonname"];

    return await lessons.findAll({ where, order });
  };

  getLessonname = (lessonname: string) =>
    lessons.findOne({
      where: { lessonname, isdeleted: false },
    });
  updateLesson = async (lesson: lessonsAttributes, user: any) => {
    const tempdt = await this.getLessonid(lesson.lessonid);
    if (tempdt) {
      tempdt.lessonname = lesson.lessonname;
      tempdt.lessondescription = lesson.lessondescription;
      tempdt.lessonorder = lesson.lessonorder;
      tempdt.levelid = lesson.levelid;
      tempdt.total_points = lesson.total_points ?? 100;
      tempdt.passing_points = lesson.passing_points ?? 0;
      tempdt.updated_at = new Date();
      tempdt.updated_by = user?.lmsuserid;
      await tempdt.save({
        fields: [
          "lessonname",
          "lessondescription",
          "lessonorder",
          "levelid",
          "total_points",
          "passing_points",
          "updated_at",
          "updated_by",
        ],
      });
      //await tempdt.reload();
      await this.updatelearningpracticequiz(tempdt.lessonid);
      return tempdt;
    } else {
      return null;
    }
  };
  deleteLesson = async (lessonid: string, user: LmsUserToken) => {
    const tempdt = await this.getLessonid(lessonid);
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

  activateLesson = async (lessonid: string) => {
    const tempdt = await this.getLessonid(lessonid);
    if (tempdt) {
      tempdt.lessonstatus = true;
      await tempdt.save({ fields: ["lessonstatus"] });
      return true;
    } else {
      return false;
    }
  };

  deavtivateLesson = async (lessonid: string) => {
    const tempdt = await this.getLessonid(lessonid);
    if (tempdt) {
      tempdt.lessonstatus = false;
      await tempdt.save({ fields: ["lessonstatus"] });
      return true;
    } else {
      return false;
    }
  };
  isexistsLessonName = async (lesson: lessonsAttributes) => {
    let where: WhereOptions<lessonsAttributes> = {
      lessonname: lesson.lessonname,
      isdeleted: false,
      levelid: lesson.levelid,
    };
    if ((lesson.lessonid ?? "").trim().length > 0) {
      where = {
        ...where,
        lessonid: {
          [Op.not]: lesson.lessonid,
        },
      };
    }
    const tempdt = await lessons.count({ where });
    return tempdt > 0;
  };

  isexistsLessonID = async (lessonid: string) => {
    const where: WhereOptions<lessonsAttributes> = {
      lessonid,
      isdeleted: false,
    };
    const tempdt = await lessons.count({ where });
    return tempdt > 0;
  };

  updatePoints = async (lessonid?: string, levelid?: string) => {
    if (lessonid) {
      const practicespoints = await lessonpractices.findAll({
        where: {
          lessonid,
        },
        attributes: [[fn("sum", col("points")), "points"]],
      });
      const quizzespoints = await lessonquizzes.findAll({
        where: {
          lessonid,
        },
        attributes: [[fn("sum", col("points")), "points"]],
      });
      const lesson = await lessons.findOne({ where: { lessonid } });
      if (lesson) {
        lesson.practices_points = practicespoints[0]?.points;
        lesson.quizzes_points = quizzespoints[0]?.points;
        await lesson?.save({ fields: ["practices_points", "quizzes_points"] });
        const level = await lesson.getLevel();
        await new LevelBusiness().updateLevelPoints(level);
      }
    } else if (levelid) {
      const level = await levels.findOne({ where: { levelid } });
      if (level) {
        await new LevelBusiness().updateLevelPoints(level);
      }
    }
  };

  getLearningPracticeQuizPoints = async (lessonid: string) => {
    const ls = await new LessonBusiness().getLessonid(lessonid);
    if(!ls) throw new BadRequestException("Lesson not found");
    const learnings = await lessonlearnings.count({
      where: { lessonid, deleted_at: null },
    });
    const practices = await lessonpractices.count({
      where: { lessonid, deleted_at: null },
    });
    const quizzes = await lessonquizzes.count({
      where: { lessonid, deleted_at: null },
    });
    return { ls, learnings, practices, quizzes}
  };

  getpoints = async (lessonid: string) => {
    const { ls, learnings, practices, quizzes} = await this.getLearningPracticeQuizPoints(lessonid);
    const numbercomponents = learnings + practices + quizzes;
    const points = numbercomponents != 0 ? Math.floor(ls.total_points/numbercomponents) : 0;
    return { ls, learnings, practices, quizzes, points, numbercomponents};
  }

  savepointstolesson = async (lesson: lessons, learnings: number, quizzes: number, practices: number, points: number) => {
    lesson.brick_points = points;
    lesson.learning_points = learnings * points;
    lesson.practices_points = practices * points;
    lesson.quizzes_points = quizzes * points;
    lesson.save({ fields: ["brick_points","learning_points", "practices_points", "quizzes_points"]});
  }

  updatelearningpracticequiz = async (lessonid: string) => {
    const { points , ls, learnings, quizzes, practices } = await this.getpoints(lessonid);
    await this.savepointstolesson(ls, learnings, quizzes, practices, points);
    await new LessonLearningBusiness().updatealllearningpoints(lessonid, points);
    await new LessonPracticeBusiness().updateallpracticespoints(lessonid, points);
    await new LessonQuizBusiness().updateallquizzespoints(lessonid, points);
    await this.updateLeftPoints(ls, learnings, quizzes, practices, points)
    const level = await ls.getLevel();
    await new LevelBusiness().updateLevelPoints(level);
  }

  updateLeftPoints = async (lesson: lessons, learnings: number, quizzes: number, practices: number, points: number) => {
    const numbercomponents = learnings + practices + quizzes;
    if(points*numbercomponents < lesson.total_points) {
      const leftpoints = lesson.total_points - (points*numbercomponents);
      if(quizzes > 0) {
        await new LessonQuizBusiness().updatequizleftpoints(lesson, leftpoints);
        return;
      }
      if(practices > 0) {
        await new LessonPracticeBusiness().updatepracticeleftpoints(lesson, leftpoints);
        return;
      }
      if(learnings > 0) {
        await new LessonLearningBusiness().updatelearningleftpoints(lesson, leftpoints);
      }
    }
  }

  autoupdatealllessonprogress = async (user: any) => {
    const alllessons = await lessons.findAll({
      where: { isdeleted: false, lessonstatus: true }
    })
    for await (const lesson of alllessons) {
      const tempdt = await this.getLessonid(lesson.lessonid);
      if (tempdt) {
        tempdt.total_points = 100;
        tempdt.passing_points = 0;
        tempdt.updated_at = new Date();
        tempdt.updated_by = user?.lmsuserid;
        await tempdt.save({
          fields: [
            "total_points",
            "passing_points",
            "updated_at",
            "updated_by",
          ],
        });
        //await tempdt.reload();
        await this.updatelearningpracticequiz(tempdt.lessonid);
      }
    }
    return true;
  };
}
