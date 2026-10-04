/* eslint-disable @typescript-eslint/no-explicit-any */
import { Op, WhereOptions } from "sequelize";
import { LessonQuizQuestionBase } from "src/modules/lesson/models/LessonQuizQuestionBase";
import { v4 as uuidv4 } from "uuid";
import {
  lessonquizquestions,
  lessonquizquestionsAttributes,
  lessonquizzes,
  lessons,
  questions,
} from "../models/data-models/init-models";

import { OrgContext } from "src/decorators/org.decorator";
import { andScope, findOwnedQuizQuestion, findOwnedQuiz } from "./content-scope";

/**
 * Built with the caller's context, every read and write here is limited to the rows in scope (a row of another
 * organisation is reported exactly as an absent one); built without one it is unscoped (the sync payloads, and
 * the recompute of a lesson's points, which only ever runs on a lesson that was found in scope).
 */
export class LessonQuizQuestionBusiness {
  constructor(private readonly org?: OrgContext) {}

  createLessonQuizQuestion = async (
    lessonquizquestion: lessonquizquestionsAttributes
  ) => {
    lessonquizquestion.lessonquizquestionid = uuidv4();
    lessonquizquestion.lessonquizquestionstatus = true;
    return await lessonquizquestions.create(lessonquizquestion);
  };
  getLessonQuizQuestionbyid = async (lessonquizquestionid: string) => {
    if (this.org) {
      await findOwnedQuizQuestion(this.org, lessonquizquestionid);
    }
    lessonquizzes.belongsTo(lessonquizquestions, {
      foreignKey: "lessonquizid",
    });
    lessonquizquestions.hasOne(lessonquizzes, {
      foreignKey: "lessonquizid",
      sourceKey: "lessonquizid",
    });

    lessons.belongsTo(lessonquizzes, {
      foreignKey: "lessonid",
    });
    lessonquizzes.hasOne(lessons, {
      foreignKey: "lessonid",
      sourceKey: "lessonid",
    });

    questions.belongsTo(lessonquizquestions, {
      foreignKey: "questionid",
    });
    lessonquizquestions.hasOne(questions, {
      foreignKey: "questionid",
      sourceKey: "questionid",
    });

    const data = await lessonquizquestions.findOne({
      where: { lessonquizquestionid },
      include: [
        {
          model: lessonquizzes,
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
      ? <LessonQuizQuestionBase>{
          lessonid: data.lessonquiz.lessonid,
          lessonname: data.lessonquiz.lesson.lessonname,
          lessonquizquestionid: data.lessonquizquestionid,
          lessonquizid: data.lessonquizid,
          questionid: data.questionid,
          lessonquizquestionstatus: data.lessonquizquestionstatus,
          lessonquizquestionorder: data.lessonquizquestionorder,
          lessonquizname: data.lessonquiz.lessonquizname,
          questionidentifier: data.question.questionidentifier,
        }
      : null;
  };
  getLessonQuizQuestionbyLessonid = async (lessonquizid: string) => {
    if (this.org) {
      await findOwnedQuiz(this.org, lessonquizid);
    }
    lessonquizzes.belongsTo(lessonquizquestions, {
      foreignKey: "lessonquizid",
    });
    lessonquizquestions.hasOne(lessonquizzes, {
      foreignKey: "lessonquizid",
      sourceKey: "lessonquizid",
    });

    lessons.belongsTo(lessonquizzes, {
      foreignKey: "lessonid",
    });
    lessonquizzes.hasOne(lessons, {
      foreignKey: "lessonid",
      sourceKey: "lessonid",
    });

    questions.belongsTo(lessonquizquestions, {
      foreignKey: "questionid",
    });
    lessonquizquestions.hasOne(questions, {
      foreignKey: "questionid",
      sourceKey: "questionid",
    });

    const data = await lessonquizquestions.findAll({
      where: await andScope(this.org, "quizquestion", { lessonquizid }),
      include: [
        {
          model: lessonquizzes,
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
      order: ["lessonquizquestionorder"],
    });
    return data
      ? data.map(
          (x) =>
            <LessonQuizQuestionBase>{
              lessonid: x.lessonquiz.lessonid,
              lessonname: x.lessonquiz.lesson.lessonname,
              lessonquizquestionid: x.lessonquizquestionid,
              lessonquizid: x.lessonquizid,
              questionid: x.questionid,
              lessonquizquestionstatus: x.lessonquizquestionstatus,
              lessonquizquestionorder: x.lessonquizquestionorder,
              lessonquizname: x.lessonquiz.lessonquizname,
              questionidentifier: x.question.questionidentifier,
            }
        )
      : null;
  };
  getLessonQuizQuestionid = async (lessonquizquestionid: string) =>
    this.org
      ? findOwnedQuizQuestion(this.org, lessonquizquestionid)
      : lessonquizquestions.findOne({
      where: { lessonquizquestionid },
    });

  getLessonQuizQuestions = async () => {
    const where: WhereOptions<lessonquizquestionsAttributes> = {};
    const order = ["lessonquizquestionorder"];

    return await lessonquizquestions.findAll({ where: await andScope(this.org, "quizquestion", where), order });
  };

  deleteLessonQuizQuestion = async (lessonquizquestionid: string) => {
    const tempdt = await this.getLessonQuizQuestionid(lessonquizquestionid);
    if (tempdt) {
      await tempdt.destroy();
      return true;
    } else {
      return false;
    }
  };

  activateLessonQuizQuestion = async (lessonquizquestionid: string) => {
    const tempdt = await this.getLessonQuizQuestionid(lessonquizquestionid);
    if (tempdt) {
      tempdt.lessonquizquestionstatus = true;
      await tempdt.save({ fields: ["lessonquizquestionstatus"] });
      return true;
    } else {
      return false;
    }
  };

  updateorderLessonQuizQuestion = async (
    lessonquizquestionid: string,
    lessonquizquestionorder: number
  ) => {
    const tempdt = await this.getLessonQuizQuestionid(lessonquizquestionid);
    if (tempdt) {
      tempdt.lessonquizquestionorder = lessonquizquestionorder;
      await tempdt.save({ fields: ["lessonquizquestionorder"] });
      return true;
    } else {
      return false;
    }
  };

  deactivateLessonQuizQuestion = async (lessonquizquestionid: string) => {
    const tempdt = await this.getLessonQuizQuestionid(lessonquizquestionid);
    if (tempdt) {
      tempdt.lessonquizquestionstatus = false;
      await tempdt.save({ fields: ["lessonquizquestionstatus"] });
      return true;
    } else {
      return false;
    }
  };

  isexistsLessonQuizQuestionID = async (lessonquizquestionid: string) => {
    const where: WhereOptions<lessonquizquestionsAttributes> = {
      lessonquizquestionid,
    };
    const tempdt = await lessonquizquestions.count({ where: await andScope(this.org, "quizquestion", where) });
    return tempdt > 0;
  };

  isexistsLessonQuizQuestionAdded = async (
    lessonquizid: string,
    questionid: string,
    lessonquizquestionid: string | null | undefined = ""
  ) => {
    let where: WhereOptions<lessonquizquestionsAttributes> = {
      lessonquizid,
      questionid,
    };

    if ((lessonquizquestionid ?? "").trim().length > 0) {
      where = {
        ...where,
        lessonquizquestionid: {
          [Op.not]: lessonquizquestionid as string,
        },
      };
    }
    const tempdt = await lessonquizquestions.count({ where: await andScope(this.org, "quizquestion", where) });
    return tempdt > 0;
  };
}
