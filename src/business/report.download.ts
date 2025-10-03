import { lessons, lessonsAttributes } from "src/models/data-models/lessons";
import { levels, levelsAttributes } from "src/models/data-models/levels";
import { students, studentsAttributes } from "src/models/data-models/students";
import { IMultiFilter } from "src/models/IPaging";
import { schoolcontributedata } from '../models/data-models/schoolcontributedata';

interface IQuizzesScores {
    curriculum: string;
    school: string;
    userid: string;
    class: string;
    course: string;
    level: string;
    lesson: string;
    marks: string;
    totalquestions: string;
    percentage: string;
    quizscore: number;
    result: string;
}

interface ICurrentLevel {
    curriculum: string;
    country: string;
    school: string;
    userid: string;
    class: string;
    course: string;
    level: string;
    lesson: string;
    score: string;
    result: string;
}

interface ILevelQuizzesScores {
    curriculum: string;
    school: string;
    userid: string;
    class: string;
    course: string;
    level: string;
    marks: string;
    totalquestions: string;
    percentage: string;
    quizscore: number;
    result: string;
}

interface SchoolContributeData {
    school_contribute: string;
    expected: string;
    actual: string;
    date: string;
}

// interface IStudentActivity {
//     curriculum: string;
//     country: string;
//     schoolname: string;
//     userid: string;
//     class: string;
//     active: boolean;
//     totalusages: number;
//     lastlogin: string;
// }

export class ReportDownload {
    formatSchoolcontribute = (data:schoolcontributedata[]) =>{
        return data.map(con => {
            // const flatcontribute = con.get({plain: true});
            const school: SchoolContributeData = {
                school_contribute: con.schoolname ?? 'N/A',
                expected: con.expected + '$' ?? '0',
                actual: con.actual + '$' ?? '0',
                date: (con.expected !== 0 && con.actual !== 0 ? con.created_at?.toLocaleDateString() : 'N/A') ?? 'N/A',
            }
            return school;
        })
    }
    formatQuizzes = (data: lessons[]) => {
        return data.map(ls => {
            const flatlesson = ls.get({plain: true});
            const lesson: IQuizzesScores = {
                curriculum: ls.level.grade.curriculum.curriculumname,
                school: flatlesson.student?.schoolname ?? 'N/A',
                userid: flatlesson.student?.schooluser.schoolusername ?? '',
                class: flatlesson.student?.class?.standardname ?? 'N/A',
                course: ls.level.grade.gradename,
                level: ls.level.levelname,
                lesson: ls.lessonname,
                marks: flatlesson.laststudentprogress ? `${flatlesson.laststudentprogress?.marks}` : 'N/A',
                totalquestions: flatlesson.laststudentprogress ? `${flatlesson.laststudentprogress.getDataValue('totalquestions')}` ?? 'N/A' : 'N/A',
                percentage: (flatlesson.laststudentprogress ? flatlesson.laststudentprogress?.resultpercentage : 0) + '%',
                quizscore: flatlesson.laststudentprogress?.scores ?? 0,
                result: flatlesson.laststudentprogress ? (flatlesson.laststudentprogress.resultpercentage >= 80 ? 'Pass' : 'Redo') : 'N/A'
            }
            return lesson;
        })
    }

    formatQuizzesOfClass = (data: students[]) => {
        return data.map(std => {
            const flatstudent = std.get({plain: true});
            const lesson: IQuizzesScores = {
                curriculum: flatstudent.lesson?.level.grade.curriculum.curriculumname ?? 'N/A',
                school: std.schoolname ?? 'N/A',
                userid: std.getDataValue('schooluser')?.schoolusername ?? '',
                class: flatstudent.class?.standardname ?? 'N/A',
                course: flatstudent.lesson?.level.grade.gradename ?? '',
                level: flatstudent.lesson?.level.levelname ?? '',
                lesson: flatstudent.lesson?.lessonname ?? '',
                marks: flatstudent.laststudentprogress ? `${flatstudent.laststudentprogress?.marks}` : 'N/A',
                totalquestions: flatstudent.laststudentprogress ? `${flatstudent.laststudentprogress?.getDataValue('totalquestions')}` ?? 'N/A' : 'N/A',
                percentage: (flatstudent.laststudentprogress ? flatstudent.laststudentprogress?.resultpercentage : 0) + '%',
                quizscore: flatstudent.laststudentprogress?.scores ?? 0,
                result: flatstudent.laststudentprogress ? (flatstudent.laststudentprogress.resultpercentage >= 80 ? 'Pass' : 'Redo') : 'N/A'
            }
            return lesson;
        })
    }

    formatQuizzesOfClassOnline = (data: students[]) => {
        return data.map(std => {
            const flatstudent = std as studentsAttributes;
            const lesson: IQuizzesScores = {
                curriculum: flatstudent.lesson?.level.grade.curriculum.curriculumname ?? 'N/A',
                school: std.schoolname ?? 'N/A',
                userid: std.schooluser?.schoolusername ?? '',
                class: flatstudent.class?.standardname ?? 'N/A',
                course: flatstudent.lesson?.level.grade.gradename ?? '',
                level: flatstudent.lesson?.level.levelname ?? '',
                lesson: flatstudent.lesson?.lessonname ?? '',
                marks: flatstudent.laststudentprogress ? `${flatstudent.laststudentprogress?.marks}` : 'N/A',
                totalquestions: flatstudent.laststudentprogress ? `${(flatstudent.laststudentprogress as any)?.totalquestions}` ?? 'N/A' : 'N/A',
                percentage: (flatstudent.laststudentprogress ? flatstudent.laststudentprogress?.resultpercentage : 0) + '%',
                quizscore: flatstudent.laststudentprogress?.scores ?? 0,
                result: flatstudent.laststudentprogress ? (flatstudent.laststudentprogress.resultpercentage >= 80 ? 'Pass' : 'Redo') : 'N/A'
            }
            return lesson;
        })
    }

    formatQuizzesOnline = (data: lessons[]) => {
        return data.map(ls => {
            const flatlesson = ls as lessonsAttributes;
            const lesson: IQuizzesScores = {
                curriculum: ls.level.grade.curriculum.curriculumname,
                school: flatlesson.student?.schoolname ?? 'N/A',
                userid: flatlesson.student?.schooluser.schoolusername ?? '',
                class: flatlesson.student?.class?.standardname ?? 'N/A',
                course: ls.level.grade.gradename,
                level: ls.level.levelname,
                lesson: ls.lessonname,
                marks: flatlesson.laststudentprogress ? `${flatlesson.laststudentprogress?.marks}` : 'N/A',
                totalquestions: flatlesson.laststudentprogress ? `${(flatlesson.laststudentprogress as any)?.totalquestions}` ?? 'N/A' : 'N/A',
                percentage: (flatlesson.laststudentprogress ? flatlesson.laststudentprogress?.resultpercentage : 0) + '%',
                quizscore: flatlesson.laststudentprogress?.scores ?? 0,
                result: flatlesson.laststudentprogress ? (flatlesson.laststudentprogress.resultpercentage >= 80 ? 'Pass' : 'Redo') : 'N/A'
            }
            return lesson;
        })
    }

    formatLevelQuizzes = (data: levels[]) => {
        return data.map(lv => {
            const flatlesson = lv.get({plain: true});
            const lesson: ILevelQuizzesScores = {
                curriculum: lv.grade.curriculum.curriculumname,
                school: flatlesson.student?.schoolname ?? 'N/A',
                userid: flatlesson.student?.schooluser.schoolusername ?? '',
                class: flatlesson.student?.class?.standardname ?? 'N/A',
                course: lv.grade.gradename,
                level: lv.levelname,
                marks: flatlesson.laststudentprogress ? `${flatlesson.laststudentprogress?.marks}` : 'N/A',
                totalquestions: flatlesson.laststudentprogress ? `${flatlesson.laststudentprogress?.getDataValue('totalquestions')}` ?? 'N/A' : 'N/A',
                percentage: (flatlesson.laststudentprogress ? flatlesson.laststudentprogress?.resultpercentage : 0) + '%',
                quizscore: flatlesson.laststudentprogress?.scores ?? 0,
                result: flatlesson.laststudentprogress ? (flatlesson.laststudentprogress.resultpercentage >= 80 ? 'Pass' : 'Redo') : 'N/A'
            }
            return lesson;
        })
    }

    formatLevelQuizzesClass = (data: students[]) => {
        return data.map(st => {
            const flatstudent = st.get({plain: true});
            const lesson: ILevelQuizzesScores = {
                curriculum: flatstudent.level?.grade.curriculum.curriculumname ?? 'N/A',
                school: st.schoolname ?? 'N/A',
                userid: st.getDataValue('schooluser')?.schoolusername ?? '',
                class: st.class?.standardname ?? 'N/A',
                course: flatstudent.level?.grade.gradename ?? 'N/A',
                level: flatstudent.level?.levelname ?? 'N/A',
                marks: flatstudent.laststudentprogress ? `${flatstudent.laststudentprogress?.marks}` : 'N/A',
                totalquestions: flatstudent.laststudentprogress ? `${flatstudent.laststudentprogress?.getDataValue('totalquestions')}` ?? 'N/A' : 'N/A',
                percentage: (flatstudent.laststudentprogress ? flatstudent.laststudentprogress?.resultpercentage : 0) + '%',
                quizscore: flatstudent.laststudentprogress?.scores ?? 0,
                result: flatstudent.laststudentprogress ? (flatstudent.laststudentprogress.resultpercentage >= 80 ? 'Pass' : 'Redo') : 'N/A'
            }
            return lesson;
        })
    }

    formatLevelQuizzesClassOnline = (data: students[]) => {
        return data.map(st => {
            const flatstudent = st as studentsAttributes;
            const lesson: ILevelQuizzesScores = {
                curriculum: flatstudent.level?.grade.curriculum.curriculumname ?? 'N/A',
                school: st.schoolname ?? 'N/A',
                userid: st.schooluser?.schoolusername ?? '',
                class: st.class?.standardname ?? 'N/A',
                course: flatstudent.level?.grade.gradename ?? 'N/A',
                level: flatstudent.level?.levelname ?? 'N/A',
                marks: flatstudent.laststudentprogress ? `${flatstudent.laststudentprogress?.marks}` : 'N/A',
                totalquestions: flatstudent.laststudentprogress ? `${(flatstudent.laststudentprogress as any)?.totalquestions}` ?? 'N/A' : 'N/A',
                percentage: (flatstudent.laststudentprogress ? flatstudent.laststudentprogress?.resultpercentage : 0) + '%',
                quizscore: flatstudent.laststudentprogress?.scores ?? 0,
                result: flatstudent.laststudentprogress ? (flatstudent.laststudentprogress.resultpercentage >= 80 ? 'Pass' : 'Redo') : 'N/A'
            }
            return lesson;
        })
    }

    formatLevelQuizzesOnline = (data: levels[]) => {
        return data.map(lv => {
            const flatlesson = lv as levelsAttributes;
            const lesson: ILevelQuizzesScores = {
                curriculum: lv.grade.curriculum.curriculumname,
                school: flatlesson.student?.schoolname ?? 'N/A',
                userid: flatlesson.student?.schooluser.schoolusername ?? '',
                class: flatlesson.student?.class?.standardname ?? 'N/A',
                course: lv.grade.gradename,
                level: lv.levelname,
                marks: flatlesson.laststudentprogress ? `${flatlesson.laststudentprogress?.marks}` : 'N/A',
                totalquestions: flatlesson.laststudentprogress ? `${(flatlesson.laststudentprogress as any)?.totalquestions}` ?? 'N/A' : 'N/A',
                percentage: (flatlesson.laststudentprogress ? flatlesson.laststudentprogress?.resultpercentage : 0) + '%',
                quizscore: flatlesson.laststudentprogress?.scores ?? 0,
                result: flatlesson.laststudentprogress ? (flatlesson.laststudentprogress.resultpercentage >= 80 ? 'Pass' : 'Redo') : 'N/A'
            }
            return lesson;
        })
    }

    formatCurrentLevel = (data: (students | undefined)[]) => {
        const stds = data ? data as students[] : [];
        return stds.map(std => {
            const flatstudent = std.get({plain: true});
            const lesson: ICurrentLevel = {
                curriculum: flatstudent.curriculum?.curriculumname ?? 'N/A',
                country: flatstudent.school?.countries?.countryname ?? 'N/A',
                school: flatstudent.school?.schoolname ?? 'N/A',
                userid: flatstudent.schooluser?.schoolusername ?? '',
                class: flatstudent.class?.standardname ?? 'N/A',
                course: flatstudent.laststudentprogress?.lessonquiz?.lesson?.level?.grade?.gradename ?? 'N/A',
                level: flatstudent.laststudentprogress?.lessonquiz?.lesson?.level?.levelname ?? 'N/A',
                lesson: flatstudent.laststudentprogress?.lessonquiz?.lesson?.lessonname ?? 'N/A',
                score: flatstudent.laststudentprogress ? flatstudent.laststudentprogress?.resultpercentage + ' %' : 'N/A',
                result: flatstudent.laststudentprogress ? (flatstudent.laststudentprogress.resultpercentage >= 80 ? 'Pass' : 'Redo') : 'N/A'
            }
            return lesson;
        })
    }

    formatCurrentLevelOnline = (data: (students | undefined)[]) => {
        const stds = data ? data as students[] : [];
        return stds.map(std => {
            const flatstudent = std as studentsAttributes;
            const lesson: ICurrentLevel = {
                curriculum: flatstudent.curriculum?.curriculumname ?? 'N/A',
                country: flatstudent.school?.countries?.countryname ?? 'N/A',
                school: flatstudent.school?.schoolname ?? 'N/A',
                userid: flatstudent.schooluser?.schoolusername ?? '',
                class: flatstudent.class?.standardname ?? 'N/A',
                course: flatstudent.laststudentprogress?.lessonquiz?.lesson?.level?.grade?.gradename ?? 'N/A',
                level: flatstudent.laststudentprogress?.lessonquiz?.lesson?.level?.levelname ?? 'N/A',
                lesson: flatstudent.laststudentprogress?.lessonquiz?.lesson?.lessonname ?? 'N/A',
                score: flatstudent.laststudentprogress ? flatstudent.laststudentprogress?.resultpercentage + ' %' : 'N/A',
                result: flatstudent.laststudentprogress ? (flatstudent.laststudentprogress.resultpercentage >= 80 ? 'Pass' : 'Redo') : 'N/A'
            }
            return lesson;
        })
    }

    formatStudentActivity = (data: students[], filters?: Array<IMultiFilter>) => {
        let startdate = '';
        let enddate = '';
        if(filters) {
            const startDate =new Date((filters.find(filter => filter.key === 'startDate')?.value as string));
            if(startDate && !isNaN(startDate.getTime())) startdate = startDate.toLocaleDateString();
            const endDate = new Date((filters.find(filter => filter.key === 'endDate')?.value as string)); 
            if(endDate && !isNaN(endDate.getTime())) enddate = endDate.toLocaleDateString();
        }
        const excelData = data.map(std => {
            const flatstudent = std.get({plain: true});
            // const student: IStudentActivity = {
            //     curriculum: std.curriculum.curriculumname,
            //     country: std.school?.countries?.countryname ?? 'N/A',
            //     schoolname: std.schoolname ?? '',
            //     userid: std.schooluser?.schoolusername ?? 'N/A',
            //     class: std.class?.standardname ?? 'N/A',
            //     active: flatstudent.status ?? false,
            //     totalusages: flatstudent.totalusages ?? 0,
            //     lastlogin: flatstudent.lastLogin ? flatstudent.lastLogin?.toLocaleDateString() +' '+ flatstudent.lastLogin?.toLocaleTimeString() : ''
            // }
            // // eslint-disable-next-line no-console
            // console.log(student);
            let text = {};
            text = {
                "Start Date": std.curriculum.curriculumname,
                "End Date": std.school?.countries?.countryname ?? 'N/A',
                "": std.schoolname ?? '',
                " ": std.schooluser?.schoolusername ?? 'N/A',
                "  ": std.class?.standardname ?? 'N/A',
                "   ": flatstudent.status ?? false,
                "    ": flatstudent.totalusages ?? 0,
                "     ": flatstudent.lastLogin ? flatstudent.lastLogin?.toLocaleDateString() +' '+ flatstudent.lastLogin?.toLocaleTimeString() : ''
            }
            return text;
        });
        excelData.unshift({
            "Start Date": "curriculum",
            "End Date": "country",
            "": "schoolname",
            " ": "userid",
            "  ": "class",
            "   ": "active",
            "    ": "totalusages",
            "     ": "lastlogin"
        });
        excelData.unshift({
            "Start Date": "",
            "End Date": "",
            "": "",
            " ": "",
            "  ": "",
            "   ": "",
            "    ": "",
            "     ": ""
        });
        excelData.unshift({
            "Start Date": startdate ? startdate : 'N/A',
            "End Date": enddate ? enddate : 'N/A',
            "": "",
            " ": "",
            "  ": "",
            "   ": "",
            "    ": "",
            "     ": ""
        });
        return excelData;
    }

    formatStudentActivityOnline = (data: students[], filters?: Array<IMultiFilter>) => {
        let startdate = '';
        let enddate = '';
        let lastLoginDate: Date | string = '';
        if(filters) {
            const startDate =new Date((filters.find(filter => filter.key === 'startDate')?.value as string));
            if(startDate && !isNaN(startDate.getTime())) startdate = startDate.toLocaleDateString();
            const endDate = new Date((filters.find(filter => filter.key === 'endDate')?.value as string)); 
            if(endDate && !isNaN(endDate.getTime())) enddate = endDate.toLocaleDateString();
        }
        const excelData = data.map(std => {
            const flatstudent = std as studentsAttributes;
            let text = {};
            lastLoginDate = new Date(flatstudent.lastLogin ?? ''); 
            if(!lastLoginDate || isNaN(lastLoginDate.getTime())) lastLoginDate = '';
            text = {
                "Start Date": std.curriculum.curriculumname,
                "End Date": std.school?.countries?.countryname ?? 'N/A',
                "": std.schoolname ?? '',
                " ": std.schooluser?.schoolusername ?? 'N/A',
                "  ": std.class?.standardname ?? 'N/A',
                "   ": flatstudent.status ?? false,
                "    ": flatstudent.totalusages ?? 0,
                "     ": lastLoginDate ? (lastLoginDate as Date).toLocaleDateString() +' '+ (lastLoginDate as Date).toLocaleTimeString() : ''
            }
            return text;
        });
        excelData.unshift({
            "Start Date": "curriculum",
            "End Date": "country",
            "": "schoolname",
            " ": "userid",
            "  ": "class",
            "   ": "active",
            "    ": "totalusages",
            "     ": "lastlogin"
        });
        excelData.unshift({
            "Start Date": "",
            "End Date": "",
            "": "",
            " ": "",
            "  ": "",
            "   ": "",
            "    ": "",
            "     ": ""
        });
        excelData.unshift({
            "Start Date": startdate ? startdate : 'N/A',
            "End Date": enddate ? enddate : 'N/A',
            "": "",
            " ": "",
            "  ": "",
            "   ": "",
            "    ": "",
            "     ": ""
        });
        return excelData;
    }
}