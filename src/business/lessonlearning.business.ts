/* eslint-disable @typescript-eslint/no-explicit-any */
import { Op, WhereOptions } from "sequelize";
import { LessonLearningBase, LessonLearningDocumentBase } from "src/modules/lesson/models/LessonLearningsResponse";
import { v4 as uuidv4 } from "uuid";
import {
  documents,
  lessonlearningdocuments,
  lessonlearnings,
  lessonlearningsAttributes,
  lessons,
} from "../models/data-models/init-models";
import { LessonBusiness } from "./lesson.business";

import { OrgContext } from "src/decorators/org.decorator";
import { dbinstance, rollbackQuietly } from "src/services/dbservice";
import { ValidationException } from "src/models/ValidationException";
import { andScope, findOwnedLearning, findOwnedLesson } from "./content-scope";

const REORDER_MESSAGE = "The list must hold every item of this lesson, once each, and nothing else.";

/**
 * Built with the caller's context, every read and write here is limited to the rows in scope (a row of another
 * organisation is reported exactly as an absent one); built without one it is unscoped (the sync payloads, and
 * the recompute of a lesson's points, which only ever runs on a lesson that was found in scope).
 */
export class LessonLearningBusiness {
  constructor(private readonly org?: OrgContext) {}

  /**
   * The documents each item references through link rows (none until an item type uses them), by item id, each with
   * its name and type, in the item's own order.
   */
  private linkedDocuments = async (lessonlearningids: string[]): Promise<Map<string, LessonLearningDocumentBase[]>> => {
    const byItem = new Map<string, LessonLearningDocumentBase[]>();
    if (lessonlearningids.length === 0) {
      return byItem;
    }
    const links = await lessonlearningdocuments.findAll({ where: { lessonlearningid: { [Op.in]: lessonlearningids } } });
    if (links.length === 0) {
      return byItem;
    }
    const docs = await documents.findAll({ where: { documentid: { [Op.in]: links.map((l) => l.documentid) } } });
    const ordered = [...links].sort(
      (a, b) =>
        a.lessonlearningdocumentorder - b.lessonlearningdocumentorder ||
        a.lessonlearningdocumentid.localeCompare(b.lessonlearningdocumentid),
    );
    for (const link of ordered) {
      const doc = docs.find((d) => d.documentid === link.documentid);
      const list = byItem.get(link.lessonlearningid) ?? [];
      list.push({
        documentid: link.documentid,
        role: link.lessonlearningdocumentrole,
        order: link.lessonlearningdocumentorder,
        documentname: doc?.documentname ?? "",
        documenttypeid: doc?.documenttypeid ?? 0,
      });
      byItem.set(link.lessonlearningid, list);
    }
    return byItem;
  };

  /**
   * One item as the admin reads it. An item with no primary document (a type that is not one file) has no document
   * name or type; it must never be dereferenced.
   */
  private toItem = (
    x: lessonlearnings & { lesson?: lessons; document?: documents | null },
    links: LessonLearningDocumentBase[] | undefined,
  ): LessonLearningBase => ({
    lessonlearningid: x.lessonlearningid,
    lessonlearningname: x.lessonlearningname,
    lessonlearningdescription: x.lessonlearningdescription,
    lessonid: x.lessonid,
    documentid: x.documentid ?? null,
    lessonlearningstatus: x.lessonlearningstatus,
    lessonlearningorder: x.lessonlearningorder,
    lessonname: x.lesson?.lessonname ?? "",
    lessondescription: x.lesson?.lessondescription ?? "",
    documentname: x.document ? x.document.documentname : null,
    documenttypeid: x.document ? x.document.documenttypeid : null,
    lessonlearningtype: x.lessonlearningtype ?? "video",
    lessonlearningbody: x.lessonlearningbody ?? null,
    documents: links ?? [],
  });

  createLessonLearning = async (lessonlearning: lessonlearningsAttributes) => {
    lessonlearning.lessonlearningid = uuidv4();
    lessonlearning.lessonlearningstatus = true;
    const ln = await lessonlearnings.create(lessonlearning);
    const lessonbusiness = new LessonBusiness();
    await lessonbusiness.updatelearningpracticequiz(lessonlearning.lessonid);
    return ln;
  };
  getLessonLearningbyid = async (lessonlearningid: string) => {
    if (this.org) {
      await findOwnedLearning(this.org, lessonlearningid);
    }
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
    if (!data) {
      return null;
    }
    const links = await this.linkedDocuments([data.lessonlearningid]);
    return this.toItem(data, links.get(data.lessonlearningid));
  };
  getLessonLearningbyLessonid = async (lessonid: string) => {
    if (this.org) {
      await findOwnedLesson(this.org, lessonid);
    }
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
      where: await andScope(this.org, "learning", { lessonid }),
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
    if (!data) {
      return null;
    }
    const links = await this.linkedDocuments(data.map((x) => x.lessonlearningid));
    return data.map((x) => this.toItem(x, links.get(x.lessonlearningid)));
  };
  getLessonLearningid = async (lessonlearningid: string) =>
    this.org
      ? findOwnedLearning(this.org, lessonlearningid)
      : lessonlearnings.findOne({
      where: { lessonlearningid },
    });

  getLessonLearnings = async () => {
    const where: WhereOptions<lessonlearningsAttributes> = {};
    const order = ["lessonlearningorder"];

    return await lessonlearnings.findAll({ where: await andScope(this.org, "learning", where), order });
  };

  /**
   * Every link row of the items in scope (the sync payload's `lessonlearningdocuments`), whole, in a fixed order:
   * item, then the row's own order, then its id. Empty until an item type uses link rows.
   */
  getLessonLearningDocuments = async () =>
    lessonlearningdocuments.findAll({
      where: await andScope(this.org, "learningdocument", {}),
      order: [["lessonlearningid", "ASC"], ["lessonlearningdocumentorder", "ASC"], ["lessonlearningdocumentid", "ASC"]],
    });

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

  /**
   * Sets the order of a lesson's items to 1..n in the order given, in one transaction. The list must be exactly the
   * lesson's items, once each. The lesson and every id are checked in scope first, so a lesson or an item that is
   * another organisation's (or unowned) is the 404 an absent one gets, and nothing is written; an item of the
   * caller's own that is another lesson's, a missing one, or a repeated one is a 400 and nothing is written.
   */
  reorderLessonLearnings = async (lessonid: string, lessonlearningids: string[]) => {
    if (this.org) {
      await findOwnedLesson(this.org, lessonid);
    }
    const given = new Set<string>();
    for (const id of lessonlearningids) {
      const item = this.org ? await findOwnedLearning(this.org, id) : await this.getLessonLearningid(id);
      if (!item || item.lessonid !== lessonid || given.has(id)) {
        throw new ValidationException([{ field: "lessonlearningids", message: REORDER_MESSAGE }]);
      }
      given.add(id);
    }
    const current = await lessonlearnings.findAll({ where: { lessonid }, attributes: ["lessonlearningid"] });
    if (current.length !== given.size || current.some((x) => !given.has(x.lessonlearningid))) {
      throw new ValidationException([{ field: "lessonlearningids", message: REORDER_MESSAGE }]);
    }
    const transaction = await dbinstance.getdbinstance().transaction();
    try {
      for (const [index, id] of lessonlearningids.entries()) {
        await lessonlearnings.update(
          { lessonlearningorder: index + 1 },
          { where: { lessonlearningid: id, lessonid }, fields: ["lessonlearningorder"], transaction },
        );
      }
      await transaction.commit();
    } catch (e) {
      await rollbackQuietly(transaction);
      throw e;
    }
    return true;
  };

  updateLessonLearning = async (
    lessonlearningid: string,
    lessonlearning: lessonlearningsAttributes
  ) => {
    const tempdt = await this.getLessonLearningid(lessonlearningid);
    if (tempdt) {
      // The item's own fields change only when the request names them: a request that leaves the type, the body or the
      // document out leaves them as they are.
      const fields: Array<keyof lessonlearningsAttributes> = ["lessonlearningdescription", "lessonlearningname"];
      tempdt.lessonlearningdescription =
        lessonlearning.lessonlearningdescription;
      tempdt.lessonlearningname = lessonlearning.lessonlearningname;
      if (lessonlearning.documentid !== undefined) {
        tempdt.documentid = lessonlearning.documentid;
        fields.push("documentid");
      }
      if (lessonlearning.lessonlearningtype !== undefined) {
        tempdt.lessonlearningtype = lessonlearning.lessonlearningtype;
        fields.push("lessonlearningtype");
      }
      if (lessonlearning.lessonlearningbody !== undefined) {
        tempdt.lessonlearningbody = lessonlearning.lessonlearningbody;
        fields.push("lessonlearningbody");
      }
      await tempdt.save({ fields });
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
    const tempdt = await lessonlearnings.count({ where: await andScope(this.org, "learning", where) });
    return tempdt > 0;
  };

  /**
   * Is this document already one of the lesson's items? An item with no primary document (documentid null) is never a
   * duplicate of another: two such items are two items, so a null (or absent) document is never "already added".
   */
  isexistsLessonLearningAdded = async (
    lessonid: string,
    documentid: string | null | undefined,
    lessonlearningid: string | null | undefined = ""
  ) => {
    if (documentid === null || documentid === undefined) {
      return false;
    }
    let where: WhereOptions<lessonlearningsAttributes> = {
      lessonid,
      documentid,
    };

    if ((lessonlearningid ?? "").trim().length > 0) {
      where = {
        ...where,
        lessonlearningid: {
          [Op.not]: lessonlearningid as string,
        },
      };
    }
    const tempdt = await lessonlearnings.count({ where: await andScope(this.org, "learning", where) });
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
