/* eslint-disable @typescript-eslint/no-explicit-any */
import { Op, WhereOptions } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import {
  documents,
  lessonlearnings,
  lessons,
} from "../models/data-models/init-models";
import { lessonplans, lessonplansAttributes } from "src/models/data-models/lessonplan";
import { LessonPlanBase } from "src/modules/lesson/models/LessonPlansResponse";

export class LessonPlanBusiness {
  createLessonPlan = async (lessonplan: lessonplansAttributes) => {
    lessonplan.lessonplanid = uuidv4();
    lessonplan.lessonplanstatus = true;
    const ln = await lessonplans.create(lessonplan);
    return ln;
  };
  getLessonPlanbyid = async (lessonplanid: string) => {
    lessons.belongsTo(lessonplans, {
      foreignKey: "lessonid",
    });
    lessonplans.hasOne(lessons, {
      foreignKey: "lessonid",
      sourceKey: "lessonid",
    });

    documents.belongsTo(lessonplans, {
      foreignKey: "documentid",
    });
    lessonplans.hasOne(documents, {
      foreignKey: "documentid",
      sourceKey: "documentid",
    });

    const data = await lessonplans.findOne({
      where: { lessonplanid },
      include: [
        {
          model: documents,
        },
        {
          model: lessons,
        },
      ],
    });
    return data
      ? <LessonPlanBase>{
          lessonplanid: data.lessonplanid,
          lessonplanname: data.lessonplanname,
          lessonplandescription: data.lessonplandescription,
          lessonid: data.lessonid,
          documentid: data.documentid,
          lessonplanstatus: data.lessonplanstatus,
          lessonplanorder: data.lessonplanorder,
          lessonname: data.lesson.lessonname,
          lessondescription: data.lesson.lessondescription,
          documentname: data.document.documentname,
          documenttypeid: data.document.documenttypeid,
        }
      : null;
  };
  getLessonPlanbyLessonid = async (lessonid: string) => {
    lessons.belongsTo(lessonplans, {
      foreignKey: "lessonid",
    });
    lessonplans.hasOne(lessons, {
      foreignKey: "lessonid",
      sourceKey: "lessonid",
    });

    documents.belongsTo(lessonplans, {
      foreignKey: "documentid",
    });
    lessonplans.hasOne(documents, {
      foreignKey: "documentid",
      sourceKey: "documentid",
    });

    const data = await lessonplans.findAll({
      where: { lessonid },
      include: [
        {
          model: documents,
        },
        {
          model: lessons,
        },
      ],
      order: ["lessonplanorder"],
    });
    return data
      ? data.map(
          (x) =>
            <LessonPlanBase>{
              lessonplanid: x.lessonplanid,
              lessonplanname: x.lessonplanname,
              lessonplandescription: x.lessonplandescription,
              lessonid: x.lessonid,
              documentid: x.documentid,
              lessonplanstatus: x.lessonplanstatus,
              lessonplanorder: x.lessonplanorder,
              lessonname: x.lesson.lessonname,
              lessondescription: x.lesson.lessondescription,
              documentname: x.document.documentname,
              documenttypeid: x.document.documenttypeid,
            }
        )
      : null;
  };
  getLessonLearningid = async (lessonlearningid: string) =>
    lessonlearnings.findOne({
      where: { lessonlearningid },
    });

  getLessonPlanid = async (lessonplanid: string) =>
    lessonplans.findOne({
      where: { lessonplanid },
    });

  getLessonPlans = async () => {
    const where: WhereOptions<lessonplansAttributes> = {};
    const order = ["lessonplanorder"];

    return await lessonplans.findAll({ where, order });
  };

  deleteLessonPlan = async (lessonplanid: string) => {
    const tempdt = await this.getLessonPlanid(lessonplanid);
    if (tempdt) {
      await tempdt.destroy();
      return true;
    } else {
      return false;
    }
  };

  activateLessonLearning = async (lessonlearningid: string) => {
    const tempdt = await this.getLessonLearningid(lessonlearningid);
    if (tempdt) {
      tempdt.lessonlearningstatus = true;
      await tempdt.save({ fields: ["lessonlearningstatus"] });
      return true;
    } else {
      return false;
    }
  };

  updateorderLessonLearning = async (
    lessonlearningid: string,
    lessonlearningorder: number
  ) => {
    const tempdt = await this.getLessonLearningid(lessonlearningid);
    if (tempdt) {
      tempdt.lessonlearningorder = lessonlearningorder;
      await tempdt.save({ fields: ["lessonlearningorder"] });
      return true;
    } else {
      return false;
    }
  };

  updateLessonPlan = async (
    lessonplanid: string,
    lessonplan: lessonplansAttributes
  ) => {
    const tempdt = await this.getLessonPlanid(lessonplanid);
    if (tempdt) {
      tempdt.documentid = lessonplan.documentid;
      tempdt.lessonplandescription = lessonplan.lessonplandescription;
      tempdt.lessonplanname = lessonplan.lessonplanname;
      await tempdt.save({
        fields: [
          "documentid",
          "lessonplandescription",
          "lessonplanname",
        ],
      });
      return true;
    } else {
      return false;
    }
  };

  deactivateLessonLearning = async (lessonlearningid: string) => {
    const tempdt = await this.getLessonLearningid(lessonlearningid);
    if (tempdt) {
      tempdt.lessonlearningstatus = false;
      await tempdt.save({ fields: ["lessonlearningstatus"] });
      return true;
    } else {
      return false;
    }
  };

  isexistsLessonPlanID = async (lessonplanid: string) => {
    const where: WhereOptions<lessonplansAttributes> = {
      lessonplanid,
    };
    const tempdt = await lessonplans.count({ where });
    return tempdt > 0;
  };

  isexistsLessonPlanAdded = async (
    lessonid: string,
    documentid: string,
    lessonplanid: string | null | undefined = ""
  ) => {
    let where: WhereOptions<lessonplansAttributes> = {
      lessonid,
      documentid,
    };

    if ((lessonplanid ?? "").trim().length > 0) {
      where = {
        ...where,
        lessonplanid: {
          [Op.not]: lessonplanid,
        },
      };
    }
    const tempdt = await lessonplans.count({ where });
    return tempdt > 0;
  };

  updatealllearningpoints = async (lessonid: string, points: number = 0) => {
    await lessonlearnings.update(
      { points },
      { where: { lessonid }}
    );
  }

  updatelearningleftpoints = async (lesson: lessons, points: number = 0) => {
    const lastlearning = await lessonlearnings.findOne(
      { 
        where: { lessonid: lesson.lessonid },
        order: [ [ 'lessonlearningorder', 'DESC' ]],
      },
    );
    if (lastlearning) {
      lastlearning.points += points;
      lastlearning.save({ fields: ["points"] });
      lesson.learning_points += points;
      lesson.save({ fields: ["learning_points"] });
    }
  }
}
