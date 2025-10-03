/* eslint-disable @typescript-eslint/no-explicit-any */
import { Op, WhereOptions } from "sequelize";
import { LessonLearningBase } from "src/modules/lesson/models/LessonLearningsResponse";
import { v4 as uuidv4 } from "uuid";
import {
  documents,
  lessonlearnings,
  lessonlearningsAttributes,
  lessons,
} from "../models/data-models/init-models";
import { LessonBusiness } from "./lesson.business";

export class LessonLearningBusiness {
  createLessonLearning = async (lessonlearning: lessonlearningsAttributes) => {
    lessonlearning.lessonlearningid = uuidv4();
    lessonlearning.lessonlearningstatus = true;
    const ln = await lessonlearnings.create(lessonlearning);
    const lessonbusiness = new LessonBusiness();
    await lessonbusiness.updatelearningpracticequiz(lessonlearning.lessonid);
    return ln;
  };
  getLessonLearningbyid = async (lessonlearningid: string) => {
    lessons.belongsTo(lessonlearnings, {
      foreignKey: "lessonid",
    });
    lessonlearnings.hasOne(lessons, {
      foreignKey: "lessonid",
      sourceKey: "lessonid",
    });

    documents.belongsTo(lessonlearnings, {
      foreignKey: "documentid",
    });
    lessonlearnings.hasOne(documents, {
      foreignKey: "documentid",
      sourceKey: "documentid",
    });

    const data = await lessonlearnings.findOne({
      where: { lessonlearningid },
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
      ? <LessonLearningBase>{
          lessonlearningid: data.lessonlearningid,
          lessonlearningname: data.lessonlearningname,
          lessonlearningdescription: data.lessonlearningdescription,
          lessonid: data.lessonid,
          documentid: data.documentid,
          lessonlearningstatus: data.lessonlearningstatus,
          lessonlearningorder: data.lessonlearningorder,
          lessonname: data.lesson.lessonname,
          lessondescription: data.lesson.lessondescription,
          documentname: data.document.documentname,
          documenttypeid: data.document.documenttypeid,
        }
      : null;
  };
  getLessonLearningbyLessonid = async (lessonid: string) => {
    lessons.belongsTo(lessonlearnings, {
      foreignKey: "lessonid",
    });
    lessonlearnings.hasOne(lessons, {
      foreignKey: "lessonid",
      sourceKey: "lessonid",
    });

    documents.belongsTo(lessonlearnings, {
      foreignKey: "documentid",
    });
    lessonlearnings.hasOne(documents, {
      foreignKey: "documentid",
      sourceKey: "documentid",
    });

    const data = await lessonlearnings.findAll({
      where: { lessonid },
      include: [
        {
          model: documents,
        },
        {
          model: lessons,
        },
      ],
      order: ["lessonlearningorder"],
    });
    return data
      ? data.map(
          (x) =>
            <LessonLearningBase>{
              lessonlearningid: x.lessonlearningid,
              lessonlearningname: x.lessonlearningname,
              lessonlearningdescription: x.lessonlearningdescription,
              lessonid: x.lessonid,
              documentid: x.documentid,
              lessonlearningstatus: x.lessonlearningstatus,
              lessonlearningorder: x.lessonlearningorder,
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

  getLessonLearnings = async () => {
    const where: WhereOptions<lessonlearningsAttributes> = {};
    const order = ["lessonlearningorder"];

    return await lessonlearnings.findAll({ where, order });
  };

  deleteLessonLearning = async (lessonlearningid: string) => {
    const tempdt = await this.getLessonLearningid(lessonlearningid);
    if (tempdt) {
      await tempdt.destroy();
      const lessonbusiness = new LessonBusiness();
      await lessonbusiness.updatelearningpracticequiz(tempdt.lessonid);
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

  updateLessonLearning = async (
    lessonlearningid: string,
    lessonlearning: lessonlearningsAttributes
  ) => {
    const tempdt = await this.getLessonLearningid(lessonlearningid);
    if (tempdt) {
      tempdt.documentid = lessonlearning.documentid;
      tempdt.lessonlearningdescription =
        lessonlearning.lessonlearningdescription;
      tempdt.lessonlearningname = lessonlearning.lessonlearningname;
      await tempdt.save({
        fields: [
          "documentid",
          "lessonlearningdescription",
          "lessonlearningname",
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

  isexistsLessonLearningID = async (lessonlearningid: string) => {
    const where: WhereOptions<lessonlearningsAttributes> = {
      lessonlearningid,
    };
    const tempdt = await lessonlearnings.count({ where });
    return tempdt > 0;
  };

  isexistsLessonLearningAdded = async (
    lessonid: string,
    documentid: string,
    lessonlearningid: string | null | undefined = ""
  ) => {
    let where: WhereOptions<lessonlearningsAttributes> = {
      lessonid,
      documentid,
    };

    if ((lessonlearningid ?? "").trim().length > 0) {
      where = {
        ...where,
        lessonlearningid: {
          [Op.not]: lessonlearningid,
        },
      };
    }
    const tempdt = await lessonlearnings.count({ where });
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
