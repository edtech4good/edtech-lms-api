/* eslint-disable @typescript-eslint/no-explicit-any */
import { Op, WhereOptions } from 'sequelize';
import { LevelQuizQuestionBase } from 'src/modules/level/models/LevelQuizQuestionBase';
import { v4 as uuidv4 } from 'uuid';
import { lessons, levelquizquestions, levelquizquestionsAttributes, levels, questions } from '../models/data-models/init-models';

export class LevelQuizQuestionBusiness {
    createLevelQuizQuestion = async (levelquizquestion: levelquizquestionsAttributes) => {
        levelquizquestion.levelquizquestionid = uuidv4();
        levelquizquestion.levelquizquestionstatus = true;
        return await levelquizquestions.create(levelquizquestion);
    };
    getLevelQuizQuestionbyid = async (levelquizquestionid: string) => {
        levels.belongsTo(levelquizquestions, {
            foreignKey: 'levelid',
        });
        levelquizquestions.hasOne(levels, {
            foreignKey: 'levelid',
            sourceKey: 'levelid',
        });

        questions.belongsTo(levelquizquestions, {
            foreignKey: 'questionid',
        });
        levelquizquestions.hasOne(questions, {
            foreignKey: 'questionid',
            sourceKey: 'questionid',
        });

        const data = await levelquizquestions.findOne({
            where: { levelquizquestionid },
            include: [
                {
                    model: levels,
                },
                {
                    model: questions,
                },
            ]

        });
        return data ? (<LevelQuizQuestionBase>{
            levelquizquestionid: data.levelquizquestionid,
            levelid: data.levelid,
            questionid: data.questionid,
            levelquizquestionstatus: data.levelquizquestionstatus,
            levelquizquestionorder: data.levelquizquestionorder,
            levelname: data.level.levelname,
            leveldescription: data.level.leveldescription,
            questionidentifier: data.question.questionidentifier,
            lesson: (data as any).lesson
        }) : null
    };
    getLevelQuizQuestionbyLevelid = async (levelid: string) => {
        levels.belongsTo(levelquizquestions, {
            foreignKey: 'levelid',
        });
        levelquizquestions.hasOne(levels, {
            foreignKey: 'levelid',
            sourceKey: 'levelid',
        });

        questions.belongsTo(levelquizquestions, {
            foreignKey: 'questionid',
        });
        levelquizquestions.hasOne(questions, {
            foreignKey: 'questionid',
            sourceKey: 'questionid',
        });

        lessons.belongsTo(levelquizquestions, {
            foreignKey: 'lessonid',
        });
        levelquizquestions.hasOne(lessons, {
            foreignKey: 'lessonid',
            sourceKey: 'lessonid',
        });

        const data = await levelquizquestions.findAll({
            where: { levelid },
            include: [
                {
                    model: levels,
                },
                {
                    model: questions,
                },
                {
                    model: lessons,
                    attributes: ['lessonid', 'lessonname']
                },
            ],
            order: ['levelquizquestionorder']

        });
        return data ? data.map(x => (<LevelQuizQuestionBase>{
            levelquizquestionid: x.levelquizquestionid,
            levelid: x.levelid,
            questionid: x.questionid,
            levelquizquestionstatus: x.levelquizquestionstatus,
            levelquizquestionorder: x.levelquizquestionorder,
            levelname: x.level.levelname,
            leveldescription: x.level.leveldescription,
            questionidentifier: x.question.questionidentifier,
            lesson: (x as any).lesson
        })) : null
    };
    getLevelQuizQuestionid = async (levelquizquestionid: string) => levelquizquestions.findOne({
        where: { levelquizquestionid }
    });

    getLevelQuizQuestions = async (old: boolean = false) => {
        const option: any = {};
        const where: WhereOptions<levelquizquestionsAttributes> = {
        }
        const order = ["levelquizquestionorder"];
        if(old) {
            option.attributes = {
                exclude: ['lessonid']
            }
        }
        option.where = where;
        option.order = order;
        return await levelquizquestions.findAll(option);
    };

    deleteLevelQuizQuestion = async (levelquizquestionid: string) => {
        const tempdt = await this.getLevelQuizQuestionid(levelquizquestionid);
        if (tempdt) {
            await tempdt.destroy();
            return true;
        } else {
            return false;
        }
    };

    activateLevelQuizQuestion = async (levelquizquestionid: string) => {
        const tempdt = await this.getLevelQuizQuestionid(levelquizquestionid);
        if (tempdt) {
            tempdt.levelquizquestionstatus = true;
            await tempdt.save({ fields: ['levelquizquestionstatus'] });
            return true;
        } else {
            return false;
        }
    };


    updateorderLevelQuizQuestion = async (levelquizquestionid: string, levelquizquestionorder: number) => {
        const tempdt = await this.getLevelQuizQuestionid(levelquizquestionid);
        if (tempdt) {
            tempdt.levelquizquestionorder = levelquizquestionorder;
            await tempdt.save({ fields: ['levelquizquestionorder'] });
            return true;
        } else {
            return false;
        }
    };

    deactivateLevelQuizQuestion = async (levelquizquestionid: string) => {
        const tempdt = await this.getLevelQuizQuestionid(levelquizquestionid);
        if (tempdt) {
            tempdt.levelquizquestionstatus = false;
            await tempdt.save({ fields: ['levelquizquestionstatus'] });
            return true;
        } else {
            return false;
        }
    };

    isexistsLevelQuizQuestionID = async (levelquizquestionid: string) => {
        const where: WhereOptions<levelquizquestionsAttributes> = {
            levelquizquestionid,
        };
        const tempdt = await levelquizquestions.count({ where });
        return tempdt > 0;
    };

    isexistsLevelQuizQuestionAdded = async (levelid: string, questionid: string, levelquizquestionid: string | null | undefined = "") => {
        let where: WhereOptions<levelquizquestionsAttributes> = {
            levelid, questionid
        };
        if ((levelquizquestionid ?? "").trim().length > 0) {
            where = {
                ...where,
                levelquizquestionid: {
                    [Op.not]: levelquizquestionid
                }
            }
        }
        const tempdt = await levelquizquestions.count({ where });
        return tempdt > 0;
    };

    setlesson = async (levelquizquestionid: string, lessonid: string) => {
        const tempdt = await this.getLevelQuizQuestionid(levelquizquestionid);
        if (tempdt) {
            tempdt.lessonid = lessonid;
            await tempdt.save({ fields: ['lessonid'] });
            return true;
        } else {
            return false;
        }
    };
}
