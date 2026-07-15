import { BadRequestException } from "@nestjs/common";
import { isAfter, parseISO, startOfDay, startOfMonth, subDays, subMonths } from "date-fns";
import { maxBy, minBy } from "lodash";
import { col, fn, Op, WhereOptions } from "sequelize";
import { countries } from "src/models/data-models/countries";
import { curriculums } from "src/models/data-models/curriculums";
import { feedbacks } from "src/models/data-models/feedback";
import { grades } from "src/models/data-models/grades";
import { lessonquizquestions } from "src/models/data-models/lessonquizquestions";
import { lessonquizzes } from "src/models/data-models/lessonquizzes";
import { lessons } from "src/models/data-models/lessons";
import { levelquizquestions } from "src/models/data-models/levelquizquestions";
import { levels } from "src/models/data-models/levels";
import { rpiuseraccess } from "src/models/data-models/rpiuseraccess";
import { schools, schoolsAttributes } from "src/models/data-models/school"
import { schoolusers } from "src/models/data-models/schoolusers";
import { standards } from "src/models/data-models/standard";
import { studentappusages } from "src/models/data-models/studentappusage";
import { studentgradesprogress } from "src/models/data-models/studentgradesprogress";
import { studentlessonsprogress } from "src/models/data-models/studentlessonprogress";
import { studentlevelsprogress } from "src/models/data-models/studentlevelsprogress";
import { studentprogress } from "src/models/data-models/studentprogress";
import { students, studentsAttributes } from "src/models/data-models/students";
import { syncs, syncsAttributes } from "src/models/data-models/syncrecord";
import { Default_Test_Student_ID } from "src/models/enums/user.enum";
import { IMultiPaging } from "src/models/IPaging";
import { LmsUserToken } from "src/models/token.model";
import { FeedbackData, FeedbackDataContent, TechDowntimeNumbers } from "src/modules/feedback/models/FeedbackBase";
import { buildCustomWhere, constructWhere } from "src/services/util.service";

export interface ChartItemFormat {
    name: Date | string;
    value: number;
}

export interface LineChartFormat {
    name: string;
    series: Array<ChartItemFormat>;
}

export class ReportBusiness {
    getDashboardReport = async (countryid: string, year: number) => {
        const months = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        const lineChartsFormat: Array<LineChartFormat> = [];
        const schoolsFormat: LineChartFormat = {
            name: 'Schools',
            series: [],
        };
        const studentsFormat: LineChartFormat = {
            name: 'Students',
            series: [],
        };
        const teacherFormat: LineChartFormat = {
            name: 'Teachers',
            series: [],
        };
        const whereschoolusers: any = {};
        const wherestudents: any = {};
        if(countryid !== 'all') whereschoolusers.countryid = countryid;
        if(countryid !== 'all') {
            const country = await countries.findOne({ where: { countryid }});
            if(country) wherestudents.country = country.countryname;
        }
        // loop from january to november
        let i = 0;
        for await (const month of months) {
            const theMonth = month > 0 ? startOfMonth(new Date(year, month, 1)) : new Date(0);
            const nextMonth = startOfMonth(new Date(year, month + 1, 1));
            const whereschool: any = { 
                created_at: {
                    [Op.between]: [theMonth, nextMonth]
                },
                isdeleted: false
            };
            if(countryid !== 'all') whereschool.countryid = countryid;
            let numberOfSchools = await schools.count({
                where: whereschool
            });
            if(month === 0) schoolsFormat.series.push({ name: startOfDay(subDays(theMonth, 1)), value: numberOfSchools}) // add a yesterday date for adjust charts style
            numberOfSchools += i > 0 ? schoolsFormat.series[i].value : 0;
            schoolsFormat.series.push({name: theMonth, value: numberOfSchools});
            wherestudents.created_at = {
                [Op.between]: [theMonth, nextMonth]
            };
            let numberOfStudents = await students.count({
                where: wherestudents,
            });
            if(month === 0) studentsFormat.series.push({ name: startOfDay(subDays(theMonth, 1)), value: numberOfStudents}) // add a yesterday date for adjust charts style
            numberOfStudents += i > 0 ? studentsFormat.series[i].value : 0;
            studentsFormat.series.push({name: theMonth, value: numberOfStudents});
            let numberOfTeachers = await schoolusers.count({
                where: {
                    schooluserrole: 3,
                    created_at: {
                        [Op.between]: [theMonth, nextMonth]
                    }
                },
                include: [
                    {
                        model: schools,
                        required: true,
                        where: whereschoolusers,
                        attributes: []
                    }
                ]
            });
            if(month === 0) teacherFormat.series.push({ name: startOfDay(subDays(theMonth, 1)), value: numberOfTeachers}) // add a yesterday date for adjust charts style
            numberOfTeachers += i > 0 ? teacherFormat.series[i].value : 0;
            teacherFormat.series.push({name: theMonth, value: numberOfTeachers});
            i++;
        }
        lineChartsFormat.push(schoolsFormat);
        lineChartsFormat.push(studentsFormat);
        lineChartsFormat.push(teacherFormat);
        return lineChartsFormat;
    }

    getAllStudentsGender = async (countryid: string, schoolname: string) => {
        const where: any = {};
        if(countryid && countryid !== 'all') {
            const country = await countries.findOne({ where: { countryid }});
            if(country) where.country = country.countryname;
        }
        if(schoolname) where.schoolname = schoolname;
        where.genderid = 1;
        const numberOfBoys = await students.count({
            where: where,
        });
        where.genderid = 2;
        const numberOfGirls = await students.count({
            where: where,
        });
        const chartFormat: Array<ChartItemFormat> = [];
        chartFormat.push({ name: 'girls', value: numberOfGirls });
        chartFormat.push({ name: 'boys', value: numberOfBoys });
        return chartFormat;
    }

    getStudentsOfflineOnline = async (schoolname: string, countryid: string, type: string) => {
        const where: WhereOptions<studentsAttributes> = {
            isactive: 1,
            type
        }
        if(schoolname) where.schoolname = schoolname;
        if(countryid && countryid !== 'all') {
            const country = await countries.findOne({
                where: { countryid },
                attributes: ['countryname']
            });
            where.country = country?.countryname;
        }
        const numberOfOffline = await students.count({
            where,
        });
        const chartFormat: Array<ChartItemFormat> = [];
        // chartFormat.push({ name: 'Online', value: numberOfOnline });
        chartFormat.push({ name: type == 'offline' ? 'Offline' : 'Online', value: numberOfOffline });
        // chartFormat.push({ name: 'Both', value: numberOfBoth });
        return { name: type === 'offline' ? 'Offline' : 'Online', value: numberOfOffline };
    }

    formatChartsOfflineOnline = (onlineStudents: ChartItemFormat, offlineStudents: ChartItemFormat) => {
        const chartFormat: Array<ChartItemFormat> = [];
        if(onlineStudents) {
            chartFormat.push(onlineStudents);
        } else {
            chartFormat.push({name: 'Online', value: 0})
        }
        chartFormat.push(offlineStudents);
        return chartFormat;
    }

    getStudentsScoresData = async (
        paging: IMultiPaging,
        download: boolean = false
    ) => {
        // const limit = paging.pagesize || 20;
        // let offset = 0;
        // if ((paging.pageindex || 1) > 1) {
        //     offset = limit * ((paging.pageindex || 1) - 1);
        // }
        const where: any = {};
        const lessonwhere: any = {lessonstatus: true, isdeleted: false};
        buildCustomWhere(paging.filter ?? [], {fields: 'curriculumid', where: where});
        buildCustomWhere(paging.filter ?? [], {fields: 'studentid', where: where});
        buildCustomWhere(paging.filter ?? [], {key: 'gradeid', fields: '$level.grade.gradeid$', where: lessonwhere});
        buildCustomWhere(paging.filter ?? [], {key: 'levelid', fields: '$level.levelid$', where: lessonwhere});
        buildCustomWhere(paging.filter ?? [], {fields: 'standard', where: where});
        buildCustomWhere(paging.filter ?? [], {fields: 'lessonid', where: lessonwhere});
        let student: students | null = null;
        if(!where.standard && !where.studentid) {
            student = await students.findOne({
                where: { 
                    studentid: Default_Test_Student_ID,
                    is_teacher_acc: false,
                },
                include: [
                    {
                        model: schoolusers,
                        as: 'schooluser',
                        required: true,
                        attributes: ['schoolusername']
                    }
                ]
            });
            if(!student) throw new BadRequestException('school has no student!');
            where.standard = student?.standard;
            where.studentid = student.studentid;
        } else if(!where.studentid) {
            student = await students.findOne({
                where: {
                    standard: where.standard,
                    is_teacher_acc: false,
                },
                include: [
                    {
                        model: schoolusers,
                        as: 'schooluser',
                        required: true,
                        attributes: ['schoolusername']
                    }
                ]
            });
            if(student) where.studentid = student.studentid;
        } else if (where.studentid) {
            student = await students.findOne({
                where: {
                    studentid: where.studentid,
                    is_teacher_acc: false,
                },
                include: [
                    {
                        model: schoolusers,
                        as: 'schooluser',
                        required: true,
                        attributes: ['schoolusername']
                    }
                ]
            });
        }
        if(!student) return { rows: [], count: 0};
        const options: any = { where: lessonwhere };
        // if(!download) {
        //     options.limit = limit;
        //     options.offset = offset;
        // }
        const alllessons = await lessons.findAndCountAll({
            ...options,
            include: [
                {
                    model: studentlessonsprogress,
                    required: false,
                    where: { studentid: student?.studentid },
                    attributes: ['lessonid'],
                },
                {
                    model: levels,
                    as: 'level',
                    required: true,
                    attributes: ['levelname'],
                    include: [
                        {
                            model: grades,
                            as: 'grade',
                            required: true,
                            attributes: ['gradename'],
                            include: [
                                {
                                    model: curriculums,
                                    as: 'curriculum',
                                    required: true,
                                    where: { curriculumid: (where.curriculumid ? where.curriculumid : student?.curriculumid) },
                                    attributes: ['curriculumname']
                                }
                            ]
                        },
                    ]
                }
            ]
        }).then((async lss => {
            for await (const ls of lss.rows) {
                const stdlessonpg = (ls as any).studentlessonsprogresses as studentlessonsprogress[];
                if(stdlessonpg.length > 0) {
                    const studentlessonprogress = stdlessonpg[0];
                    let quiz = await studentprogress.findOne({
                        order: [['starttime', 'ASC']],
                        where: {
                            studentid: student?.studentid,
                            ispass: 1
                        },
                        attributes: ['studentprogressreferenceid', 'scores', 'resultpercentage', 'marks', 'ispass', 'starttime'],
                        include: [
                            {
                                model: lessonquizzes,
                                required: true,
                                attributes: [],
                                where: { lessonid: studentlessonprogress.lessonid }
                            },
                        ]
                    });
                    if(!quiz) {
                        quiz = await studentprogress.findOne({
                            order: [['starttime', 'DESC']],
                            where: {
                                studentid: student?.studentid,
                                ispass: 0
                            },
                            attributes: ['studentprogressreferenceid', 'scores', 'resultpercentage', 'marks', 'ispass', 'starttime'],
                            include: [
                                {
                                    model: lessonquizzes,
                                    required: true,
                                    attributes: [],
                                    where: { lessonid: studentlessonprogress.lessonid }
                                },
                            ]
                        });
                    }
                    if(quiz) {
                        const totalquestions = await lessonquizquestions.count({
                            where: { lessonquizid: quiz.studentprogressreferenceid }
                        });
                        quiz.setDataValue('totalquestions', totalquestions);
                        ls.setDataValue('laststudentprogress', quiz);
                        ls.setDataValue('starttime', quiz.starttime);
                    }
                }
                const level = await levels.findOne({
                    where: { levelid: ls.levelid },
                    attributes: ['levelname'],
                    include: [
                        {
                            model: grades,
                            as: 'grade',
                            required: true,
                            attributes: ['gradename'],
                            include: [
                                {
                                    model: curriculums,
                                    as: 'curriculum',
                                    required: true,
                                    attributes: ['curriculumname']
                                }
                            ]
                        }
                    ]
                })
                if(level) ls.setDataValue('level', level);
                const standard = await standards.findOne({
                    where: { standardid: student?.standard },
                    attributes: ['standardname']
                });
                const schoolcountry = await schools.findOne({
                    where: { schoolname: student?.schoolname },
                    attributes: ['schoolname'],
                    include: [
                        {
                            model: countries,
                            as: 'countries',
                            attributes: ['countryname'],
                        },
                    ]
                });
                if(schoolcountry) student?.setDataValue('school', schoolcountry);
                if(standard) student?.setDataValue('class', standard);
                ls.setDataValue('student', student ?? undefined);
            }
            for (let i = 1; i < lss.rows.length; i++) {
                const starttime = lss.rows[i].getDataValue('starttime') ?? 0;
                for (let j = 0; j < i; j++) {
                    const starttimeloop = lss.rows[j].getDataValue('starttime') ?? 0;
                    if (isAfter(starttime, starttimeloop)) {
                        const x = lss.rows[i];
                        lss.rows[i] = lss.rows[j];
                        lss.rows[j] = x;
                    }
                }
            }
            return lss;
        }));
        return alllessons;
    };

    // getStudentsScoresData2 = async (
    //     paging: IMultiPaging,
    //     download: boolean = false
    // ) => {
    //     const limit = paging.pagesize || 20;
    //     let offset = 0;
    //     if ((paging.pageindex || 1) > 1) {
    //         offset = limit * ((paging.pageindex || 1) - 1);
    //     }
    //     const where: any = {};
    //     const progresswhere: any = { progresstype: 2 };
    //     const lessonwhere: any = {lessonstatus: true, isdeleted: false};
    //     buildCustomWhere(paging.filter ?? [], {fields: 'studentid', where: progresswhere});
    //     buildCustomWhere(paging.filter ?? [], {key: 'gradeid', fields: '$level.grade.gradeid$', where: lessonwhere});
    //     buildCustomWhere(paging.filter ?? [], {key: 'levelid', fields: '$level.levelid$', where: lessonwhere});
    //     buildCustomWhere(paging.filter ?? [], {fields: 'standard', where: where});
    //     buildCustomWhere(paging.filter ?? [], {fields: 'lessonid', where: lessonwhere});
    //     let student: students | null = null;
    //     if(!where.standard && !progresswhere.studentid) {
    //         student = await students.findOne({
    //             where: { studentid: Default_Test_Student_ID },
    //             include: [
    //                 {
    //                     model: schoolusers,
    //                     as: 'schooluser',
    //                     required: true,
    //                     attributes: ['schoolusername']
    //                 }
    //             ]
    //         });
    //         if(!student) throw new BadRequestException('school has no student!');
    //         where.standard = student?.standard;
    //         progresswhere.studentid = student.studentid;
    //     } else if(!progresswhere.studentid) {
    //         student = await students.findOne({
    //             where: { standard: where.standard },
    //             include: [
    //                 {
    //                     model: schoolusers,
    //                     as: 'schooluser',
    //                     required: true,
    //                     attributes: ['schoolusername']
    //                 }
    //             ]
    //         });
    //         if(student) progresswhere.studentid = student.studentid;
    //     } else if (progresswhere.studentid) {
    //         student = await students.findOne({
    //             where: { studentid: progresswhere.studentid },
    //             include: [
    //                 {
    //                     model: schoolusers,
    //                     as: 'schooluser',
    //                     required: true,
    //                     attributes: ['schoolusername']
    //                 }
    //             ]
    //         });
    //     }
    //     if(!student) return { rows: [], count: 0};
    //     const options: any = { where: progresswhere };
    //     if(!download) {
    //         options.limit = limit;
    //         options.offset = offset;
    //     }
    //     const quizzesresult = await studentprogress.findAndCountAll({
    //         ...options,
    //         order: [['starttime', 'DESC']],
    //         include: [
    //             {
    //                 model: lessonquizzes,
    //                 required: false,
    //                 attributes: ['lessonquizid'],
    //                 include: [
    //                     {
    //                         model: lessons,
    //                         required: false,
    //                         attributes: ['lessonid'],
    //                         include: [
    //                             {
    //                                 model: levels,
    //                                 as: 'level',
    //                                 required: true,
    //                                 attributes: ['levelname'],
    //                                 include: [
    //                                     {
    //                                         model: grades,
    //                                         as: 'grade',
    //                                         required: true,
    //                                         attributes: ['gradename'],
    //                                         include: [
    //                                             {
    //                                                 model: curriculums,
    //                                                 as: 'curriculum',
    //                                                 required: true,
    //                                                 attributes: ['curriculumname']
    //                                             }
    //                                         ]
    //                                     },
    //                                 ]
    //                             }
    //                         ]
    //                     },
    //                 ]
    //             },
    //         ]
    //     }).then((async qrs => {
    //         // for await (const ls of lss.rows) {
    //         // }
    //         return qrs;
    //     }));
    //     return quizzesresult;
    // };

    getClassScoresData = async (
        paging: IMultiPaging,
        download: boolean = false
    ) => {
        const limit = paging.pagesize || 20;
        let offset = 0;
        if ((paging.pageindex || 1) > 1) {
            offset = limit * ((paging.pageindex || 1) - 1);
        }
        const where: any = {
            is_teacher_acc: false
        };
        const lessonwhere: any = {};
        buildCustomWhere(paging.filter ?? [], {fields: 'standard', where: where});
        buildCustomWhere(paging.filter ?? [], {fields: 'lessonid', where: lessonwhere});
        // buildCustomWhere(paging.filter ?? [], {fields: 'gradeid', where: lessonwhere});
        // buildCustomWhere(paging.filter ?? [], {fields: 'levelid', where: lessonwhere});
        let student: students | null = null;
        if(!where.standard && !where.studentid) {
            student = await students.findOne({
                where: { studentid: Default_Test_Student_ID }
            });
            if(!student) throw new BadRequestException('school has no student!');
            where.standard = student?.standard;
            // where.studentid = student.studentid;
        } else if(!where.studentid) {
            student = await students.findOne({
                where: { standard: where.standard }
            });
            if(student) where.standard = student?.standard;
        } else if (where.studentid) {
            student = await students.findOne({
                where: { studentid: where.studentid }
            });
            if(student) where.standard = student?.standard;
        }
        // find a lesson to show
        if(!lessonwhere.lessonid && student?.curriculumid) {
            const curriculum = await curriculums.findOne({
                where: { curriculumid: student?.curriculumid, curriculumstatus: true, isdeleted: false },
                attributes: ['curriculumid', 'curriculumname'],
                include: [
                    {
                        model: grades,
                        as: 'grades',
                        required: true,
                        where: { gradestatus: true, isdeleted: false },
                        attributes: ['gradename', 'gradeorder'],
                        include: [
                            {
                                model: levels,
                                as: 'levels',
                                required: true,
                                where: { levelstatus: true, isdeleted: false },
                                attributes: ['levelid', 'levelname', 'levelorder'],
                                include: [
                                    {
                                        model: lessons,
                                        as: 'lessons',
                                        required: true,
                                        where: { lessonstatus: true, isdeleted: false },
                                        attributes: ['lessonid', 'lessonorder'],
                                    },
                                ]
                            },
                        ]
                    },
                ]
            });
            const bestgrade = minBy(curriculum?.grades, 'gradeorder');
            const bestlevel = minBy(bestgrade?.levels, 'levelorder');
            const bestlesson = minBy(bestlevel?.lessons, 'lessonorder');
            lessonwhere.lessonid = bestlesson?.lessonid;
        }
        const lesson = await lessons.findOne({
            attributes: ['lessonname'],
            where: {lessonid: lessonwhere.lessonid, lessonstatus: true, isdeleted: false},
            include: [
                {
                    model: levels,
                    as: 'level',
                    required: true,
                    where: {levelstatus: true, isdeleted: false},
                    attributes: ['levelname'],
                    include: [
                        {
                            model: grades,
                            as: 'grade',
                            required: true,
                            where: {gradestatus: true, isdeleted: false},
                            attributes: ['gradename'],
                            include: [
                                {
                                    model: curriculums,
                                    as: 'curriculum',
                                    required: true,
                                    where: { curriculumstatus: true, isdeleted: false},
                                    attributes: ['curriculumname']
                                }
                            ]
                        }
                    ]
                },
                
            ]
        })
        // lessonwhere.curriculumid = student?.curriculumid;
        const options: any = { where };
        if(!download) {
            options.limit = limit;
            options.offset = offset;
        }
        const alllessons = await students.findAndCountAll({
            ...options,
            include: [
                {
                    model: studentlessonsprogress,
                    required: false,
                    where: lessonwhere,
                    attributes: ['lessonid'],
                },
            ],
        }).then((async stds => {
            for await (const std of stds.rows) {
                const stdlessonpg = (std as any).studentlessonsprogresses as studentlessonsprogress[];
                if(stdlessonpg.length > 0) {
                    const studentlessonprogress = stdlessonpg[0];
                    let quiz = await studentprogress.findOne({
                        order: [['starttime', 'ASC']],
                        where: {
                            studentid: std?.studentid,
                            ispass: 1
                        },
                        attributes: ['studentprogressreferenceid', 'scores', 'resultpercentage', 'marks', 'ispass'],
                        include: [
                            {
                                model: lessonquizzes,
                                required: true,
                                attributes: [],
                                where: { lessonid: studentlessonprogress.lessonid }
                            },
                        ]
                    });
                    if(!quiz) {
                        quiz = await studentprogress.findOne({
                            order: [['starttime', 'DESC']],
                            where: {
                                studentid: std?.studentid,
                                ispass: 0
                            },
                            attributes: ['studentprogressreferenceid', 'scores', 'resultpercentage', 'marks', 'ispass'],
                            include: [
                                {
                                    model: lessonquizzes,
                                    required: true,
                                    attributes: [],
                                    where: { lessonid: studentlessonprogress.lessonid }
                                },
                            ]
                        });
                    }
                    if(quiz) {
                        const totalquestions = await lessonquizquestions.count({
                            where: { lessonquizid: quiz.studentprogressreferenceid }
                        });
                        quiz.setDataValue('totalquestions', totalquestions);
                        std.setDataValue('laststudentprogress', quiz);
                    }
                }
                if(lesson) std.setDataValue('lesson', lesson);
                const standard = await standards.findOne({
                    where: { standardid: std?.standard },
                    attributes: ['standardname']
                });
                const schoolcountry = await schools.findOne({
                    where: { schoolname: std?.schoolname },
                    attributes: ['schoolname'],
                    include: [
                        {
                            model: countries,
                            as: 'countries',
                            attributes: ['countryname'],
                        },
                    ]
                });
                const schooluser = await schoolusers.findOne({
                    where: { schooluserid: std.schooluserid },
                    attributes: ['schoolusername']
                });
                if(schoolcountry) std.setDataValue('school', schoolcountry);
                if(standard) std.setDataValue('class', standard);
                if(schooluser) std.setDataValue('schooluser', schooluser);
            }
            return stds;
        }));
        return alllessons;
    };

    getAllStudentsWithProgress = async (type: number, paging?: {where: any, order: any, limit: any, offset: any}) => {
        const where: any = {
            ...paging?.where,
        }
        if(!where.studentid && !where.standard) where.studentid = Default_Test_Student_ID;
        const progress = await students.findAndCountAll({
            attributes: ['studentfirstname', 'country', 'standard', 'created_at', 'curriculumid'],
            where,
            order: [['created_at', 'DESC']],
            include:[
                {
                    model: studentprogress,
                    required: false,
                    where: { progresstype: type },
                    include: [
                        {
                            model: lessonquizzes,
                            required: false,
                            attributes: ['lessonquizid', 'lessonquizorder'],
                            include: [
                                {
                                    model: lessons,
                                    as: 'lesson',
                                    required: false,
                                    attributes: ['lessonname', 'lessonorder'],
                                    include: [
                                        {
                                            model: levels,
                                            as: 'level',
                                            required: false,
                                            attributes: ['levelname', 'levelorder'],
                                            include: [
                                                {
                                                    model: grades,
                                                    as: 'grade',
                                                    required: false,
                                                    attributes: ['gradename', 'gradeorder'],
                                                    include: [
                                                        {
                                                            model: curriculums,
                                                            as: 'curriculum',
                                                            required: false,
                                                            attributes: ['curriculumname']
                                                        }
                                                    ]
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        },
                    ]
                },
                {
                    model: schoolusers,
                    as: 'schooluser',
                    required: true,
                    attributes: ['schoolusername']
                },
                {
                    model: standards,
                    as: 'class',
                    required: false,
                    attributes: ['standardname']
                },
                {
                    model: schools,
                    required: false,
                    attributes: ['schoolid', 'schoolname', 'countryid'],
                    include: [
                        {
                            model: countries,
                            as: 'countries',
                            attributes: ['countryname'],
                        },
                    ]
                }
            ]
        });
        let curriculum: curriculums | null = null;
        if(progress.rows.length > 0) {
            const student = progress.rows[0];
            if(student) {
                curriculum = await curriculums.findOne({
                    attributes: ['curriculumname'],
                    where: { curriculumid: student.curriculumid },
                });
            }
        }
        return {progress, curriculum};
    }

    getStudentLastCompletedQuiz = async (paging: IMultiPaging, download: boolean = false, type: number) => {
        const where: WhereOptions<studentsAttributes> = {
            is_teacher_acc: false
        };
        const order = ["lastupdated"];
        const limit = paging.pagesize || 20;
        let offset = 0;
        if ((paging.pageindex || 1) > 1) {
            offset = limit * ((paging.pageindex || 1) - 1);
        }
        buildCustomWhere(paging.filter ?? [], {key: 'curriculumid', fields: '$studentprogresses.lessonquiz.lesson.level.grade.curriculum.curriculumid$', where: where});
        buildCustomWhere(paging.filter ?? [], {key: 'gradeid', fields: '$studentprogresses.lessonquiz.lesson.level.grade.gradeid$', where: where});
        buildCustomWhere(paging.filter ?? [], {key: 'levelid', fields: '$studentprogresses.lessonquiz.lesson.level.levelid$', where: where});
        buildCustomWhere(paging.filter ?? [], {key: 'lessonid', fields: '$studentprogresses.lessonquiz.lesson.lessonid$', where: where});
        buildCustomWhere(paging.filter ?? [], {key: 'countryid', fields: '$school.countryid$', where: where});
        buildCustomWhere(paging.filter ?? [], {key: 'schoolid', fields: '$school.schoolid$', where: where});
        buildCustomWhere(paging.filter ?? [], {fields: 'standard', where: where});
        buildCustomWhere(paging.filter ?? [], {fields: 'studentid', where: where});
        const {progress, curriculum} = await this.getAllStudentsWithProgress(type, {where, order, limit, offset});
        const lastcompletedlessonquiz: Array<students | undefined> = [];
        for (const student of progress.rows) {
            student.setDataValue('curriculum', curriculum ?? undefined);
            const groupUserProgress = student.getDataValue('studentprogresses');
            if(!groupUserProgress || groupUserProgress.length <= 0) {
                lastcompletedlessonquiz.push(student);
                continue;
            }
            // const sortGroupUserProgress = sortBy(groupUserProgress, 'starttime');
            const maxGradeOrder = maxBy(groupUserProgress, 'lessonquiz.lesson.level.grade.gradeorder');
            if(maxGradeOrder && groupUserProgress) {
                const lastGradeProgress = groupUserProgress.filter(gup => gup.lessonquiz?.lesson.level.grade.gradeorder === maxGradeOrder.lessonquiz?.lesson.level.grade.gradeorder)
                const maxLevelOrder = maxBy(lastGradeProgress, 'lessonquiz.lesson.level.levelorder');
                if(maxLevelOrder) {
                    const lastLevelProgress = lastGradeProgress.filter(gup => gup.lessonquiz?.lesson.level.levelorder === maxLevelOrder.lessonquiz?.lesson.level.levelorder)
                    const maxLessonOrder = maxBy(lastLevelProgress, 'lessonquiz.lesson.lessonorder');
                    if(maxLessonOrder) {
                        const lastLessonProgress = lastLevelProgress.filter(gup => gup.lessonquiz?.lesson.lessonorder === maxLessonOrder.lessonquiz?.lesson.lessonorder)
                        const maxLessonQuizOrder = maxBy(lastLessonProgress, 'lessonquiz.lessonquizorder');
                        if(maxLessonQuizOrder) {
                            const lastLessonQuizProgress = lastLessonProgress.filter(gup => gup.lessonquiz?.lessonquizorder === maxLessonQuizOrder.lessonquiz?.lessonquizorder);
                            student.setDataValue('studentprogresses', []);
                            student.setDataValue('laststudentprogress', maxBy(lastLessonQuizProgress, 'starttime'));
                            lastcompletedlessonquiz.push(student);
                        }
                    }
                }
            }
        }
        const tempArr = lastcompletedlessonquiz.slice();
        tempArr.splice(0, offset);
        const paginationArr = !download ? tempArr.splice(0, limit) : lastcompletedlessonquiz;
        return {lastcompletedlessonquiz: paginationArr, count: lastcompletedlessonquiz.length}
    }

    getStudentStatus = async (
        paging: IMultiPaging,
        download: boolean = false,
    ) => {
        const where: WhereOptions<studentsAttributes> = {
            is_teacher_acc: false,
        };
        let whereUsage: any = {};
        const limit = paging.pagesize || 20;
        let offset = 0;
        if ((paging.pageindex || 1) > 1) {
            offset = limit * ((paging.pageindex || 1) - 1);
        }
        buildCustomWhere(paging.filter ?? [], {key: 'countryid', fields: '$school.countryid$', where: where});
        buildCustomWhere(paging.filter ?? [], {key: 'schoolname', fields: '$school.schoolname$', where: where});
        buildCustomWhere(paging.filter ?? [], {key: 'schoolid', fields: '$school.schoolid$', where: where});
        buildCustomWhere(paging.filter ?? [], {fields: 'studentid', where: where});
        buildCustomWhere(paging.filter ?? [], {fields: 'standard', where: where});
        buildCustomWhere(paging.filter ?? [], {fields: 'startDate', where: whereUsage});
        buildCustomWhere(paging.filter ?? [], {fields: 'endDate', where: whereUsage});
        const options: any = { where };
        // check if there no search, download only part of all 
        if(!download || (download && !paging.filter?.some(f => f.key != 'schoolid' && f.value))) {
            options.limit = limit;
            options.offset = offset;
        }
        const allstudents = await students.findAndCountAll({
            ...options,
            attributes: ['studentid', 'country', 'schoolname', 'standard', 'schooluserid', 'created_at'],
            include: [
                {
                    model: schoolusers,
                    as: 'schooluser',
                    required: true,
                    attributes: ['schoolusername'],
                },
                {
                    model: schools,
                    required: true,
                    attributes: ['schoolid','schoolname','countryid'],
                    include: [
                        {
                            model: countries,
                            as: 'countries',
                            attributes: ['countryname'],
                        },
                    ]
                },
                {
                    model: standards,
                    as: 'class',
                    required: false,
                    attributes: ['standardname']
                },
                {
                    model: curriculums,
                    as: 'curriculum',
                    required: true,
                    attributes: ['curriculumname']
                }
            ]
        });
        if(whereUsage.startDate) {
            const endDate = whereUsage.endDate ? whereUsage.endDate : new Date();
            whereUsage = {
                created_at: {
                    [Op.between] : [whereUsage.startDate, endDate]
                }
            }
        }
        const lastonemonth = subMonths(new Date(), 1);
        for await (const st of allstudents.rows) {
            whereUsage.schooluserid = st.schooluserid;
            const logins = await rpiuseraccess.findOne({
                order: [['logintime', 'DESC']],
                limit: 1,
                where: { userid: st.schooluserid }
            });
            const studentactive = await rpiuseraccess.findOne({
                attributes: ['logintime'],
                where: { 
                    userid: st.schooluserid,
                    logintime: {
                        [Op.gte]: lastonemonth
                    }
                }
            });
            const appusages = await studentappusages.findAll({
                where: whereUsage,
                attributes: [[fn("sum", col("time_spent")), "time_spent"]],
            });
            const totalusages = appusages[0]?.time_spent ?? 0;
            st.setDataValue('status', studentactive ? true : false);
            st.setDataValue('lastLogin', logins?.logintime);
            st.setDataValue('totalusages', Math.ceil(totalusages/60) ?? 0);
            (st as any).lastLogin = logins?.logintime;
        }
        return allstudents;
    }

    getSyncRecord = async (paging: IMultiPaging, user: LmsUserToken) => {
        let where: WhereOptions<syncsAttributes> = {};
        const whereschool: WhereOptions<schoolsAttributes> = {};
        const order = ["created_at"];
        const limit = paging.pagesize || 20;
        let offset = 0;
        if ((paging.pageindex || 1) > 1) {
            offset = limit * ((paging.pageindex || 1) - 1);
        }
        where = { ...constructWhere<syncsAttributes>(paging, where) };
        if(user.schools && user.schools.length > 0) {
            whereschool.schoolid = {
                [Op.in]: user.schools
            }
        }
        const syncrecords = await syncs.findAndCountAll(
            {
                order, limit, offset,
                include: [
                    {
                        model: schoolusers,
                        required: true,
                        attributes: ['schooluserid', 'schoolusername', 'schoolname'],
                        include: [
                            {
                                model: schools,
                                required: true,
                                attributes: ['schoolid'],
                                where: whereschool,
                                include: [
                                    {
                                        model: countries,
                                        as: 'countries',
                                        required: true,
                                        attributes: ['countryname']
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        );
        return syncrecords;
    }

    getDashboardByCountry = async (countryid: string) => {
        const numberOfSchools = await schools.count({
            where: {
                countryid
            },
        });
        const numberOfTeachers = await schoolusers.count({
            where: {
                schooluserrole: 3
            },
            include: [
                {
                    model: schools,
                    required: true,
                    where: { countryid }
                }
            ]
        });
        const numberOfStudents = await schoolusers.count({
            where: {
                schooluserrole: 4
            },
            include: [
                {
                    model: schools,
                    required: true,
                    where: { countryid }
                }
            ]
        });
        const chartFormat: Array<ChartItemFormat> = [];
        chartFormat.push({ name: 'Teachers', value: numberOfTeachers });
        chartFormat.push({ name: 'Schools', value: numberOfSchools });
        chartFormat.push({ name: 'Students', value: numberOfStudents });
        return chartFormat;
    }

    getDashboardBySchool = async (schoolname: string) => {
        const numberOfTeachers = await schoolusers.count({
            where: {
                schooluserrole: 3
            },
            include: [
                {
                    model: schools,
                    required: true,
                    where: { schoolname }
                }
            ]
        });
        const numberOfStudents = await students.count({
            where: {
                schoolname
            },
        });
        const chartFormat: Array<ChartItemFormat> = [];
        chartFormat.push({ name: 'Teachers', value: numberOfTeachers });
        chartFormat.push({ name: 'Students', value: numberOfStudents });
        return chartFormat;
    }

    getStudentsGenderByCountry = async (countryid: string) => {
        const numberOfBoys = await students.count({
            where: {
                genderid: 1,
            },
            include: [
                {
                    model: schoolusers,
                    as: 'schooluser',
                    required: true,
                    include: [
                        {
                            model: schools,
                            required: true,
                            where: { countryid }
                        }
                    ]
                }
            ]
        });
        const numberOfGirls = await students.count({
            where: {
                genderid: 2
            },
            include: [
                {
                    model: schoolusers,
                    required: true,
                    as: 'schooluser',
                    include: [
                        {
                            model: schools,
                            required: true,
                            where: { countryid }
                        }
                    ]
                }
            ]
        });
        const chartFormat: Array<ChartItemFormat> = [];
        chartFormat.push({ name: 'Girl', value: numberOfGirls });
        chartFormat.push({ name: 'Boy', value: numberOfBoys });
        return chartFormat;
    }

    getStudentsGenderBySchool = async (schoolname: string) => {
        const numberOfBoys = await students.count({
            where: {
                genderid: 1,
            },
            include: [
                {
                    model: schoolusers,
                    as: 'schooluser',
                    required: true,
                    include: [
                        {
                            model: schools,
                            required: true,
                            where: { schoolname }
                        }
                    ]
                }
            ]
        });
        const numberOfGirls = await students.count({
            where: {
                genderid: 2
            },
            include: [
                {
                    model: schoolusers,
                    required: true,
                    as: 'schooluser',
                    include: [
                        {
                            model: schools,
                            required: true,
                            where: { schoolname }
                        }
                    ]
                }
            ]
        });
        const chartFormat: Array<ChartItemFormat> = [];
        chartFormat.push({ name: 'Girl', value: numberOfGirls });
        chartFormat.push({ name: 'Boy', value: numberOfBoys });
        return chartFormat;
    }

    getStudentUsage = async () => {
        const allcountries = await countries.findAll({
            where: { isdeleted: false }
        });
        const lineChartsFormat: Array<LineChartFormat> = [];
        const lastonemonth = subMonths(new Date(), 1);
        for await (const country of allcountries) {
            // This used to sum time_spent with the country filter expressed as a
            // nested include. Sequelize injects the model's primary key whenever
            // an include is present, so the query became `sum(time_spent)`
            // alongside studentappusageid with no GROUP BY, which MySQL rejects
            // under ONLY_FULL_GROUP_BY (the default since 5.7). The whole Impact
            // page 500'd for any database with at least one country in it.
            //
            // Resolve the country's school users first and filter on them, so the
            // aggregate runs with no include and no primary key is added. This is
            // the same shape as the working aggregate in getStudentStatus above.
            // schoolusers joins schools on schoolname, not an id.
            const countryschools = await schools.findAll({
                where: { countryid: country.countryid, isdeleted: false },
                attributes: ['schoolname'],
            });
            const countryschoolusers = await schoolusers.findAll({
                where: { schoolname: { [Op.in]: countryschools.map(s => s.schoolname) } },
                attributes: ['schooluserid'],
            });
            const usages = await studentappusages.findAll({
                attributes: [[fn('sum', col('time_spent')), 'time_spent']],
                where: {
                    created_at: { [Op.gte]: lastonemonth },
                    schooluserid: { [Op.in]: countryschoolusers.map(su => su.schooluserid) },
                },
            });
            const totaltimespent = usages[0]?.time_spent ?? 0;
            const numberofstudents = await students.count({
                where: { isactive: 1 },
                include: [
                    {
                        model: schools,
                        required: true,
                        attributes: []
                    }
                ]
            });
            const itemCharts: Array<ChartItemFormat> = [
                {
                    name: 'Expected',
                    value: country.expectedusage ?? 0,
                },
                {
                    name: 'Actual',
                    value: numberofstudents > 0 ? Math.round(((totaltimespent/30)/numberofstudents + Number.EPSILON) * 100) / 100 : 0
                },
            ]
            lineChartsFormat.push({ name: country.countryname ?? 'N/A', series: itemCharts});
        }
        return lineChartsFormat; 
    }

    getStudentGradeProgress = async (paging: IMultiPaging) => {
        // levels.hasMany(studentprogress, {
        //     foreignKey: "studentprogressreferenceid",
        //     sourceKey: "levelid",
        // });
        // studentprogress.belongsTo(levels, {
        //     foreignKey: "studentprogressreferenceid",
        // });
        const limit = paging.pagesize || 20;
        let offset = 0;
        if ((paging.pageindex || 1) > 1) {
            offset = limit * ((paging.pageindex || 1) - 1);
        }
        const where: any = {};
        const gradewhere: any = {};
        buildCustomWhere(paging.filter ?? [], {fields: 'standard', where: where});
        buildCustomWhere(paging.filter ?? [], {fields: 'gradeid', where: gradewhere});
        let student: students | null = null;
        if(!where.standard && !where.studentid) {
            student = await students.findOne({
                where: { studentid: Default_Test_Student_ID }
            });
            if(!student) throw new BadRequestException('school has no student!');
            where.standard = student?.standard;
            // where.studentid = student.studentid;
        } else if(!where.studentid) {
            student = await students.findOne({
                where: { standard: where.standard }
            });
            // if(student) where.studentid = student.studentid;
        } else if (where.studentid) {
            student = await students.findOne({
                where: { studentid: where.studentid }
            });
        }
        // find a lesson to show
        if(!gradewhere.gradeid && student?.curriculumid) {
            const curriculum = await curriculums.findOne({
                where: { curriculumid: student?.curriculumid, curriculumstatus: true, isdeleted: false },
                attributes: ['curriculumid', 'curriculumname'],
                include: [
                    {
                        model: grades,
                        as: 'grades',
                        required: true,
                        where: { gradestatus: true, isdeleted: false },
                        attributes: ['gradeid', 'gradename', 'gradeorder'],
                        include: [
                            {
                                model: levels,
                                as: 'levels',
                                required: true,
                                where: { levelstatus: true, isdeleted: false },
                                attributes: ['levelname', 'levelorder'],
                                include: [
                                    {
                                        model: lessons,
                                        as: 'lessons',
                                        required: true,
                                        where: { lessonstatus: true, isdeleted: false },
                                        attributes: ['lessonid', 'lessonorder'],
                                    },
                                ]
                            },
                        ]
                    },
                ]
            });
            const bestgrade = minBy(curriculum?.grades, 'gradeorder');
            gradewhere.gradeid = bestgrade?.gradeid;
        }
        const stds = await students.findAndCountAll({
            where, limit, offset,
            include: [
                {
                    model: studentgradesprogress,
                    required: false,
                    where: gradewhere,
                    attributes: ['gradeid', 'progress', 'scores'],
                },
            ]
        }).then((async stds => {
            for await (const student of stds.rows) {
                // const stdlevelpg = (student as any).studentlevelsprogresses as studentlevelsprogress[];
                // if(stdlevelpg.length > 0) {
                //     const studentlevelprogress = stdlevelpg[0];
                //     let quiz = await studentprogress.findOne({
                //         order: [['starttime', 'ASC']],
                //         where: {
                //             studentid: student?.studentid,
                //             ispass: 1
                //         },
                //         attributes: ['scores', 'resultpercentage', 'marks', 'ispass'],
                //         include: [
                //             {
                //                 model: levels,
                //                 required: true,
                //                 attributes: [],
                //                 where: { levelid: studentlevelprogress.levelid }
                //             },
                //         ]
                //     });
                //     if(!quiz) {
                //         quiz = await studentprogress.findOne({
                //             order: [['starttime', 'DESC']],
                //             where: {
                //                 studentid: student?.studentid,
                //                 ispass: 0
                //             },
                //             attributes: ['scores', 'resultpercentage', 'marks', 'ispass'],
                //             include: [
                //                 {
                //                     model: levels,
                //                     required: true,
                //                     attributes: [],
                //                     where: { levelid: studentlevelprogress.levelid }
                //                 },
                //             ]
                //         });
                //     }
                //     if(quiz) {
                //         const totalquestions = Math.round(((quiz.marks/quiz.resultpercentage*100 ?? 0) + Number.EPSILON) * 100) / 100 ?? 0;
                //         quiz.setDataValue('totalquestions', totalquestions);
                //         student.setDataValue('laststudentprogress', quiz);
                //     }
                // }
                const grade = await grades.findOne({
                    where: { gradeid: gradewhere.gradeid },
                    attributes: ['gradename'],
                    include: [
                        {
                            model: curriculums,
                            as: 'curriculum',
                            required: true,
                            attributes: ['curriculumname']
                        }
                    ]
                })
                if(grade) student.setDataValue('grade', grade);
                const standard = await standards.findOne({
                    where: { standardid: student?.standard },
                    attributes: ['standardname']
                });
                const schoolcountry = await schools.findOne({
                    where: { schoolname: student?.schoolname },
                    attributes: ['schoolname'],
                    include: [
                        {
                            model: countries,
                            as: 'countries',
                            attributes: ['countryname'],
                        },
                    ]
                });
                if(schoolcountry) student?.setDataValue('school', schoolcountry);
                if(standard) student?.setDataValue('class', standard);
            }
            return stds;
        }));
        return stds;
    }

    getStudentGradeProgress2 = async (paging: IMultiPaging) => {
        const limit = paging.pagesize || 20;
        let offset = 0;
        if ((paging.pageindex || 1) > 1) {
            offset = limit * ((paging.pageindex || 1) - 1);
        }
        const where:any = {};
        buildCustomWhere(paging.filter ?? [], {fields: 'studentid', where: where});
        if(!where.studentid) {
            where.studentid = Default_Test_Student_ID;
        }
        const student = await students.findOne({
            where: {
                studentid: where.studentid
            },
            attributes: ['studentfirstname'],
            include: [
                {
                    model: curriculums,
                    required: true,
                    as: 'curriculum',
                    attributes: ['curriculumid']
                }
            ]
        });
        if(!student) return { rows: [], count: 0, student: null };
        const studentgradeprogresses = await grades.findAndCountAll({
            where: { gradestatus: true, isdeleted: false },
            order: ['gradename'],
            limit, offset,
            attributes: ['gradeid', 'gradename'],
            include: [
                {
                    model: curriculums,
                    as: 'curriculum',
                    required: true,
                    where: { curriculumid: student.curriculum.curriculumid, curriculumstatus: true, isdeleted: false },
                    attributes: ['curriculumid','curriculumname'],
                },
            ]
        }).then(async gradescount => {
            for await (const grade of gradescount.rows) {
                const studentgradeprogress = await studentgradesprogress.findOne({
                    where: { studentid: where.studentid, gradeid: grade.gradeid }
                });
                if(studentgradeprogress) grade.setDataValue('studentgradeprogress', studentgradeprogress);
            }
            return gradescount;
        });

        return {...studentgradeprogresses, student};
    }

    getStudentLevelProgress = async (paging: IMultiPaging) => {
        const limit = paging.pagesize || 20;
        let offset = 0;
        if ((paging.pageindex || 1) > 1) {
            offset = limit * ((paging.pageindex || 1) - 1);
        }
        const where:any = {};
        const levelwhere:any = { levelstatus: true, isdeleted: false };
        buildCustomWhere(paging.filter ?? [], {fields: 'studentid', where: where});
        buildCustomWhere(paging.filter ?? [], {fields: 'gradeid', where: levelwhere});
        if(!where.studentid) {
            where.studentid = Default_Test_Student_ID;
        }
        const student = await students.findOne({
            where: {
                studentid: where.studentid
            },
            attributes: ['studentfirstname'],
            include: [
                {
                    model: curriculums,
                    required: true,
                    as: 'curriculum',
                    attributes: ['curriculumid']
                }
            ]
        });
        if(!student) return { rows: [], count: 0, student: null };
        const studentlevelprogresses = await levels.findAndCountAll({
            where: levelwhere,
            order: ['levelname'],
            limit, offset,
            attributes: ['levelid', 'levelname'],
            include: [
                {
                    model: grades,
                    as: 'grade',
                    required: true,
                    where: { gradestatus: true, isdeleted: false},
                    attributes: ['gradeid','gradename'],
                    include: [
                        {
                            model: curriculums,
                            as: 'curriculum',
                            required: true,
                            where: { curriculumid: student.curriculum.curriculumid, curriculumstatus: true, isdeleted: false },
                            attributes: ['curriculumid','curriculumname'],
                        },
                    ]
                },
            ]
        }).then(async levelscount => {
            for await (const level of levelscount.rows) {
                const studentlevelprogress = await studentlevelsprogress.findOne({
                    where: { studentid: where.studentid, levelid: level.levelid }
                });
                if(studentlevelprogress) level.setDataValue('studentlevelprogress', studentlevelprogress);
            }
            return levelscount;
        });
        return {...studentlevelprogresses, student};
    }

    getStudentLessonProgress = async (paging: IMultiPaging) => {
        const limit = paging.pagesize || 20;
        let offset = 0;
        if ((paging.pageindex || 1) > 1) {
            offset = limit * ((paging.pageindex || 1) - 1);
        }
        const where:any = {};
        const levelwhere:any = { levelstatus: true, isdeleted: false };
        const lessonwhere:any = { lessonstatus: true, isdeleted: false };
        buildCustomWhere(paging.filter ?? [], {fields: 'studentid', where: where});
        buildCustomWhere(paging.filter ?? [], {fields: 'gradeid', where: levelwhere});
        buildCustomWhere(paging.filter ?? [], {fields: 'levelid', where: lessonwhere});
        if(!where.studentid) {
            where.studentid = Default_Test_Student_ID;
        }
        const student = await students.findOne({
            where: {
                studentid: where.studentid
            },
            attributes: ['studentfirstname'],
            include: [
                {
                    model: curriculums,
                    required: true,
                    as: 'curriculum',
                    attributes: ['curriculumid']
                }
            ]
        });
        if(!student) return { rows: [], count: 0, student: null };
        const studentlessonprogresses = await lessons.findAndCountAll({
            where: lessonwhere,
            order: ['lessonname'],
            limit, offset,
            attributes: ['lessonid', 'lessonname'],
            include: [
                {
                    model: levels,
                    as: 'level',
                    required: true,
                    where: levelwhere,
                    attributes: ['levelid','levelname'],
                    include: [
                        {
                            model: grades,
                            as: 'grade',
                            required: true,
                            where: { gradestatus: true, isdeleted: false },
                            attributes: ['gradeid','gradename'],
                            include: [
                                {
                                    model: curriculums,
                                    as: 'curriculum',
                                    required: true,
                                    where: { curriculumid: student.curriculum.curriculumid, curriculumstatus: true, isdeleted: false },
                                    attributes: ['curriculumid','curriculumname'],
                                },
                            ]
                        },
                    ]
                },
            ]
        }).then(async lessonscount => {
            for await (const lesson of lessonscount.rows) {
                const studentlessonprogress = await studentlessonsprogress.findOne({
                    where: { studentid: where.studentid, lessonid: lesson.lessonid }
                });
                if(studentlessonprogress) lesson.setDataValue('studentlessonprogress', studentlessonprogress);
            }
            return lessonscount;
        });
        return {...studentlessonprogresses, student};
    }

    getLevelQuizScoresData = async (
        paging: IMultiPaging,
        download: boolean = false
    ) => {
        levels.hasMany(studentprogress, {
            foreignKey: "studentprogressreferenceid",
            sourceKey: "levelid",
        });
        studentprogress.belongsTo(levels, {
            foreignKey: "studentprogressreferenceid",
        });
        // const limit = paging.pagesize || 20;
        // let offset = 0;
        // if ((paging.pageindex || 1) > 1) {
        //     offset = limit * ((paging.pageindex || 1) - 1);
        // }
        const where: any = {};
        const levelwhere: any = {levelstatus: true, isdeleted: false};
        buildCustomWhere(paging.filter ?? [], {fields: 'curriculumid', where: where});
        buildCustomWhere(paging.filter ?? [], {fields: 'studentid', where: where});
        buildCustomWhere(paging.filter ?? [], {key: 'gradeid', fields: '$grade.gradeid$', where: levelwhere});
        buildCustomWhere(paging.filter ?? [], {fields: 'levelid', where: levelwhere});
        let student: students | null = null;
        if(!where.standard && !where.studentid) {
            student = await students.findOne({
                where: { studentid: Default_Test_Student_ID },
                include: [
                    {
                        model: schoolusers,
                        as: 'schooluser',
                        required: true,
                        attributes: ['schoolusername']
                    }
                ]
            });
            if(!student) throw new BadRequestException('school has no student!');
            where.standard = student?.standard;
            where.studentid = student.studentid;
        } else if(!where.studentid) {
            student = await students.findOne({
                where: { standard: where.standard },
                include: [
                    {
                        model: schoolusers,
                        as: 'schooluser',
                        required: true,
                        attributes: ['schoolusername']
                    }
                ]
            });
            if(student) where.studentid = student.studentid;
        } else if (where.studentid) {
            student = await students.findOne({
                where: { studentid: where.studentid },
                include: [
                    {
                        model: schoolusers,
                        as: 'schooluser',
                        required: true,
                        attributes: ['schoolusername']
                    }
                ]
            });
        }
        if(!student) return { rows: [], count: 0};
        const options: any = { where: levelwhere };
        // if(!download) {
        //     options.limit = limit;
        //     options.offset = offset;
        // }
        const alllevels = await levels.findAndCountAll({
            ...options,
            include: [
                {
                    model: studentlevelsprogress,
                    required: false,
                    where: { studentid: student?.studentid },
                    attributes: ['levelid'],
                },
                {
                    model: grades,
                    as: 'grade',
                    required: true,
                    attributes: ['gradename'],
                    include: [
                        {
                            model: curriculums,
                            as: 'curriculum',
                            required: true,
                            where: { curriculumid: (where.curriculumid ? where.curriculumid : student?.curriculumid) },
                            attributes: ['curriculumname']
                        }
                    ]
                },
            ]
        }).then((async lvs => {
            for await (const lv of lvs.rows) {
                const stdlevelpg = (lv as any).studentlevelsprogresses as studentlevelsprogress[];
                if(stdlevelpg.length > 0) {
                    const studentlevelprogress = stdlevelpg[0];
                    let quiz = await studentprogress.findOne({
                        order: [['starttime', 'ASC']],
                        where: {
                            studentid: student?.studentid,
                            ispass: 1
                        },
                        attributes: ['studentprogressreferenceid', 'scores', 'resultpercentage', 'marks', 'ispass', 'starttime'],
                        include: [
                            {
                                model: levels,
                                required: true,
                                attributes: [],
                                where: { levelid: studentlevelprogress.levelid }
                            },
                        ]
                    });
                    if(!quiz) {
                        quiz = await studentprogress.findOne({
                            order: [['starttime', 'DESC']],
                            where: {
                                studentid: student?.studentid,
                                ispass: 0
                            },
                            attributes: ['studentprogressreferenceid', 'scores', 'resultpercentage', 'marks', 'ispass', 'starttime'],
                            include: [
                                {
                                    model: levels,
                                    required: true,
                                    attributes: [],
                                    where: { levelid: studentlevelprogress.levelid }
                                },
                            ]
                        });
                    }
                    if(quiz) {
                        const totalquestions = await levelquizquestions.count({
                            where: { levelid: quiz.studentprogressreferenceid }
                        });
                        quiz.setDataValue('totalquestions', totalquestions);
                        lv.setDataValue('laststudentprogress', quiz);
                        lv.setDataValue('starttime', quiz.starttime);
                    }
                }
                const grade = await grades.findOne({
                    where: { gradeid: lv.gradeid },
                    attributes: ['gradename'],
                    include: [
                        {
                            model: curriculums,
                            as: 'curriculum',
                            required: true,
                            attributes: ['curriculumname']
                        }
                    ]
                })
                if(grade) lv.setDataValue('grade', grade);
                const standard = await standards.findOne({
                    where: { standardid: student?.standard },
                    attributes: ['standardname']
                });
                const schoolcountry = await schools.findOne({
                    where: { schoolname: student?.schoolname },
                    attributes: ['schoolname'],
                    include: [
                        {
                            model: countries,
                            as: 'countries',
                            attributes: ['countryname'],
                        },
                    ]
                });
                if(schoolcountry) student?.setDataValue('school', schoolcountry);
                if(standard) student?.setDataValue('class', standard);
                lv.setDataValue('student', student ?? undefined);
            }
            for (let i = 1; i < lvs.rows.length; i++) {
                const starttime = lvs.rows[i].getDataValue('starttime') ?? 0;
                for (let j = 0; j < i; j++) {
                    const starttimeloop = lvs.rows[j].getDataValue('starttime') ?? 0;
                    if (isAfter(starttime, starttimeloop)) {
                        const x = lvs.rows[i];
                        lvs.rows[i] = lvs.rows[j];
                        lvs.rows[j] = x;
                    }
                }
            }
            return lvs;
        }));
        return alllevels;
    };

    getClassLevelQuizScoresData = async (
        paging: IMultiPaging,
        download: boolean = false
    ) => {
        levels.hasMany(studentprogress, {
            foreignKey: "studentprogressreferenceid",
            sourceKey: "levelid",
        });
        studentprogress.belongsTo(levels, {
            foreignKey: "studentprogressreferenceid",
        });
        const limit = paging.pagesize || 20;
        let offset = 0;
        if ((paging.pageindex || 1) > 1) {
            offset = limit * ((paging.pageindex || 1) - 1);
        }
        const where: any = {
            is_teacher_acc: false
        };
        const levelwhere: any = {};
        buildCustomWhere(paging.filter ?? [], {fields: 'standard', where: where});
        buildCustomWhere(paging.filter ?? [], {fields: 'levelid', where: levelwhere});
        let student: students | null = null;
        if(!where.standard && !where.studentid) {
            student = await students.findOne({
                where: { studentid: Default_Test_Student_ID },
            });
            if(!student) throw new BadRequestException('school has no student!');
            where.standard = student?.standard;
        } else if(!where.studentid) {
            student = await students.findOne({
                where: { standard: where.standard },
            });
            // if(student) where.studentid = student.studentid;
        } else if (where.studentid) {
            student = await students.findOne({
                where: { studentid: where.studentid },
            });
            if(student) where.standard = student?.standard;
        }
        if(!student) return { rows: [], count: 0};
        // find a lesson to show
        if(!levelwhere.levelid && student?.curriculumid) {
            const curriculum = await curriculums.findOne({
                where: { curriculumid: student?.curriculumid, curriculumstatus: true, isdeleted: false },
                attributes: ['curriculumid', 'curriculumname'],
                include: [
                    {
                        model: grades,
                        as: 'grades',
                        required: true,
                        where: { gradestatus: true, isdeleted: false },
                        attributes: ['gradename', 'gradeorder'],
                        include: [
                            {
                                model: levels,
                                as: 'levels',
                                required: true,
                                where: { levelstatus: true, isdeleted: false },
                                attributes: ['levelid','levelname', 'levelorder'],
                                include: [
                                    {
                                        model: lessons,
                                        as: 'lessons',
                                        required: true,
                                        where: { lessonstatus: true, isdeleted: false },
                                        attributes: ['lessonid', 'lessonorder'],
                                    },
                                ]
                            },
                        ]
                    },
                ]
            });
            const bestgrade = minBy(curriculum?.grades, 'gradeorder');
            const bestlevel = minBy(bestgrade?.levels, 'levelorder');
            levelwhere.levelid = bestlevel?.levelid;
        }
        const level = await levels.findOne({
            where: { levelid: levelwhere.levelid },
            attributes: ['levelname'],
            include: [
                {
                    model: grades,
                    as: 'grade',
                    required: true,
                    attributes: ['gradename'],
                    include: [
                        {
                            model: curriculums,
                            as: 'curriculum',
                            required: true,
                            attributes: ['curriculumname']
                        }
                    ]
                }
            ]
        });
        const options: any = { where };
        if(!download) {
            options.limit = limit;
            options.offset = offset;
        }
        const alllevels = await students.findAndCountAll({
            ...options,
            include: [
                {
                    model: studentlevelsprogress,
                    required: false,
                    where: levelwhere,
                    attributes: ['levelid'],
                },
            ]
        }).then((async stds => {
            for await (const std of stds.rows) {
                const stdlevelpg = (std as any).studentlevelsprogresses as studentlevelsprogress[];
                if(stdlevelpg.length > 0) {
                    const studentlevelprogress = stdlevelpg[0];
                    let quiz = await studentprogress.findOne({
                        order: [['starttime', 'ASC']],
                        where: {
                            studentid: std?.studentid,
                            ispass: 1
                        },
                        attributes: ['studentprogressreferenceid', 'scores', 'resultpercentage', 'marks', 'ispass', 'starttime'],
                        include: [
                            {
                                model: levels,
                                required: true,
                                attributes: [],
                                where: { levelid: studentlevelprogress.levelid }
                            },
                        ]
                    });
                    if(!quiz) {
                        quiz = await studentprogress.findOne({
                            order: [['starttime', 'DESC']],
                            where: {
                                studentid: std?.studentid,
                                ispass: 0
                            },
                            attributes: ['studentprogressreferenceid', 'scores', 'resultpercentage', 'marks', 'ispass', 'starttime'],
                            include: [
                                {
                                    model: levels,
                                    required: true,
                                    attributes: [],
                                    where: { levelid: studentlevelprogress.levelid }
                                },
                            ]
                        });
                    }
                    if(quiz) {
                        const totalquestions = await levelquizquestions.count({
                            where: { levelid: quiz.studentprogressreferenceid }
                        });
                        quiz.setDataValue('totalquestions', totalquestions);
                        std.setDataValue('laststudentprogress', quiz);
                    }
                }
                if(level) std.setDataValue('level', level);
                const standard = await standards.findOne({
                    where: { standardid: std?.standard },
                    attributes: ['standardname']
                });
                const schoolcountry = await schools.findOne({
                    where: { schoolname: std?.schoolname },
                    attributes: ['schoolname'],
                    include: [
                        {
                            model: countries,
                            as: 'countries',
                            attributes: ['countryname'],
                        },
                    ]
                });
                const schooluser = await schoolusers.findOne({
                    where: { schooluserid: std.schooluserid },
                    attributes: ['schoolusername']
                });
                if(schoolcountry) std?.setDataValue('school', schoolcountry);
                if(standard) std?.setDataValue('class', standard);
                if(schooluser) std?.setDataValue('schooluser', schooluser);
            }
            return stds;
        }));
        return alllevels;
    };

    getFeedbackTechDowntime = async (body: {startDate: string, endDate: string}) => {
        let startDate = subMonths(new Date(), 1);
        let endDate = new Date;
        const date = parseISO(body.startDate as string) ?? null;
        if(date && !isNaN(date.getTime())) startDate = startOfMonth(date);
        const enddate = parseISO(body.endDate as string) ?? null;
        if(enddate && !isNaN(enddate.getTime())) endDate = startOfMonth(enddate);
        const allfeedbacks = await feedbacks.findAll({
            where: { 
                isdeleted: false,
                created_at: {
                    [Op.between]: [startDate, endDate]
                }
            }
        });
        const lineChartsFormat: Array<ChartItemFormat> = [];
        const numberDowntime: TechDowntimeNumbers = {
            rpi: 0,
            router: 0,
            content: 0,
            tablet: 0,
            app: 0,
            general: 0,
        }
        allfeedbacks.forEach(feedback => {
            const content = feedback.feedback as FeedbackData;
            if(this.checkTechDowntimeExist(content.rpi)) numberDowntime.rpi += 1;
            if(this.checkTechDowntimeExist(content.router)) numberDowntime.router += 1;
            if(this.checkTechDowntimeExist(content.content)) numberDowntime.content += 1;
            if(this.checkTechDowntimeExist(content.tablet)) numberDowntime.tablet += 1;
            if(this.checkTechDowntimeExist(content.app)) numberDowntime.app += 1;
            if(this.checkTechDowntimeExist(content.general)) numberDowntime.general += 1;
        });
        lineChartsFormat.push({name: 'RPI', value: numberDowntime.rpi});
        lineChartsFormat.push({name: 'Router', value: numberDowntime.router});
        lineChartsFormat.push({name: 'Content', value: numberDowntime.content});
        lineChartsFormat.push({name: 'Tablet', value: numberDowntime.tablet});
        lineChartsFormat.push({name: 'App', value: numberDowntime.app});
        lineChartsFormat.push({name: 'General', value: numberDowntime.general});
        return lineChartsFormat; 
    }

    checkTechDowntimeExist = (data: FeedbackDataContent) => {
        if(data && (data.feedback.length > 0 || data.images.length > 0 || data.selected_error.length > 0)) return true
        return false
    }
}