/* eslint-disable @typescript-eslint/no-explicit-any */
import { Op, WhereOptions } from "sequelize";
import { LessonPracticeQuestionBase } from "src/modules/lesson/models/LessonPracticeQuestionBase";
import { v4 as uuidv4 } from "uuid";
import {
  lessonpracticequestions,
  lessonpracticequestionsAttributes,
  lessonpractices,
  lessons,
  questions,
} from "../models/data-models/init-models";

import { OrgContext } from "src/decorators/org.decorator";
import { andScope, findOwnedPracticeQuestion, findOwnedPractice } from "./content-scope";

/**
 * Built with the caller's context, every read and write here is limited to the rows in scope (a row of another
 * organisation is reported exactly as an absent one); built without one it is unscoped (the sync payloads, and
 * the recompute of a lesson's points, which only ever runs on a lesson that was found in scope).
 */
export class LessonPracticeQuestionBusiness {
  constructor(private readonly org?: OrgContext) {}

  createLessonPracticeQuestion = async (
    lessonpracticequestion: lessonpracticequestionsAttributes
  ) => {
    lessonpracticequestion.lessonpracticequestionid = uuidv4();
    lessonpracticequestion.lessonpracticequestionstatus = true;
    return await lessonpracticequestions.create(lessonpracticequestion);
  };
  getLessonPracticeQuestionbyid = async (lessonpracticequestionid: string) => {
    if (this.org) {
      await findOwnedPracticeQuestion(this.org, lessonpracticequestionid);
    }
    lessonpractices.belongsTo(lessonpracticequestions, {
      foreignKey: "lessonpracticeid",
    });
    lessonpracticequestions.hasOne(lessonpractices, {
      foreignKey: "lessonpracticeid",
      sourceKey: "lessonpracticeid",
    });

    lessons.belongsTo(lessonpractices, {
      foreignKey: "lessonid",
    });
    lessonpractices.hasOne(lessons, {
      foreignKey: "lessonid",
      sourceKey: "lessonid",
    });

    questions.belongsTo(lessonpracticequestions, {
      foreignKey: "questionid",
    });
    lessonpracticequestions.hasOne(questions, {
      foreignKey: "questionid",
      sourceKey: "questionid",
    });

    const data = await lessonpracticequestions.findOne({
      where: { lessonpracticequestionid },
      include: [
        {
          model: lessonpractices,
          include: [
            {
              model: lessons,
            },
          ],
        },
        {
          model: questions,
        },
      ],
    });
    return data
      ? <LessonPracticeQuestionBase>{
          lessonid: data.lessonpractice.lessonid,
          lessonname: data.lessonpractice.lesson.lessonname,
          lessonpracticequestionid: data.lessonpracticequestionid,
          lessonpracticeid: data.lessonpracticeid,
          questionid: data.questionid,
          lessonpracticequestionstatus: data.lessonpracticequestionstatus,
          lessonpracticequestionorder: data.lessonpracticequestionorder,
          lessonpracticename: data.lessonpractice.lessonpracticename,
          questionidentifier: data.question.questionidentifier,
        }
      : null;
  };
  getLessonPracticeQuestionbyLessonid = async (lessonpracticeid: string) => {
    if (this.org) {
      await findOwnedPractice(this.org, lessonpracticeid);
    }
    lessonpractices.belongsTo(lessonpracticequestions, {
      foreignKey: "lessonpracticeid",
    });
    lessonpracticequestions.hasOne(lessonpractices, {
      foreignKey: "lessonpracticeid",
      sourceKey: "lessonpracticeid",
    });

    lessons.belongsTo(lessonpractices, {
      foreignKey: "lessonid",
    });
    lessonpractices.hasOne(lessons, {
      foreignKey: "lessonid",
      sourceKey: "lessonid",
    });

    questions.belongsTo(lessonpracticequestions, {
      foreignKey: "questionid",
    });
    lessonpracticequestions.hasOne(questions, {
      foreignKey: "questionid",
      sourceKey: "questionid",
    });

    const data = await lessonpracticequestions.findAll({
      where: await andScope(this.org, "practicequestion", { lessonpracticeid }),
      include: [
        {
          model: lessonpractices,
          include: [
            {
              model: lessons,
            },
          ],
        },
        {
          model: questions,
        },
      ],
      order: ["lessonpracticequestionorder"],
    });
    return data
      ? data.map(
          (x) =>
            <LessonPracticeQuestionBase>{
              lessonid: x.lessonpractice.lessonid,
              lessonname: x.lessonpractice.lesson.lessonname,
              lessonpracticequestionid: x.lessonpracticequestionid,
              lessonpracticeid: x.lessonpracticeid,
              questionid: x.questionid,
              lessonpracticequestionstatus: x.lessonpracticequestionstatus,
              lessonpracticequestionorder: x.lessonpracticequestionorder,
              lessonpracticename: x.lessonpractice.lessonpracticename,
              questionidentifier: x.question.questionidentifier,
            }
        )
      : null;
  };
  getLessonPracticeQuestionid = async (lessonpracticequestionid: string) =>
    this.org
      ? findOwnedPracticeQuestion(this.org, lessonpracticequestionid)
      : lessonpracticequestions.findOne({
      where: { lessonpracticequestionid },
    });

  getLessonPracticeQuestions = async () => {
    const where: WhereOptions<lessonpracticequestionsAttributes> = {};
    const order = ["lessonpracticequestionorder"];

    return await lessonpracticequestions.findAll({ where: await andScope(this.org, "practicequestion", where), order });
  };

  deleteLessonPracticeQuestion = async (lessonpracticequestionid: string) => {
    const tempdt = await this.getLessonPracticeQuestionid(lessonpracticequestionid);
    if (tempdt) {
      await tempdt.destroy();
      return true;
    } else {
      return false;
    }
  };

  activateLessonPracticeQuestion = async (lessonpracticequestionid: string) => {
    const tempdt = await this.getLessonPracticeQuestionid(lessonpracticequestionid);
    if (tempdt) {
      tempdt.lessonpracticequestionstatus = true;
      await tempdt.save({ fields: ["lessonpracticequestionstatus"] });
      return true;
    } else {
      return false;
    }
  };

  updateorderLessonPracticeQuestion = async (
    lessonpracticequestionid: string,
    lessonpracticequestionorder: number
  ) => {
    const tempdt = await this.getLessonPracticeQuestionid(lessonpracticequestionid);
    if (tempdt) {
      tempdt.lessonpracticequestionorder = lessonpracticequestionorder;
      await tempdt.save({ fields: ["lessonpracticequestionorder"] });
      return true;
    } else {
      return false;
    }
  };

  deactivateLessonPracticeQuestion = async (lessonpracticequestionid: string) => {
    const tempdt = await this.getLessonPracticeQuestionid(lessonpracticequestionid);
    if (tempdt) {
      tempdt.lessonpracticequestionstatus = false;
      await tempdt.save({ fields: ["lessonpracticequestionstatus"] });
      return true;
    } else {
      return false;
    }
  };

  isexistsLessonPracticeQuestionID = async (lessonpracticequestionid: string) => {
    const where: WhereOptions<lessonpracticequestionsAttributes> = {
      lessonpracticequestionid,
    };
    const tempdt = await lessonpracticequestions.count({ where: await andScope(this.org, "practicequestion", where) });
    return tempdt > 0;
  };

  isexistsLessonPracticeQuestionAdded = async (
    lessonpracticeid: string,
    questionid: string,
    lessonpracticequestionid: string | null | undefined = ""
  ) => {
    let where: WhereOptions<lessonpracticequestionsAttributes> = {
      lessonpracticeid,
      questionid,
    };

    if ((lessonpracticequestionid ?? "").trim().length > 0) {
      where = {
        ...where,
        lessonpracticequestionid: {
          [Op.not]: lessonpracticequestionid as string,
        },
      };
    }
    const tempdt = await lessonpracticequestions.count({ where: await andScope(this.org, "practicequestion", where) });
    return tempdt > 0;
  };
}
