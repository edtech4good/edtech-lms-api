import { subMonths } from "date-fns";
import { groupBy } from "lodash";
import { Op } from "sequelize";
import { rpiuseraccess } from "src/models/data-models/rpiuseraccess";
import { studentactives } from "src/models/data-models/studentactives";
import { studentappusages } from "src/models/data-models/studentappusage";
import { studentgradesprogress } from "src/models/data-models/studentgradesprogress";
import { studentlearningprogress } from "src/models/data-models/studentlearningprogress";
import { studentlessonsprogress } from "src/models/data-models/studentlessonprogress";
import { studentlevelsprogress } from "src/models/data-models/studentlevelsprogress";
import { studentpoints } from "src/models/data-models/studentpoints";
import { studentprogress } from "src/models/data-models/studentprogress";
import { studentprogressquestions } from "src/models/data-models/studentprogressquestions";
import {
  CurriculumBusiness,
  DocumentBusiness,
  GradeBusiness,
  LessonBusiness,
  LevelBusiness,
  QuestionBusiness,
} from ".";
import { CountryBusiness } from "./country.business";
import { CurriculumBaseLineBusiness } from "./curriculumbaseline.business";
import { FeedbackBusiness } from "./feedback.business";
import { LessonLearningBusiness } from "./lessonlearning.business";
import { LessonPracticeBusiness } from "./lessonpractice.business";
import { LessonPracticeQuestionBusiness } from "./lessonpracticequestion.business";
import { LessonQuizBusiness } from "./lessonquiz.business";
import { LessonQuizQuestionBusiness } from "./lessonquizquestion.business";
import { LevelQuizQuestionBusiness } from "./levelquizquestion.business";
import { SchoolBusiness } from "./school.business";
import { SchoolcontributeBusiness } from "./schoolcontribute.business";
import { SchoolUserBusiness } from "./schooluser.business";
import { StandardBusiness } from "./standard.business";
import { BaselineQuestionBusiness } from "./baslinequestion.business";
import { LessonPlanBusiness } from "./lessonplan.business";
import { SubjectBusiness } from "./subject.business";

export class SyncBusiness {
  // old version apk
  synconline = async () => {
    const curriculums = await new CurriculumBusiness().getCurriculums();
    const curriculumbaselines =
      await new CurriculumBaseLineBusiness().getCurriculumBaseLines(true);
    // const baselinequestion = await new BaselineQuestionBusiness().getBaselineQuestion();
    const grades = await new GradeBusiness().getGrades();
    const levels = await new LevelBusiness().getLevels();
    const lessons = await new LessonBusiness().getLessons();
    const lessonlearnings =
      await new LessonLearningBusiness().getLessonLearnings();
    const lessonpractices =
      await new LessonPracticeBusiness().getLessonPractices();
    const lessonpracticequestions =
      await new LessonPracticeQuestionBusiness().getLessonPracticeQuestions();
    const lessonquizzes = await new LessonQuizBusiness().getLessonQuizzes();
    const lessonquizquestions =
      await new LessonQuizQuestionBusiness().getLessonQuizQuestions();
    const levelquizquestions =
      await new LevelQuizQuestionBusiness().getLevelQuizQuestions(true);
    const questions = await new QuestionBusiness().getquestions();
    const documents = await new DocumentBusiness().getdocuments();
    const standards = await new StandardBusiness().getStandards();
    const schools = await new SchoolBusiness().getSchools();
    const countries = await new CountryBusiness().getCountries();
    const syncdata = {
      curriculums,
      curriculumbaselines,
      grades,
      levels,
      lessons,
      lessonlearnings,
      lessonpractices,
      lessonpracticequestions,
      lessonquizzes,
      lessonquizquestions,
      levelquizquestions,
      questions,
      documents,
      standards,
      schools,
      countries,
    };
    return JSON.stringify(syncdata);
  };

  // this function made for new version apk
  syncontentVersion2 = async () => {
    const curriculums = await new CurriculumBusiness().getCurriculums();
    const curriculumbaselines =
      await new CurriculumBaseLineBusiness().getCurriculumBaseLines();
    const baselinequestion = await new BaselineQuestionBusiness().getBaselineQuestion();
    const grades = await new GradeBusiness().getGrades();
    const levels = await new LevelBusiness().getLevels();
    const lessons = await new LessonBusiness().getLessons();
    const lessonlearnings =
      await new LessonLearningBusiness().getLessonLearnings();
    const lessonpractices =
      await new LessonPracticeBusiness().getLessonPractices();
    const lessonpracticequestions =
      await new LessonPracticeQuestionBusiness().getLessonPracticeQuestions();
    const lessonquizzes = await new LessonQuizBusiness().getLessonQuizzes();
    const lessonquizquestions =
      await new LessonQuizQuestionBusiness().getLessonQuizQuestions();
    const levelquizquestions =
      await new LevelQuizQuestionBusiness().getLevelQuizQuestions();
    const questions = await new QuestionBusiness().getquestions();
    const documents = await new DocumentBusiness().getdocuments();
    const standards = await new StandardBusiness().getStandards();
    const schools = await new SchoolBusiness().getSchools();
    const countries = await new CountryBusiness().getCountries();
    const lessonplans = await new LessonPlanBusiness().getLessonPlans();
    const subjects = await new SubjectBusiness().getSubjects();
    const syncdata = {
      curriculums,
      curriculumbaselines,
      baselinequestion,
      grades,
      levels,
      lessons,
      lessonlearnings,
      lessonpractices,
      lessonpracticequestions,
      lessonquizzes,
      lessonquizquestions,
      levelquizquestions,
      questions,
      documents,
      standards,
      schools,
      countries,
      lessonplans,
      subjects
    };
    return JSON.stringify(syncdata);
  };

  getreportdata = async () => {
    const curriculums = await new CurriculumBusiness().getCurriculums();
    const curriculumbaselines =
      await new CurriculumBaseLineBusiness().getCurriculumBaseLines();
    const baselinequestion = await new BaselineQuestionBusiness().getBaselineQuestion();
    const grades = await new GradeBusiness().getGrades();
    const levels = await new LevelBusiness().getLevels();
    const lessons = await new LessonBusiness().getLessons();
    const lessonplans = await new LessonPlanBusiness().getLessonPlans();
    const lessonlearnings =
      await new LessonLearningBusiness().getLessonLearnings();
    const lessonpractices =
      await new LessonPracticeBusiness().getLessonPractices();
    const lessonpracticequestions =
      await new LessonPracticeQuestionBusiness().getLessonPracticeQuestions();
    const lessonquizzes = await new LessonQuizBusiness().getLessonQuizzes();
    const lessonquizquestions =
      await new LessonQuizQuestionBusiness().getLessonQuizQuestions();
    const levelquizquestions =
      await new LevelQuizQuestionBusiness().getLevelQuizQuestions();
    const questions = await new QuestionBusiness().getquestions();
    const documents = await new DocumentBusiness().getdocuments();
    const standards = await new StandardBusiness().getStandards();
    const schools = await new SchoolBusiness().getSchools();
    const countries = await new CountryBusiness().getCountries();
    const feedbacks = await new FeedbackBusiness().getFeedbacks();
    const schoolcontribution = await new SchoolcontributeBusiness().getSchoolContribution();
    const contents = {
      curriculums,
      curriculumbaselines,
      baselinequestion,
      grades,
      levels,
      lessons,
      lessonlearnings,
      lessonpractices,
      lessonpracticequestions,
      lessonquizzes,
      lessonquizquestions,
      levelquizquestions,
      questions,
      documents,
      standards,
      schools,
      countries,
      feedbacks,
      schoolcontribution,
      lessonplans
    };
    const studentusers =
      await new SchoolUserBusiness().getschoolusers();
    const getstudentdata = await this.getstudentdata();
    const data = {
      contents,
      students: studentusers ? studentusers.map((x) => x.get({ plain: true })) : [],
      studentprogress: getstudentdata.progress,
      studentresult: getstudentdata.result,
      studentaccess: getstudentdata.access
    };
    return JSON.stringify(data);
  };

  getstudentdata = async () => {
    const limitdate = subMonths(new Date(), 6);
    const sp = (
      await studentprogress.findAll({
        where: {
          starttime: { [Op.gt]: limitdate },
        },
      })
    ).map((x) => ({
      ...x.get({ plain: true }),
    }));
    const spqo = await studentprogressquestions.findAll({
      where: {
        studentprogressid: {
          [Op.in]: sp.map((x) => x.studentprogressid),
        },
      },
    });
    const spq = spqo.map((x) => x.get({ plain: true }));
    const gspq = groupBy(spq, "studentprogressid");
    const sa = await rpiuseraccess.findAll({
      where: {
        logintime: { [Op.gt]: limitdate },
      },
    });
    const stactives = (
      await studentactives.findAll({
        where: {
          created_at: { [Op.gt]: limitdate },
        },
      })
    ).map((x) => ({
      ...x.get({ plain: true }),
    }));
    const stlp = (
      await studentlearningprogress.findAll({
        where: {
          lastupdated: { [Op.gt]: limitdate },
        },
      })
    ).map((x) => ({
      ...x.get({ plain: true }),
    }));
    const stgp = (
      await studentgradesprogress.findAll({
        where: {
          lastupdated: { [Op.gt]: limitdate },
        },
      })
    ).map((x) => ({
      ...x.get({ plain: true }),
    }));
    const stlvp = (
      await studentlevelsprogress.findAll({
        where: {
          lastupdated: { [Op.gt]: limitdate },
        },
      })
    ).map((x) => ({
      ...x.get({ plain: true }),
    }));
    const stlsp = (
      await studentlessonsprogress.findAll({
        where: {
          lastupdated: { [Op.gt]: limitdate },
        },
      })
    ).map((x) => ({
      ...x.get({ plain: true }),
    }));
    const stpoints = (
      await studentpoints.findAll({
        where: {
          created_at: { [Op.gt]: limitdate },
        },
      })
    ).map((x) => ({
      ...x.get({ plain: true }),
    }));
    const stpusages = (
      await studentappusages.findAll({
        where: {
          created_at: { [Op.gt]: limitdate },
        },
      })
    ).map((x) => ({
      ...x.get({ plain: true }),
    }));
    return {
      result: sp.map((x) => ({
        ...x,
        studentprogressquestions: gspq[x.studentprogressid],
      })),
      progress: {
        studentactives: stactives,
        studentlearningprogress: stlp,
        studentgradesprogress: stgp,
        studentlevelsprogress: stlvp,
        studentlessonsprogress: stlsp,
        studentpoints: stpoints,
        studentappusages: stpusages,
      },
      access: sa.map((x) => x.get({ plain: true })),
    };
  };
}
