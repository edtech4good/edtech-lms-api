/* eslint-disable @typescript-eslint/no-explicit-any */
import { Op, WhereOptions } from 'sequelize';
import { LessonPracticeBase } from 'src/modules/lesson/models/LessonPracticesResponse';
import { v4 as uuidv4 } from 'uuid';
import { lessonpractices, lessonpracticesAttributes, lessons } from '../models/data-models/init-models';
import { LessonBusiness } from './lesson.business';
import { OrgContext } from "src/decorators/org.decorator";
import { andScope, findOwnedPractice, findOwnedLesson } from "./content-scope";

/**
 * Built with the caller's context, every read and write here is limited to the rows in scope (a row of another
 * organisation is reported exactly as an absent one); built without one it is unscoped (the sync payloads, and
 * the recompute of a lesson's points, which only ever runs on a lesson that was found in scope).
 */
export class LessonPracticeBusiness {
    constructor(private readonly org?: OrgContext) {}

    createLessonPractice = async (lessonpractice: lessonpracticesAttributes, user: any) => {
        lessonpractice.lessonpracticeid = uuidv4();
        lessonpractice.lessonpracticestatus = true;
        lessonpractice.created_by = user?.lmsuserid;
        const lsp = await lessonpractices.create(lessonpractice);
        const lessonbusiness = new LessonBusiness();
        await lessonbusiness.updatelearningpracticequiz(lessonpractice.lessonid);
        return lsp;
    };
    getLessonPracticebyid = async (lessonpracticeid: string) => {
        if (this.org) {
            await findOwnedPractice(this.org, lessonpracticeid);
        }
        lessons.belongsTo(lessonpractices, {
            foreignKey: 'lessonid',
        });
        lessonpractices.hasOne(lessons, {
            foreignKey: 'lessonid',
            sourceKey: 'lessonid',
        });

        const data = await lessonpractices.findOne({
            where: { lessonpracticeid },
            include: [
                {
                    model: lessons,
                },
            ],
        });
        return data
            ? <LessonPracticeBase>{
                lessonpracticeid: data.lessonpracticeid,
                lessonpracticename: data.lessonpracticename,
                lessonpracticedescription: data.lessonpracticedescription,
                lessonid: data.lessonid,
                lessonpracticestatus: data.lessonpracticestatus,
                lessonpracticeorder: data.lessonpracticeorder,
                lessonname: data.lesson.lessonname,
                lessondescription: data.lesson.lessondescription,
                points: data.points,
            }
            : null;
    };
    getLessonPracticebyLessonid = async (lessonid: string) => {
        if (this.org) {
            await findOwnedLesson(this.org, lessonid);
        }
        lessons.belongsTo(lessonpractices, {
            foreignKey: 'lessonid',
        });
        lessonpractices.hasOne(lessons, {
            foreignKey: 'lessonid',
            sourceKey: 'lessonid',
        });

        const data = await lessonpractices.findAll({
            where: await andScope(this.org, "practice", { lessonid }),
            include: [
                {
                    model: lessons,
                },
            ],
            order: ['lessonpracticeorder'],
        });
        return data
            ? data.map(
                x =>
                    <LessonPracticeBase>{
                        lessonpracticeid: x.lessonpracticeid,
                        lessonpracticename: x.lessonpracticename,
                        lessonpracticedescription: x.lessonpracticedescription,
                        lessonid: x.lessonid,
                        lessonpracticestatus: x.lessonpracticestatus,
                        lessonpracticeorder: x.lessonpracticeorder,
                        lessonname: x.lesson.lessonname,
                        lessondescription: x.lesson.lessondescription,
                        points: x.points,
                    }
            )
            : null;
    };
    getLessonPracticeid = async (lessonpracticeid: string) =>
        this.org
            ? findOwnedPractice(this.org, lessonpracticeid)
            : lessonpractices.findOne({
            where: { lessonpracticeid },
        });

    getLessonPractices = async () => {
        const where: WhereOptions<lessonpracticesAttributes> = {};
        const order = ['lessonpracticeorder'];

        return await lessonpractices.findAll({ where: await andScope(this.org, "practice", where), order });
    };

    deleteLessonPractice = async (lessonpracticeid: string) => {
        const tempdt = await this.getLessonPracticeid(lessonpracticeid);
        if (tempdt) {
            await tempdt.destroy();
            const lessonbusiness = new LessonBusiness();
            await lessonbusiness.updatelearningpracticequiz(tempdt.lessonid);
            return true;
        } else {
            return false;
        }
    };

    activateLessonPractice = async (lessonpracticeid: string) => {
        const tempdt = await this.getLessonPracticeid(lessonpracticeid);
        if (tempdt) {
            tempdt.lessonpracticestatus = true;
            await tempdt.save({ fields: ['lessonpracticestatus'] });
            return true;
        } else {
            return false;
        }
    };

    updateorderLessonPractice = async (lessonpracticeid: string, lessonpracticeorder: number) => {
        const tempdt = await this.getLessonPracticeid(lessonpracticeid);
        if (tempdt) {
            tempdt.lessonpracticeorder = lessonpracticeorder;
            await tempdt.save({ fields: ['lessonpracticeorder'] });
            return true;
        } else {
            return false;
        }
    };

    deactivateLessonPractice = async (lessonpracticeid: string) => {
        const tempdt = await this.getLessonPracticeid(lessonpracticeid);
        if (tempdt) {
            tempdt.lessonpracticestatus = false;
            await tempdt.save({ fields: ['lessonpracticestatus'] });
            return true;
        } else {
            return false;
        }
    };

    isexistsLessonPracticeID = async (lessonpracticeid: string) => {
        const where: WhereOptions<lessonpracticesAttributes> = {
            lessonpracticeid,
        };
        const tempdt = await lessonpractices.count({ where: await andScope(this.org, "practice", where) });
        return tempdt > 0;
    };

    isexistsLessonPracticeAdded = async (lessonid: string, lessonpracticename: string, lessonpracticeid: string | null | undefined = "") => {
        let where: WhereOptions<lessonpracticesAttributes> = {
            lessonid,
            lessonpracticename,
        };
        if ((lessonpracticeid ?? "").trim().length > 0) {
            where = {
                ...where,
                lessonpracticeid: {
                    [Op.not]: lessonpracticeid as string
                }
            }
        }
        const tempdt = await lessonpractices.count({ where: await andScope(this.org, "practice", where) });
        return tempdt > 0;
    };

    updateLessonPractice = async (lessonpracticeid: string, lessonpractice: lessonpracticesAttributes, user: any) => {
        const tempdt = await this.getLessonPracticeid(lessonpracticeid);
        if (tempdt) {
            tempdt.lessonid = lessonpractice.lessonid;
            tempdt.lessonpracticename = lessonpractice.lessonpracticename;
            tempdt.lessonpracticedescription = lessonpractice.lessonpracticedescription;
            tempdt.points = lessonpractice.points ?? 10;
            tempdt.updated_at = new Date();
            tempdt.updated_by = user?.lmsuserid;
            await tempdt.save({ fields: ['lessonid', 'lessonpracticename', 'lessonpracticedescription', 'points', 'updated_at', 'updated_by'] });
            return true;
        } else {
            return false;
        }
    };

    updateallpracticespoints = async (lessonid: string, points: number = 0) => {
        await lessonpractices.update(
          { points },
          { where: { lessonid }}
        );
      }

    updatepracticeleftpoints = async (lesson: lessons, points: number = 0) => {
        const lastpractice = await lessonpractices.findOne(
          { 
            where: { lessonid: lesson.lessonid },
            order: [ [ 'lessonpracticeorder', 'DESC' ]],
          },
        );
        if (lastpractice) {
            lastpractice.points += points;
            lastpractice.save({ fields: ["points"] });
            lesson.practices_points += points;
            lesson.save({ fields: ["practices_points"] });
        }
      }
}
