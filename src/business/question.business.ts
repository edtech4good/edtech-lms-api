/* eslint-disable @typescript-eslint/no-explicit-any */
import { uniq } from "lodash";
import { Op, Order, WhereOptions } from "sequelize";
import { documents } from "src/models/data-models/documents";
import { lessonlearnings } from "src/models/data-models/lessonlearnings";
import { lessonpracticequestions } from "src/models/data-models/lessonpracticequestions";
import { lessonpractices } from "src/models/data-models/lessonpractices";
import { lessonquizquestions } from "src/models/data-models/lessonquizquestions";
import { lessonquizzes } from "src/models/data-models/lessonquizzes";
import { lessons } from "src/models/data-models/lessons";
import { levelquizquestions } from "src/models/data-models/levelquizquestions";
import { levels } from "src/models/data-models/levels";
import { FileMeta } from "src/models/filemeta.model";
import { IPaging } from "src/models/IPaging";
import { Question } from "src/models/question.model";
import { QuestionOption } from "src/models/questionoption.model";
import { LmsUserToken } from "src/models/token.model";
import { buildWhere, buildWhereOR, rawfilenameextractor } from "src/services/util.service";
import { v4 as uuidv4 } from "uuid";
import {
  questions,
  questionsAttributes,
} from "../models/data-models/questions";
import { OrgContext } from "src/decorators/org.decorator";
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { andScope, findOwnedQuestion } from "./content-scope";
import { andOrganisation, extractOrganisationFilter } from "./row-owner";

/**
 * An option keeps the id the request carries: translations of an option's text are keyed by that id (bilingual content),
 * so an id that changed on every save would leave a translation beside another option's correct/incorrect flag. An
 * option that carries none (a new one) gets a new id. A matching partner (`questionassociate`) has no id of its own and
 * takes its option's. Two options of one question with the same id are refused (400): a translation could not tell them apart.
 */
export const withOptionIds = (options: any[]): QuestionOption[] => {
  const seen = new Set<string>();
  return options.map((questionoption: any) => {
    const tempquestionoption: QuestionOption = { ...questionoption };
    const given = tempquestionoption.questionoptionid;
    tempquestionoption.questionoptionid = typeof given === "string" && given.trim() !== "" ? given : uuidv4();
    if (seen.has(tempquestionoption.questionoptionid)) {
      throw new ApiError(ErrorCode.INVALID_INPUT, "Two options of this question have the same id.", {
        fields: [{ field: "questionoptions", message: "Each option of a question needs its own id." }],
      });
    }
    seen.add(tempquestionoption.questionoptionid);
    if (tempquestionoption.questionassociate) {
      tempquestionoption.questionassociate = { ...tempquestionoption.questionassociate, questionoptionid: tempquestionoption.questionoptionid };
    }
    return tempquestionoption;
  });
};

/** A distractor keeps the id it carries (it always has); two with the same non-empty id are refused (400), for the reason `withOptionIds` gives. */
export const assertUniqueDistractorIds = (distractors: any): void => {
  if (!Array.isArray(distractors)) return;
  const seen = new Set<string>();
  for (const d of distractors) {
    const id = d?.questiondistractorid;
    if (typeof id !== "string" || id.trim() === "") continue;
    if (seen.has(id)) {
      throw new ApiError(ErrorCode.INVALID_INPUT, "Two distractors of this question have the same id.", {
        fields: [{ field: "questiondistractors", message: "Each distractor of a question needs its own id." }],
      });
    }
    seen.add(id);
  }
};

/**
 * Built with the caller's context, every read and write here is limited to the questions in scope (a question of
 * another organisation is reported exactly as an absent one); built without one it is unscoped (the sync payload,
 * and the readers that assemble a lesson for export).
 */
export class QuestionBusiness {
  constructor(private readonly org?: OrgContext) {}

  createquestion = async (question: questionsAttributes, user: LmsUserToken) => {
    let tempquestion: any = new Question();
    tempquestion = { ...question };
    tempquestion.questionid = uuidv4();
    tempquestion.isdeleted = false;
    tempquestion.questioncorrectvalue = question.questioncorrectvalue;
    if (tempquestion.questionoptions) {
      tempquestion.questionoptions = withOptionIds(tempquestion.questionoptions);
    }
    assertUniqueDistractorIds(tempquestion.questiondistractors);
    tempquestion.questionstatus = true;
    tempquestion.created_by = user.lmsuserid;
    return await questions.create(tempquestion);
  };

  updatequestion = async (question: questionsAttributes, user: LmsUserToken) => {
    const oldQuestion = await this.getquestionbyid(question.questionid);
    if (oldQuestion) {
      let tempquestion: any = new Question();
      tempquestion = { ...question };

      if (tempquestion.questionoptions) {
        tempquestion.questionoptions = withOptionIds(tempquestion.questionoptions);
      }
      assertUniqueDistractorIds(tempquestion.questiondistractors);
      oldQuestion.questiondistractors = tempquestion.questiondistractors;
      oldQuestion.questionoptions = tempquestion.questionoptions;
      oldQuestion.questionheading = tempquestion.questionheading;
      oldQuestion.questionidentifier = tempquestion.questionidentifier;
      oldQuestion.questiontext = tempquestion.questiontext;
      oldQuestion.questionfile = tempquestion.questionfile;
      oldQuestion.questionfeedback = tempquestion.questionfeedback;
      oldQuestion.templatetypeid = tempquestion.templatetypeid;
      oldQuestion.questioncorrectvalue = tempquestion.questioncorrectvalue;
      oldQuestion.lastupdated = new Date();
      oldQuestion.updated_at = new Date();
      oldQuestion.updated_by = user.lmsuserid;

      return await oldQuestion.save();
    } else {
      throw new Error("Invalid Question");
    }
  };

  updatequestionIdentifier = async (
    questionid: string,
    questionidentifier: string,
    user: LmsUserToken
  ) => {
    const oldQuestion = await this.getquestionbyid(questionid);
    if (oldQuestion) {
      oldQuestion.questionidentifier = questionidentifier;
      oldQuestion.lastupdated = new Date();
      oldQuestion.updated_at = new Date();
      oldQuestion.updated_by = user.lmsuserid;
      return await oldQuestion.save();
    } else {
      throw new Error("Invalid Question");
    }
  };
  getquestionbyid = (questionid: string) =>
    this.org
      ? findOwnedQuestion(this.org, questionid, { where: { isdeleted: false } })
      : questions.findOne({ where: { questionid, isdeleted: false } });
  // The organisation payload (format 3): whole rows, the owner included, for the questions in scope.
  getquestionsWithOwner = async () => questions.findAll({ where: await andScope(this.org, "question") });
  getquestionall = async (paging: IPaging) => {
    let where: WhereOptions<questionsAttributes> = {
      isdeleted: false,
    };

    const order: Order = [["lastupdated", "DESC"]];
    const limit = paging.pagesize || 20;
    let offset = 0;
    if ((paging.pageindex || 1) > 1) {
      offset = limit * ((paging.pageindex || 1) - 1);
    }
    const { organisationid, rest } = extractOrganisationFilter(paging.filter);
    where = { ...buildWhere<questionsAttributes>({ ...paging, filter: rest }, where) };
    where = await andScope(this.org, "question", where);
    where = await andOrganisation(where, "question", organisationid);

    return await questions.findAndCountAll({ where, order, limit, offset });
  };

  getquestionallOR = async (paging: IPaging) => {
    let where: WhereOptions<questionsAttributes> = {
      isdeleted: false,
    };

    const order: Order = [["lastupdated", "DESC"]];
    const limit = paging.pagesize || 20;
    let offset = 0;
    if ((paging.pageindex || 1) > 1) {
      offset = limit * ((paging.pageindex || 1) - 1);
    }
    // The organisation is an AND on top of the OR of the other filters.
    const { organisationid, rest } = extractOrganisationFilter(paging.filter);
    where = { ...buildWhereOR<questionsAttributes>({ ...paging, filter: rest }, where) };
    where = await andScope(this.org, "question", where);
    where = await andOrganisation(where, "question", organisationid);

    return await questions.findAndCountAll({ where, order, limit, offset });
  };

  deletequestion = async (questionid: string, user: LmsUserToken) => {
    const tempdt = await this.getquestionbyid(questionid);
    if (tempdt) {
      tempdt.isdeleted = true;
      tempdt.lastupdated = new Date();
      tempdt.deleted_at = new Date();
      tempdt.deleted_by = user.lmsuserid;
      await tempdt.save({ fields: ["isdeleted", "lastupdated", 'deleted_at', 'deleted_by'] });
      return true;
    } else {
      return false;
    }
  };
  activatequestion = async (questionid: string) => {
    const tempdt = await this.getquestionbyid(questionid);
    if (tempdt) {
      tempdt.questionstatus = true;
      tempdt.lastupdated = new Date();
      await tempdt.save({ fields: ["questionstatus", "lastupdated"] });
      return true;
    } else {
      return false;
    }
  };
  deactivatequestion = async (questionid: string) => {
    const tempdt = await this.getquestionbyid(questionid);
    if (tempdt) {
      tempdt.questionstatus = false;
      tempdt.lastupdated = new Date();
      await tempdt.save({ fields: ["questionstatus", "lastupdated"] });
      return true;
    } else {
      return false;
    }
  };
  isexistsquestionIdentifier = async (question: questionsAttributes) => {
    const where: WhereOptions<questionsAttributes> = {
      questionidentifier: question.questionidentifier,
      isdeleted: false,
    };
    if ((question.questionid ?? "").trim().length > 0) {
      where.questionid = { [Op.not]: question.questionid };
    }
    const tempdt = await questions.count({ where: await andScope(this.org, "question", where) });
    return tempdt > 0;
  };

  isexistsquestionID = async (questionid: string) => {
    const where: WhereOptions<questionsAttributes> = {
      questionid,
      isdeleted: false,
    };
    const tempdt = await questions.count({ where: await andScope(this.org, "question", where) });
    return tempdt > 0;
  };

  addquestionTag = async (questionid: string, tag: string, user: LmsUserToken) => {
    const tempdt = await this.getquestionbyid(questionid);
    if (tempdt) {
      tempdt.isdeleted = true;
      const temptags: Array<string> = <Array<string>>tempdt.questiontags || [];
      tempdt.questiontags = [...temptags, tag];
      tempdt.questiontags = uniq(<Array<string>>tempdt.questiontags);
      tempdt.lastupdated = new Date();
      tempdt.updated_at = new Date();
      tempdt.updated_by = user.lmsuserid;
      await tempdt.save({ fields: ["questiontags", "lastupdated", 'updated_at', 'updated_by'] });
      return true;
    } else {
      return false;
    }
  };

  deletequestionTag = async (questionid: string, tag: string, user: LmsUserToken) => {
    const tempdt = await this.getquestionbyid(questionid);
    if (tempdt) {
      tempdt.isdeleted = true;
      tempdt.updated_at = new Date();
      tempdt.updated_by = user.lmsuserid;
      const temptags: Array<string> = <Array<string>>tempdt.questiontags || [];
      tempdt.questiontags = [...temptags, tag];
      tempdt.questiontags = (<Array<string>>tempdt.questiontags).filter(
        (x) => x !== tag
      );
      await tempdt.save({ fields: ["questiontags", "lastupdated", 'updated_at', 'updated_by'] });
      return true;
    } else {
      return false;
    }
  };

  getlessonquestions = async (lessonid: string) => {
    lessons.hasMany(lessonlearnings, {
      foreignKey: "lessonid",
      sourceKey: "lessonid",
    });
    lessonlearnings.belongsTo(lessons, {
      foreignKey: "lessonid",
    });

    // lesson practice
    lessons.hasMany(lessonpractices, {
      foreignKey: "lessonid",
      sourceKey: "lessonid",
    });
    lessonpractices.belongsTo(lessons, {
      foreignKey: "lessonid",
    });

    lessonpractices.hasMany(lessonpracticequestions, {
      foreignKey: "lessonpracticeid",
      sourceKey: "lessonpracticeid",
    });
    lessonpracticequestions.belongsTo(lessonpractices, {
      foreignKey: "lessonpracticeid",
    });

    lessonpracticequestions.hasOne(questions, {
      foreignKey: "questionid",
      sourceKey: "questionid",
    });
    questions.belongsTo(lessonpracticequestions, {
      foreignKey: "questionid",
    });

    // lesson quiz
    lessons.hasMany(lessonquizzes, {
      foreignKey: "lessonid",
      sourceKey: "lessonid",
    });
    lessonquizzes.belongsTo(lessons, {
      foreignKey: "lessonid",
    });

    lessonquizzes.hasMany(lessonquizquestions, {
      foreignKey: "lessonquizid",
      sourceKey: "lessonquizid",
    });
    lessonquizquestions.belongsTo(lessonquizzes, {
      foreignKey: "lessonquizid",
    });

    lessonquizquestions.hasOne(questions, {
      foreignKey: "questionid",
      sourceKey: "questionid",
    });
    questions.belongsTo(lessonquizquestions, {
      foreignKey: "questionid",
    });

    const question = await lessons.findOne({
      where: { lessonid, lessonstatus: true, isdeleted: false },
      attributes: {
        exclude: [],
      },
      include: [
        {
          where: {
            lessonid: { [Op.ne]: null },
            lessonlearningstatus: true,
          },
          model: lessonlearnings,
          required: false,
          order: [["lessonlearningorder", "ASC"]],
        },
        {
          where: {
            lessonpracticeid: { [Op.ne]: null },
            lessonpracticestatus: true,
          },
          required: false,
          model: lessonpractices,
          order: [["lessonpracticeorder", "ASC"]],
        },
        {
          where: {
            lessonquizid: { [Op.ne]: null },
            lessonquizstatus: true,
          },
          required: false,
          model: lessonquizzes,
          order: [["lessonquizorder", "ASC"]],
        },
      ],
    });
    if (question) {
      const lpq = await lessonpracticequestions.findAll({
        where: {
          lessonpracticeid: {
            [Op.in]: question.lessonpractices.map((x) => x.lessonpracticeid),
          },
          lessonpracticequestionstatus: true,
        },
        include: [
          {
            where: { questionid: { [Op.ne]: null } },
            required: false,
            model: questions,
          },
        ],
      });

      const lqq = await lessonquizquestions.findAll({
        where: {
          lessonquizid: {
            [Op.in]: question.lessonquizzes.map((x) => x.lessonquizid),
          },
          lessonquizquestionstatus: true,
        },
        include: [
          {
            where: { questionid: { [Op.ne]: null } },
            required: false,
            model: questions,
          },
        ],
      });
      let questionobject: any = {
        ...question.get({ plain: true }),
      };
      // An item with no primary document (a type that is not one file) has no file to name: it carries none, instead of
      // the "invalid" placeholder a missing name becomes, so the media list built from this path adds nothing for it.
      const learningdocuments = await documents.findAll({
        where: {
          documentid: {
            [Op.in]: questionobject.lessonlearnings
              .map((x: any) => x.documentid)
              .filter((id: unknown) => id !== null && id !== undefined),
          },
        },
      });

      questionobject.lessonlearnings = questionobject.lessonlearnings.map(
        (x: lessonlearnings & { lessonlearningfileobject: FileMeta | null }) => {
          return {
            ...x,
            lessonlearningfileobject:
              x.documentid === null || x.documentid === undefined
                ? null
                : rawfilenameextractor(
                    learningdocuments.find((y) => y.documentid === x.documentid)
                      ?.documentname || ""
                  ),
          };
        }
      );
      questionobject = {
        ...questionobject,
        learningpath: [
          ...questionobject.lessonlearnings.map(
            (x: lessonlearnings & { lessonlearningfileobject: FileMeta }) => ({
              ...x,

              learningpathname: x.lessonlearningname,
              learningpathdescription: x.lessonlearningdescription,
              learningpathid: x.lessonlearningid,
              learningpathorder: x.lessonlearningorder,
            })
          ),
          ...questionobject.lessonpractices.map((x: lessonpractices) => ({
            ...x,
            learningpathname: x.lessonpracticename,
            learningpathid: x.lessonpracticeid,
            learningpathorder: x.lessonpracticeorder,
            learningpathdescription: x.lessonpracticeorder,
            lessonpracticequestions: lpq.filter(
              (xx) => xx.lessonpracticeid === x.lessonpracticeid
            ),
          })),
          ...questionobject.lessonquizzes.map((x: lessonquizzes) => ({
            ...x,
            learningpathname: x.lessonquizname,
            learningpathid: x.lessonquizid,
            learningpathorder: x.lessonquizorder,
            learningpathdescription: x.lessonquizorder,
            lessonquizquestions: lqq.filter(
              (xx) => xx.lessonquizid === x.lessonquizid
            ),
          })),
        ],
      };
      return questionobject;
    }
    return null;
  };
  getlevelquestions = async (levelid: string) => {
    levels.hasMany(levelquizquestions, {
      foreignKey: "levelid",
      sourceKey: "levelid",
    });
    levelquizquestions.belongsTo(levels, {
      foreignKey: "levelid",
    });

    levelquizquestions.hasOne(questions, {
      foreignKey: "questionid",
      sourceKey: "questionid",
    });
    questions.belongsTo(levelquizquestions, {
      foreignKey: "questionid",
    });

    const question = await levels.findOne({
      where: { levelid, levelstatus: true },
      attributes: {
        exclude: [],
      },
      include: [
        {
          where: {
            levelquizquestionid: { [Op.ne]: null },
            levelquizquestionstatus: true,
          },
          model: levelquizquestions,
          order: [["levelquizquestionorder", "ASC"]],
          include: [
            {
              where: { questionid: { [Op.ne]: null } },
              model: questions,
            },
          ],
        },
      ],
    });
    if (question) {
      let questionobject: any = question.get({ plain: true });
      questionobject = {
        ...questionobject,
        learningpath: [
          ...questionobject.levelquizquestions.map((x: levelquizquestions) => ({
            ...x,
            learningpathname: x.levelquizquestionorder,
            learningpathid: x.levelquizquestionid,
            learningpathorder: x.levelquizquestionorder,
            learningpathdescription: x.levelquizquestionorder,
          })),
        ],
      };
      return questionobject;
    }
    return null;
  };
}
