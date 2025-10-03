import type { Sequelize } from "sequelize";
import { curriculumbaseline } from "./curriculumbaseline";
import { curriculumcountry } from "./curriculumcountry";
import type { curriculumbaselineAttributes, curriculumbaselineCreationAttributes } from "./curriculumbaseline";
import type { curriculumcountryAttributes, curriculumcountryCreationAttributes } from "./curriculumcountry";
import type {
  curriculumsAttributes,
  curriculumsCreationAttributes,
} from "./curriculums";
import { curriculums } from "./curriculums";
import type {
  databuildAttributes,
  databuildCreationAttributes,
} from "./databuild";
import { databuild } from "./databuild";
import type {
  documentsAttributes,
  documentsCreationAttributes,
} from "./documents";
import { documents } from "./documents";
import type {
  documenttagsAttributes,
  documenttagsCreationAttributes,
} from "./documenttags";
import { documenttags } from "./documenttags";
import type { gradesAttributes, gradesCreationAttributes } from "./grades";
import { grades } from "./grades";
import type {
  lessonlearningsAttributes,
  lessonlearningsCreationAttributes,
} from "./lessonlearnings";
import { lessonlearnings } from "./lessonlearnings";
import type {
  lessonpracticequestionsAttributes,
  lessonpracticequestionsCreationAttributes,
} from "./lessonpracticequestions";
import { lessonpracticequestions } from "./lessonpracticequestions";
import type {
  lessonpracticesAttributes,
  lessonpracticesCreationAttributes,
} from "./lessonpractices";
import { lessonpractices } from "./lessonpractices";
import type {
  lessonquizquestionsAttributes,
  lessonquizquestionsCreationAttributes,
} from "./lessonquizquestions";
import { lessonquizquestions } from "./lessonquizquestions";
import type {
  lessonquizzesAttributes,
  lessonquizzesCreationAttributes,
} from "./lessonquizzes";
import { lessonquizzes } from "./lessonquizzes";
import type { lessonsAttributes, lessonsCreationAttributes } from "./lessons";
import { lessons } from "./lessons";
import type {
  levelquizquestionsAttributes,
  levelquizquestionsCreationAttributes,
} from "./levelquizquestions";
import { levelquizquestions } from "./levelquizquestions";
import type { levelsAttributes, levelsCreationAttributes } from "./levels";
import { levels } from "./levels";
import type {
  lmsuseraccessAttributes,
  lmsuseraccessCreationAttributes,
} from "./lmsuseraccess";
import { lmsuseraccess } from "./lmsuseraccess";
import type {
  lmsusersAttributes,
  lmsusersCreationAttributes,
} from "./lmsusers";
import { lmsusers } from "./lmsusers";
import type {
  questionsAttributes,
  questionsCreationAttributes,
} from "./questions";
import { questions } from "./questions";
import type {
  questiontagsAttributes,
  questiontagsCreationAttributes,
} from "./questiontags";
import { questiontags } from "./questiontags";
import type {
  rpiuseraccessAttributes,
  rpiuseraccessCreationAttributes,
} from "./rpiuseraccess";
import { rpiuseraccess } from "./rpiuseraccess";
import {
  schools,
  schoolsAttributes,
  schoolsCreationAttributes,
  schoolsOptionalAttributes,
} from "./school";
import type {
  schoolusersAttributes,
  schoolusersCreationAttributes,
} from "./schoolusers";
import { schoolusers } from "./schoolusers";
import {
  standards,
  standardsAttributes,
  standardsCreationAttributes,
  standardsOptionalAttributes,
} from "./standard";
import type {
  studentprogressAttributes,
  studentprogressCreationAttributes,
} from "./studentprogress";
import { studentprogress } from "./studentprogress";
import type {
  studentprogressquestionsAttributes,
  studentprogressquestionsCreationAttributes,
} from "./studentprogressquestions";
import { studentprogressquestions } from "./studentprogressquestions";
import type {
  studentsAttributes,
  studentsCreationAttributes,
} from "./students";
import { students } from "./students";
import type { tokensAttributes, tokensCreationAttributes } from "./tokens";
import { tokens } from "./tokens";
import { roles } from "./roles";
import { permissions } from "./permissions";
import { permissionstitle } from "./permissionstitle";

import {
  countries,
  countriesAttributes,
  countriesCreationAttributes,
  countriesOptionalAttributes,
} from "./countries";
import { studentlearningprogress } from "src/models/data-models/studentlearningprogress";
import { studentgradesprogress } from "src/models/data-models/studentgradesprogress";
import { studentlessonsprogress } from "src/models/data-models/studentlessonprogress";
import { studentlevelsprogress } from "src/models/data-models/studentlevelsprogress";
import { studentactives } from "src/models/data-models/studentactives";
import { studentpoints } from "src/models/data-models/studentpoints";
import { logfiles } from "src/models/data-models/logfiles";
import { feedbacks } from "./feedback";
import { studentappusages } from "./studentappusage";
import { syncs } from "./syncrecord";
import {schoolcontributedata} from "./schoolcontributedata";
import { baselinequestion } from "./baselinequestion";
import { lessonplans } from "./lessonplan";
import { subjects } from "./subjects";

export {
  curriculumbaseline,
  curriculums,
  databuild,
  documents,
  documenttags,
  grades,
  lessonlearnings,
  lessonpracticequestions,
  lessonpractices,
  lessonquizquestions,
  lessonquizzes,
  lessons,
  levelquizquestions,
  levels,
  lmsuseraccess,
  lmsusers,
  questions,
  questiontags,
  schoolusers,
  studentprogress,
  studentprogressquestions,
  students,
  tokens,
  rpiuseraccess,
  schools,
  standards,
  countries,
  curriculumcountry,
  studentlearningprogress,
  studentgradesprogress,
  studentlevelsprogress,
  studentlessonsprogress,
  studentactives,
  studentpoints
};
export type {
  curriculumbaselineAttributes,
  curriculumbaselineCreationAttributes,
  curriculumsAttributes,
  curriculumsCreationAttributes,
  databuildAttributes,
  databuildCreationAttributes,
  documentsAttributes,
  documentsCreationAttributes,
  documenttagsAttributes,
  documenttagsCreationAttributes,
  gradesAttributes,
  gradesCreationAttributes,
  lessonlearningsAttributes,
  lessonlearningsCreationAttributes,
  lessonpracticequestionsAttributes,
  lessonpracticequestionsCreationAttributes,
  lessonpracticesAttributes,
  lessonpracticesCreationAttributes,
  lessonquizquestionsAttributes,
  lessonquizquestionsCreationAttributes,
  lessonquizzesAttributes,
  lessonquizzesCreationAttributes,
  lessonsAttributes,
  lessonsCreationAttributes,
  levelquizquestionsAttributes,
  levelquizquestionsCreationAttributes,
  levelsAttributes,
  levelsCreationAttributes,
  lmsuseraccessAttributes,
  lmsuseraccessCreationAttributes,
  lmsusersAttributes,
  lmsusersCreationAttributes,
  questionsAttributes,
  questionsCreationAttributes,
  questiontagsAttributes,
  questiontagsCreationAttributes,
  schoolusersAttributes,
  schoolusersCreationAttributes,
  studentprogressAttributes,
  studentprogressCreationAttributes,
  studentprogressquestionsAttributes,
  studentprogressquestionsCreationAttributes,
  studentsAttributes,
  studentsCreationAttributes,
  tokensAttributes,
  tokensCreationAttributes,
  rpiuseraccessAttributes,
  rpiuseraccessCreationAttributes,
  schoolsAttributes,
  schoolsCreationAttributes,
  schoolsOptionalAttributes,
  standardsAttributes,
  standardsCreationAttributes,
  standardsOptionalAttributes,
  countriesAttributes,
  countriesCreationAttributes,
  countriesOptionalAttributes,
  curriculumcountryAttributes,
  curriculumcountryCreationAttributes,
};

export function initModels(sequelize: Sequelize) {
  curriculumbaseline.initModel(sequelize);
  curriculums.initModel(sequelize);
  databuild.initModel(sequelize);
  documents.initModel(sequelize);
  documenttags.initModel(sequelize);
  grades.initModel(sequelize);
  lessonlearnings.initModel(sequelize);
  lessonpracticequestions.initModel(sequelize);
  lessonpractices.initModel(sequelize);
  lessonquizquestions.initModel(sequelize);
  lessonquizzes.initModel(sequelize);
  lessons.initModel(sequelize);
  levelquizquestions.initModel(sequelize);
  levels.initModel(sequelize);
  lmsuseraccess.initModel(sequelize);
  lmsusers.initModel(sequelize);
  questions.initModel(sequelize);
  questiontags.initModel(sequelize);
  schoolusers.initModel(sequelize);
  studentprogress.initModel(sequelize);
  studentprogressquestions.initModel(sequelize);
  students.initModel(sequelize);
  tokens.initModel(sequelize);
  rpiuseraccess.initModel(sequelize);
  schools.initModel(sequelize);
  standards.initModel(sequelize);
  roles.initModel(sequelize);
  permissions.initModel(sequelize);
  permissionstitle.initModel(sequelize);
  countries.initModel(sequelize);
  curriculumcountry.initModel(sequelize);
  studentlearningprogress.initModel(sequelize);
  studentgradesprogress.initModel(sequelize);
  studentlevelsprogress.initModel(sequelize);
  studentlessonsprogress.initModel(sequelize);
  studentactives.initModel(sequelize);
  studentpoints.initModel(sequelize);
  logfiles.initModel(sequelize);
  feedbacks.initModel(sequelize);
  studentappusages.initModel(sequelize);
  syncs.initModel(sequelize);
  schoolcontributedata.initModel(sequelize);
  baselinequestion.initModel(sequelize);
  lessonplans.initModel(sequelize);
  subjects.initModel(sequelize);

  schools.belongsTo(countries, {
    as: "countries",
    foreignKey: "countryid",
  });
  
  countries.hasMany(schools, { as: "schools", foreignKey: "countryid" });

  grades.belongsTo(curriculums, {
    as: "curriculum",
    foreignKey: "curriculumid",
  });
  
  curriculums.hasMany(grades, { as: "grades", foreignKey: "curriculumid" });
  students.belongsTo(curriculums, {
    as: "curriculum",
    foreignKey: "curriculumid",
  });
  curriculums.hasMany(students, { as: "students", foreignKey: "curriculumid" });
  levels.belongsTo(grades, { as: "grade", foreignKey: "gradeid" });
  grades.hasMany(levels, { as: "levels", foreignKey: "gradeid" });
  students.belongsTo(grades, { as: "grade", foreignKey: "gradeid" });
  grades.hasMany(students, { as: "students", foreignKey: "gradeid" });
  lessonpracticequestions.belongsTo(lessonpractices, {
    as: "lessonpractice",
    foreignKey: "lessonpracticeid",
  });
  lessonpractices.hasMany(lessonpracticequestions, {
    as: "lessonpracticequestions",
    foreignKey: "lessonpracticeid",
  });
  lessonquizquestions.belongsTo(lessonquizzes, {
    as: "lessonquiz",
    foreignKey: "lessonquizid",
  });
  lessonquizzes.hasMany(lessonquizquestions, {
    as: "lessonquizquestions",
    foreignKey: "lessonquizid",
  });
  lessonlearnings.belongsTo(lessons, { as: "lesson", foreignKey: "lessonid" });
  lessons.hasMany(lessonlearnings, {
    as: "lessonlearnings",
    foreignKey: "lessonid",
  });
  lessonpractices.belongsTo(lessons, { as: "lesson", foreignKey: "lessonid" });
  lessons.hasMany(lessonpractices, {
    as: "lessonpractices",
    foreignKey: "lessonid",
  });
  lessonquizzes.belongsTo(lessons, { as: "lesson", foreignKey: "lessonid" });
  lessons.hasMany(lessonquizzes, {
    as: "lessonquizzes",
    foreignKey: "lessonid",
  });
  students.belongsTo(lessons, {
    as: "studentcurrentlesson",
    foreignKey: "studentcurrentlessonid",
  });
  lessons.hasMany(students, {
    as: "students",
    foreignKey: "studentcurrentlessonid",
  });
  lessons.belongsTo(levels, { as: "level", foreignKey: "levelid" });
  levels.hasMany(lessons, { as: "lessons", foreignKey: "levelid" });
  levelquizquestions.belongsTo(levels, { as: "level", foreignKey: "levelid" });
  levels.hasMany(levelquizquestions, {
    as: "levelquizquestions",
    foreignKey: "levelid",
  });
  students.belongsTo(levels, {
    as: "startinglevel",
    foreignKey: "startinglevelid",
  });
  levels.hasMany(students, { as: "students", foreignKey: "startinglevelid" });
  students.belongsTo(levels, {
    as: "studentcurrentlevel",
    foreignKey: "studentcurrentlevelid",
  });
  levels.hasMany(students, {
    as: "studentcurrentlevel_students",
    foreignKey: "studentcurrentlevelid",
  });
  lessonpracticequestions.belongsTo(questions, {
    as: "question",
    foreignKey: "questionid",
  });
  questions.hasMany(lessonpracticequestions, {
    as: "lessonpracticequestions",
    foreignKey: "questionid",
  });
  lessonquizquestions.belongsTo(questions, {
    as: "question",
    foreignKey: "questionid",
  });
  questions.hasMany(lessonquizquestions, {
    as: "lessonquizquestions",
    foreignKey: "questionid",
  });
  levelquizquestions.belongsTo(questions, {
    as: "question",
    foreignKey: "questionid",
  });
  questions.hasMany(levelquizquestions, {
    as: "levelquizquestions",
    foreignKey: "questionid",
  });
  students.belongsTo(schoolusers, {
    as: "schooluser",
    foreignKey: "schooluserid",
  });
  schoolusers.hasMany(students, { as: "students", foreignKey: "schooluserid" });
  studentprogressquestions.belongsTo(studentprogress, {
    as: "studentprogress",
    foreignKey: "studentprogressid",
  });
  studentprogress.hasMany(studentprogressquestions, {
    as: "studentprogressquestions",
    foreignKey: "studentprogressid",
  });
  permissions.belongsToMany(roles, {through: 'roles_permissions', foreignKey: 'permissionid'});
  roles.belongsToMany(permissions, {through: 'roles_permissions', foreignKey: 'roleid'});
  lmsusers.belongsToMany(roles, {through: 'lmsusers_roles', foreignKey: 'lmsuserid'});
  roles.belongsToMany(lmsusers, {through: 'lmsusers_roles', foreignKey: 'roleid'});
  permissionstitle.hasMany(permissions, {foreignKey: {name: "permissiontitleid", allowNull: true}});
  permissions.belongsTo(permissionstitle, {foreignKey: "permissiontitleid"});
  studentlearningprogress.belongsTo(students, {
    as: "student",
    foreignKey: "studentid",
  });
  students.hasMany(studentlearningprogress, { as: "studentlearningprogress", foreignKey: "studentid" });

  schoolusers.hasMany(feedbacks, {
    foreignKey: "created_by",
    sourceKey: "schooluserid",
  });
  feedbacks.belongsTo(schoolusers, {
      foreignKey: "created_by",
  });
  curriculums.hasMany(feedbacks, {
    foreignKey: "curriculumid",
    sourceKey: "curriculumid",
  });
  feedbacks.belongsTo(curriculums, {
    foreignKey: "curriculumid",
  });
  schools.hasMany(standards, {
    foreignKey: "schoolid",
    sourceKey: "schoolid",
  });
  standards.belongsTo(schools, {
    foreignKey: "schoolid",
  });
  standards.hasOne(students, {
    foreignKey: "standard",
    as: 'student',
    sourceKey: "standardid",
  });
  students.belongsTo(standards, {
    as: 'class',
    foreignKey: "standard",
  });
  schoolusers.hasMany(syncs, {
    foreignKey: "created_by",
    sourceKey: "schooluserid",
  });
  syncs.belongsTo(schoolusers, {
      foreignKey: "created_by",
  });
  schools.hasMany(schoolusers, {
    foreignKey: "schoolname",
  });
  schoolusers.belongsTo(schools, {
    foreignKey: "schoolname",
    targetKey: "schoolname"
  });
  schools.hasMany(students, {
    foreignKey: "schoolname",
  });
  students.belongsTo(schools, {
    foreignKey: "schoolname",
    targetKey: "schoolname"
  });
  schoolusers.hasMany(studentappusages, {
    foreignKey: "schooluserid",
    sourceKey: "schooluserid",
  });
  studentappusages.belongsTo(schoolusers, {
      foreignKey: "schooluserid",
  });
  students.hasMany(studentgradesprogress, {
    foreignKey: "studentid",
    sourceKey: "studentid",
  });
  studentgradesprogress.belongsTo(students, {
      foreignKey: "studentid",
  });
  curriculums.hasMany(studentgradesprogress, {
    foreignKey: "curriculumid",
    sourceKey: "curriculumid",
  });
  studentgradesprogress.belongsTo(curriculums, {
      foreignKey: "curriculumid",
  });
  grades.hasMany(studentgradesprogress, {
    foreignKey: "gradeid",
    sourceKey: "gradeid",
  });
  studentgradesprogress.belongsTo(grades, {
    foreignKey: "gradeid",
  });
  students.hasMany(studentlevelsprogress, {
    foreignKey: "studentid",
    sourceKey: "studentid",
  });
  studentlevelsprogress.belongsTo(students, {
      foreignKey: "studentid",
  });
  curriculums.hasMany(studentlevelsprogress, {
    foreignKey: "curid",
    sourceKey: "curriculumid",
  });
  studentlevelsprogress.belongsTo(curriculums, {
      foreignKey: "curid",
  });
  grades.hasMany(studentlevelsprogress, {
    foreignKey: "gradeid",
    sourceKey: "gradeid",
  });
  studentlevelsprogress.belongsTo(grades, {
    foreignKey: "gradeid",
  });
  levels.hasMany(studentlevelsprogress, {
    foreignKey: "levelid",
    sourceKey: "levelid",
  });
  studentlevelsprogress.belongsTo(levels, {
    foreignKey: "levelid",
  });
  students.hasMany(studentlessonsprogress, {
    foreignKey: "studentid",
    sourceKey: "studentid",
  });
  studentlessonsprogress.belongsTo(students, {
      foreignKey: "studentid",
  });
  curriculums.hasMany(studentlessonsprogress, {
    foreignKey: "curid",
    sourceKey: "curriculumid",
  });
  studentlessonsprogress.belongsTo(curriculums, {
      foreignKey: "curid",
  });
  grades.hasMany(studentlessonsprogress, {
    foreignKey: "gradeid",
    sourceKey: "gradeid",
  });
  studentlessonsprogress.belongsTo(grades, {
    foreignKey: "gradeid",
  });
  levels.hasMany(studentlessonsprogress, {
    foreignKey: "levelid",
    sourceKey: "levelid",
  });
  studentlessonsprogress.belongsTo(levels, {
    foreignKey: "levelid",
  });
  lessons.hasMany(studentlessonsprogress, {
    foreignKey: "lessonid",
    sourceKey: "lessonid",
  });
  studentlessonsprogress.belongsTo(lessons, {
    foreignKey: "lessonid",
  });
  curriculums.hasMany(students, {
    foreignKey: "curriculumid",
    sourceKey: "curriculumid",
  });
  students.belongsTo(curriculums, {
    foreignKey: "curriculumid",
  });
  schoolcontributedata.belongsTo(schools, {
    foreignKey: "schoolid",
  });
  schools.hasMany(schoolcontributedata, {
    foreignKey: "schoolid",
    sourceKey: "schoolid",
  });

  setupreportrelationship();

  return {
    curriculumbaseline: curriculumbaseline,
    curriculums: curriculums,
    databuild: databuild,
    documents: documents,
    documenttags: documenttags,
    grades: grades,
    lessonlearnings: lessonlearnings,
    lessonpracticequestions: lessonpracticequestions,
    lessonpractices: lessonpractices,
    lessonquizquestions: lessonquizquestions,
    lessonquizzes: lessonquizzes,
    lessons: lessons,
    levelquizquestions: levelquizquestions,
    levels: levels,
    lmsuseraccess: lmsuseraccess,
    lmsusers: lmsusers,
    questions: questions,
    questiontags: questiontags,
    schoolusers: schoolusers,
    studentprogress: studentprogress,
    studentprogressquestions: studentprogressquestions,
    students: students,
    tokens: tokens,
    rpiuseraccess: rpiuseraccess,
    schools,
    standards,
    roles,
    permissions,
    permissionstitle,
    countries,
    curriculumcountry,
    studentlearningprogress,
    studentgradesprogress,
    studentlevelsprogress,
    studentlessonsprogress,
    studentactives,
    studentpoints,
    logfiles,
  };
}

const setupreportrelationship = () => {
  students.hasMany(studentlessonsprogress, {
    foreignKey: "studentid",
    sourceKey: "studentid",
  });
  studentlessonsprogress.belongsTo(students, {
      foreignKey: "studentid",
  });
  lessons.hasMany(studentlessonsprogress, {
      foreignKey: "lessonid",
      sourceKey: "lessonid",
  });
  studentlessonsprogress.belongsTo(lessons, {
      foreignKey: "lessonid",
  });
  lessonquizzes.hasMany(studentprogress, {
    foreignKey: "studentprogressreferenceid",
    sourceKey: "lessonquizid",
  });
  studentprogress.belongsTo(lessonquizzes, {
      foreignKey: "studentprogressreferenceid",
  });
  students.hasMany(studentprogress, {
      foreignKey: "studentid",
      sourceKey: "studentid",
  });
  studentprogress.belongsTo(students, {
      foreignKey: "studentid",
  });
  schoolusers.hasMany(rpiuseraccess, {
    foreignKey: "userid",
    sourceKey: "schooluserid",
  });
  rpiuseraccess.belongsTo(schoolusers, {
      foreignKey: "userid",
  });
}