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
export class QuestionBusiness {
  createquestion = async (question: questionsAttributes, user: LmsUserToken) => {
    let tempquestion: any = new Question();
    tempquestion = { ...question };
    tempquestion.questionid = uuidv4();
    tempquestion.isdeleted = false;
    tempquestion.questioncorrectvalue = question.questioncorrectvalue;
    if (tempquestion.questionoptions) {
      tempquestion.questionoptions = tempquestion.questionoptions.map(
        (questionoption: any) => {
          const tempquestionoption: QuestionOption = { ...questionoption };
          tempquestionoption.questionoptionid = uuidv4();

          if (tempquestionoption.questionassociate) {
            tempquestionoption.questionassociate.questionoptionid =
              tempquestionoption.questionoptionid;
          }

          return tempquestionoption;
        }
      );
    }
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
        tempquestion.questionoptions = tempquestion.questionoptions.map(
          (questionoption: any) => {
            const tempquestionoption: QuestionOption = { ...questionoption };
            tempquestionoption.questionoptionid = uuidv4();

            if (tempquestionoption.questionassociate) {
              tempquestionoption.questionassociate.questionoptionid =
                tempquestionoption.questionoptionid;
            }

            return tempquestionoption;
          }
        );
      }
      oldQuestion.questiondistractors = tempquestion.questiondistractors;
      oldQuestion.questionoptions = tempquestion.questionoptions;
      oldQuestion.questionheading = tempquestion.questionheading;
      oldQuestion.questionidentifier = tempquestion.questionidentifier;
      oldQuestion.questiontext = tempquestion.questiontext;
      oldQuestion.questionfile = tempquestion.questionfile;
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
    questions.findOne({ where: { questionid, isdeleted: false } });
  getquestions = () => questions.findAll({});
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
    where = { ...buildWhere<questionsAttributes>(paging, where) };

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
    where = { ...buildWhereOR<questionsAttributes>(paging, where) };

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
    const tempdt = await questions.count({ where });
    return tempdt > 0;
  };

  isexistsquestionID = async (questionid: string) => {
    const where: WhereOptions<questionsAttributes> = {
      questionid,
      isdeleted: false,
    };
    const tempdt = await questions.count({ where });
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
      const learningdocuments = await documents.findAll({
        where: {
          documentid: {
            [Op.in]: questionobject.lessonlearnings.map(
              (x: any) => x.documentid
            ),
          },
        },
      });

      questionobject.lessonlearnings = questionobject.lessonlearnings.map(
        (x: lessonlearnings & { lessonlearningfileobject: FileMeta }) => {
          return {
            ...x,
            lessonlearningfileobject: rawfilenameextractor(
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
