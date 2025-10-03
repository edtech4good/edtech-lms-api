/* eslint-disable @typescript-eslint/no-explicit-any */
import { Op, WhereOptions } from 'sequelize';
import { LessonQuizBase } from 'src/modules/lesson/models/LessonQuizResponse';
import { v4 as uuidv4 } from 'uuid';
import { lessonquizzes, lessonquizzesAttributes, lessons } from '../models/data-models/init-models';
import { LessonBusiness } from './lesson.business';

export class LessonQuizBusiness {
    createLessonQuiz = async (lessonquiz: lessonquizzesAttributes, user: any) => {
        lessonquiz.lessonquizid = uuidv4();
        lessonquiz.lessonquizstatus = true;
        lessonquiz.created_by = user?.lmsuserid;
        const lsq = await lessonquizzes.create(lessonquiz);
        const lessonbusiness = new LessonBusiness();
        await lessonbusiness.updatelearningpracticequiz(lessonquiz.lessonid);
        return lsq;
    };
    getLessonQuizbyid = async (lessonquizid: string) => {
        lessons.belongsTo(lessonquizzes, {
            foreignKey: 'lessonid',
        });
        lessonquizzes.hasOne(lessons, {
            foreignKey: 'lessonid',
            sourceKey: 'lessonid',
        });

        const data = await lessonquizzes.findOne({
            where: { lessonquizid },
            include: [
                {
                    model: lessons,
                },
            ],
        });
        return data
            ? <LessonQuizBase>{
                lessonquizid: data.lessonquizid,
                lessonquizname: data.lessonquizname,
                lessonquizdescription: data.lessonquizdescription,
                lessonid: data.lessonid,
                lessonquizstatus: data.lessonquizstatus,
                lessonquizorder: data.lessonquizorder,
                lessonname: data.lesson.lessonname,
                lessondescription: data.lesson.lessondescription,
                points: data.points,
            }
            : null;
    };
    getLessonQuizbyLessonid = async (lessonid: string) => {
        lessons.belongsTo(lessonquizzes, {
            foreignKey: 'lessonid',
        });
        lessonquizzes.hasOne(lessons, {
            foreignKey: 'lessonid',
            sourceKey: 'lessonid',
        });

        const data = await lessonquizzes.findAll({
            where: { lessonid },
            include: [
                {
                    model: lessons,
                },
            ],
            order: ['lessonquizorder'],
        });
        return data
            ? data.map(
                x =>
                    <LessonQuizBase>{
                        lessonquizid: x.lessonquizid,
                        lessonquizname: x.lessonquizname,
                        lessonquizdescription: x.lessonquizdescription,
                        lessonid: x.lessonid,
                        lessonquizstatus: x.lessonquizstatus,
                        lessonquizorder: x.lessonquizorder,
                        lessonname: x.lesson.lessonname,
                        lessondescription: x.lesson.lessondescription,
                        points: x.points,
                    }
            )
            : null;
    };
    getLessonQuizid = async (lessonquizid: string) =>
        lessonquizzes.findOne({
            where: { lessonquizid },
        });

    getLessonQuizzes = async () => {
        const where: WhereOptions<lessonquizzesAttributes> = {};
        const order = ['lessonquizorder'];

        return await lessonquizzes.findAll({ where, order });
    };

    deleteLessonQuiz = async (lessonquizid: string) => {
        const tempdt = await this.getLessonQuizid(lessonquizid);
        if (tempdt) {
            await tempdt.destroy();
            const lessonbusiness = new LessonBusiness();
            await lessonbusiness.updatelearningpracticequiz(tempdt.lessonid);
            return true;
        } else {
            return false;
        }
    };

    activateLessonQuiz = async (lessonquizid: string) => {
        const tempdt = await this.getLessonQuizid(lessonquizid);
        if (tempdt) {
            tempdt.lessonquizstatus = true;
            await tempdt.save({ fields: ['lessonquizstatus'] });
            return true;
        } else {
            return false;
        }
    };

    updateorderLessonQuiz = async (lessonquizid: string, lessonquizorder: number) => {
        const tempdt = await this.getLessonQuizid(lessonquizid);
        if (tempdt) {
            tempdt.lessonquizorder = lessonquizorder;
            await tempdt.save({ fields: ['lessonquizorder'] });
            return true;
        } else {
            return false;
        }
    };

    deactivateLessonQuiz = async (lessonquizid: string) => {
        const tempdt = await this.getLessonQuizid(lessonquizid);
        if (tempdt) {
            tempdt.lessonquizstatus = false;
            await tempdt.save({ fields: ['lessonquizstatus'] });
            return true;
        } else {
            return false;
        }
    };

    isexistsLessonQuizID = async (lessonquizid: string) => {
        const where: WhereOptions<lessonquizzesAttributes> = {
            lessonquizid,
        };
        const tempdt = await lessonquizzes.count({ where });
        return tempdt > 0;
    };

    isexistsLessonQuizAdded = async (lessonid: string, lessonquizname: string, lessonquizid: string | null | undefined = "") => {
        let where: WhereOptions<lessonquizzesAttributes> = {
            lessonid,
            lessonquizname,
        };
        if ((lessonquizid ?? "").trim().length > 0) {
            where = {
                ...where,
                lessonquizid: {
                    [Op.not]: lessonquizid
                }
            }
        }
        const tempdt = await lessonquizzes.count({ where });
        return tempdt > 0;
    };

    updateLessonQuiz = async (lessonquizid: string, lessonquiz: lessonquizzesAttributes, user: any) => {
        const tempdt = await this.getLessonQuizid(lessonquizid);
        if (tempdt) {
            tempdt.lessonid = lessonquiz.lessonid;
            tempdt.lessonquizname = lessonquiz.lessonquizname;
            tempdt.lessonquizdescription = lessonquiz.lessonquizdescription;
            tempdt.points = lessonquiz.points ?? 10;
            tempdt.updated_at = new Date();
            tempdt.updated_by = user?.lmsuserid;
            await tempdt.save({ fields: ['lessonid', 'lessonquizname', 'lessonquizdescription', 'points', 'updated_at', 'updated_by'] });
            return true;
        } else {
            return false;
        }
    };

    updateallquizzespoints = async (lessonid: string, points: number = 0) => {
        await lessonquizzes.update(
          { points },
          { where: { lessonid }}
        );
      }
    
    updatequizleftpoints = async (lesson: lessons, points: number = 0) => {
        const lastquiz = await lessonquizzes.findOne(
          { 
            where: { lessonid: lesson.lessonid },
            order: [ [ 'lessonquizorder', 'DESC' ]],
          },
        );
        if (lastquiz) {
            lastquiz.points += points;
            lastquiz.save({ fields: ["points"] });
            lesson.quizzes_points += points;
            lesson.save({ fields: ["quizzes_points"] });
        }
      }
}
