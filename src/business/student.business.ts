import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { format, isValid, parse } from "date-fns";
import { Op, QueryTypes } from "sequelize";
import { Transaction, WhereOptions } from "sequelize/types";
import {
  curriculums,
  curriculumsAttributes,
} from "src/models/data-models/curriculums";
import { schools } from "src/models/data-models/school";
import {
  schoolusers,
  schoolusersAttributes,
} from "src/models/data-models/schoolusers";
import { standards } from "src/models/data-models/standard";
import { students, studentsAttributes } from "src/models/data-models/students";
import { IStudentImportFormat } from "src/modules/students/models/studentimport";
import { washingtonGroupColumnsForUpdate } from "src/modules/students/models/washington-group.mapper";
import { WG_DOMAIN_COLUMNS } from "src/models/enums";
import { dbinstance } from "src/services/dbservice";
import {  IPaging } from '../models/IPaging';
import { buildWhere } from '../services/util.service';
import { assertEnrolmentFits, ownerOfSchool } from "./content-owner";
import { withSchoolIds } from "./school-identity";
import { andInOwnedSchools, findOwnedStudent, requireOwnedSchoolByName } from "./school-scope";
import { OrgContext } from "src/decorators/org.decorator";
import { schoolScope } from "./school-scope";
import { extractSchoolFilters, schoolIdsWhere } from "./school-filter";
import { hashPassword } from "src/services/password.service";
import { LmsUserToken } from "src/models/token.model";
import { CountryBusiness } from "./country.business";
import axios from "axios";
import { Config } from "src/config";
import { unionBy } from "lodash";
export class StudentBusiness {
  findbystudentid = (studentid: string) =>
    students.findOne({
      where: { studentid },
    });
  findbyschooluserid = (schooluserid: string) =>
    students.findOne({
      where: { schooluserid },
    });
  // No caller today; kept writing both school columns so a future one cannot
  // insert a learner with a name and no id.
  importstudents = async (newstudents: Array<studentsAttributes>) =>
    students.bulkCreate(await withSchoolIds(newstudents));
  importstudent = async (newstudent: studentsAttributes) =>
    students.create((await withSchoolIds([{ ...newstudent }]))[0]);
  getstudent = (studentid: string) =>
    students.findOne({ where: { studentid } });

  getstudentbyid = (studentid: string) => {
    return students.findOne({ where: { studentid } });
  };
  getstudentbyschooluserid = (schooluserid: string) => {
    return students.findOne({ where: { schooluserid } });
  };

  getAllStudents = async (paging: IPaging, org: OrgContext) => {
    curriculums.hasOne(students, {
      foreignKey: "curriculumid",
      sourceKey: "curriculumid",
    });
    students.belongsTo(curriculums, {
      foreignKey: "curriculumid",
    });

    schoolusers.hasOne(students, {
      foreignKey: "schooluserid",
      sourceKey: "schooluserid",
    });
    students.belongsTo(schoolusers, {
      foreignKey: "schooluserid",
    });

    let studentwhere: WhereOptions<studentsAttributes> = {};
    let curriculumwhere: WhereOptions<curriculumsAttributes> = {};
    let schooluserwhere: WhereOptions<schoolusersAttributes> = {};
    const order = ["schoolname", "studentfirstname"];
    const limit = paging.pagesize || 20;
    let offset = 0;
    if ((paging.pageindex || 1) > 1) {
      offset = limit * ((paging.pageindex || 1) - 1);
    }
    // A search by school name is carried out on the schools and the rows are
    // limited to those schools' ids (see school-filter.ts).
    const { rest: restfilter, schoolids } = await extractSchoolFilters(paging.filter, schoolScope(org));
    studentwhere = {
      ...buildWhere<studentsAttributes>(
        {
          ...paging,
          filter: restfilter.filter(
            (x) =>
              !(
                x.key?.indexOf("schooluser.") !== -1 ||
                x.key?.indexOf("curriculum.") !== -1
              )
          ),
        },
        studentwhere
      ),
      ...schoolIdsWhere(schoolids),
    };
    schooluserwhere = {
      ...buildWhere<schoolusersAttributes>(
        {
          ...paging,
          filter: restfilter
            .filter((x) => x.key?.indexOf("schooluser.") !== -1)
            .map((x) => ({ ...x, key: x.key?.replace("schooluser.", "") })),
        },
        schooluserwhere
      ),
    };
    curriculumwhere = {
      ...buildWhere<curriculumsAttributes>(
        {
          ...paging,
          filter: paging.filter
            ?.filter((x) => x.key?.indexOf("curriculum.") !== -1)
            .map((x) => ({ ...x, key: x.key?.replace("curriculum.", "") })),
        },
        curriculumwhere
      ),
    };
    // Soft-deleted learners drop off the active roster. Their rows and progress
    // history stay in the database and in historical reports; this is the list
    // staff manage enrolment from, so it shows the living roster only.
    // The caller's schools are ANDed on the outside: a filter (which builds its own `Op.and`) cannot replace them.
    studentwhere = await andInOwnedSchools({ ...studentwhere, isdeleted: false }, org);
    const data = await students.findAndCountAll({
      where: studentwhere,
      order,
      limit,
      offset,
      include: [
        {
          model: schoolusers,
          attributes: {
            exclude: [`schooluserpasswordhash`, "schoolname", "schooluserid"],
          },
          where: schooluserwhere,
        },
        {
          model: curriculums,
          where: curriculumwhere,
          attributes: {
            exclude: [
              `curriculumid`,
              "curriculumstatus",
              "curriculumdescription",
              "isdeleted",
            ],
          },
        },
        {
          model: standards,
          as: 'class',
          required: false,
          attributes:[
            'standardname'
          ]
        }
      ],
    });

    const schoolusersdata: Array<string> = data.rows.map(
      (x: any) => x.schooluserid
    );
    const accessdata = await this.getstudentaccess(schoolusersdata);

    const accessdataentries = Object.fromEntries(
      accessdata.map((x: any) => [x.userid, x.logintime])
    );

    const rowsdata = [];
    for await (const student of data.rows) {
      const tempdata = (student as any).get({ plain: true });
      const lastlogin = accessdataentries[tempdata.schooluserid];
      const currs = await curriculums.findAll({
        where: {
          curriculumid: {
            [Op.in]: tempdata.curriculumids ?? []
          }
        },
        attributes: ['curriculumname'],
        raw: true
      });
      rowsdata.push({
        ...tempdata,
        lastlogin: lastlogin ? lastlogin : null,
        schooluser: null,
        ...Object.fromEntries(
          Object.entries(tempdata.schooluser).map((x) => [
            `schooluser.${x[0]}`,
            x[1],
          ])
        ),
        curriculum: null,
        ...Object.fromEntries(
          Object.entries(tempdata.curriculum).map((x) => {
            if(x[0] === 'curriculumname' && currs && currs.length > 0) {
              return [`curriculum.${x[0]}`, currs?.map(c => c.curriculumname)?.join(', ')]
            }
            return [
              `curriculum.${x[0]}`,
              x[1],
            ]
          })
        ),
      });
    }

    return {
      count: data.count,
      rows: rowsdata,
    };
  };

  // `schoolid` is already resolved by the route (see resolveSchoolRef); undefined = every school.
  getStudentsWithFilter = async (userid: string, schoolid: string | undefined, standard: string, teacher: boolean, org: OrgContext) => {
    const where: WhereOptions<studentsAttributes> = {
      "$schooluser.schoolusername$": {
        [Op.like]: `%${userid.trim()}%`
      },
      // Soft-deleted learners drop out of this filter list too.
      isdeleted: false,
    };
    if(schoolid) where.schoolid = schoolid;
    if(standard) where.standard = standard;
    if(!teacher) where.is_teacher_acc = teacher;
    const order = ["created_at"];

    const options: any = {
      where: await andInOwnedSchools(where, org),
      order,
      include: [
        {
          model: schoolusers,
          as: 'schooluser',
          attributes: ['schoolusername']
        }
      ]
    }
    if(!schoolid && !standard) options.limit = 50;

    return await students.findAll(options);
  };

  getStudent = async (studentid: string, org: OrgContext) => {
    // 404 for a learner that is not the caller's, like one that does not exist.
    await findOwnedStudent(org, { studentid });
    curriculums.hasOne(students, {
      foreignKey: "curriculumid",
      sourceKey: "curriculumid",
    });
    students.belongsTo(curriculums, {
      foreignKey: "curriculumid",
    });

    schoolusers.hasOne(students, {
      foreignKey: "schooluserid",
      sourceKey: "schooluserid",
    });
    students.belongsTo(schoolusers, {
      foreignKey: "schooluserid",
    });

    const order = ["schoolname", "studentfirstname"];

    const data = await students.findOne({
      where: {
        studentid,
      },
      order,
      include: [
        {
          model: schoolusers,
          attributes: {
            exclude: [`schooluserpasswordhash`, "schoolname", "schooluserid"],
          },
        },
        {
          model: curriculums,
          attributes: {
            exclude: [
              `curriculumid`,
              "curriculumstatus",
              "curriculumdescription",
              "isdeleted",
            ],
          },
        },
      ],
    });

    const accessdata = await this.getstudentaccess([data?.schooluserid || ""]);

    const accessdataentries = Object.fromEntries(
      accessdata.map((x: any) => [x.userid, x.logintime])
    );
    const lastlogin = accessdataentries[data?.schooluserid || ""];

    return {
      ...data?.get({ plain: true }),
      lastlogin: lastlogin ? lastlogin : null,
    };
  };
  studentExists = async (studentid: string) => {
    const student = await students.count({ where: { studentid } });
    return student > 0;
  };
  createStudents = async (
    studentdata: Array<studentsAttributes>,
    transaction: Transaction
  ) =>
    students.bulkCreate(await withSchoolIds(studentdata, transaction), {
      transaction,
    });

  getstudentcountbyschool = (schoolid: string) =>
    students.count({ where: { schoolid } });

  getstudentcountbystandard = (standard: string) =>
    students.count({ where: { standard } });

  deletestudent = async (
    schooluserid: string,
    deletedby: string,
    transaction: Transaction,
    org: OrgContext,
  ) =>
    students.update(
      {
        isdeleted: true,
        deleted_at: new Date(),
        deleted_by: deletedby,
      },
      {
        // Only a learner of one of the caller's schools.
        where: await andInOwnedSchools({ schooluserid, isdeleted: false }, org, transaction),
        transaction,
      },
    );

  getstudentstats = async (studentid: string, org: OrgContext) => {
    // 404 for a learner that is not the caller's, like one that does not exist.
    await findOwnedStudent(org, { studentid });
    return dbinstance.getdbinstance().query(
      `SELECT 
      ss.*,
      studentprogress.starttime AS lastlogin,
      lessons.lessonname AS currentlessonname,
      lessons.lessonorder AS currentlessonorder,
      lessons.lessonid AS currentlessonid,
      levels.levelid AS currentlevelid,
      levels.levelname AS currentlevelname,
      levels.levelorder AS currentlevelorder,
      grades.gradename AS currentgradename,
      grades.gradeorder AS currentgradeorder,
      grades.gradeid AS currentgradeid
FROM
    students AS ss
        INNER JOIN
    studentprogress ON studentprogress.studentprogressid = (SELECT 
            studentprogress.studentprogressid
        FROM
            studentprogress
                INNER JOIN
            lessonquizzes ON lessonquizzes.lessonquizid = studentprogress.studentprogressreferenceid
                INNER JOIN
            lessons ON lessons.lessonid = lessonquizzes.lessonid
        WHERE
            studentprogress.progresstype = 2
                AND studentprogress.ispass = 1
                AND studentid = ss.studentid
        ORDER BY lessonorder DESC
        LIMIT 1)
        INNER JOIN
    lessonquizzes ON lessonquizzes.lessonquizid = studentprogress.studentprogressreferenceid
        INNER JOIN
    lessons ON lessons.lessonid = lessonquizzes.lessonid
        INNER JOIN
    levels ON levels.levelid = lessons.levelid
        INNER JOIN
    grades ON grades.gradeid = levels.gradeid
WHERE
    ss.studentid = ? LIMIT 1`,
      { type: QueryTypes.SELECT, raw: true, replacements: [studentid] }
    );
  };

  getstudentquizstats = async (studentid: string, org: OrgContext) => {
    // 404 for a learner that is not the caller's, like one that does not exist.
    await findOwnedStudent(org, { studentid });
    return dbinstance.getdbinstance().query(
      `SELECT 
      sp.*,
      lessonquizzes.lessonquizname as lessonquizname,
      lessonquizzes.lessonquizid as lessonquizid,
      lessons.lessonname AS lessonname,
      lessons.lessonorder AS lessonorder,
      lessons.lessonid AS lessonid,
      levels.levelid AS levelid,
      levels.levelname AS levelname,
      levels.levelorder AS levelorder,
      grades.gradename AS gradename,
      grades.gradeorder AS gradeorder,
      grades.gradeid AS gradeid
  FROM
      studentprogress as sp
          INNER JOIN
      lessonquizzes ON lessonquizzes.lessonquizid = sp.studentprogressreferenceid
          INNER JOIN
      lessons ON lessons.lessonid = lessonquizzes.lessonid
          INNER JOIN
      levels ON levels.levelid = lessons.levelid
          INNER JOIN
      grades ON grades.gradeid = levels.gradeid
  WHERE
      studentid = ?
          AND sp.progresstype = 2;`,
      { type: QueryTypes.SELECT, raw: true, replacements: [studentid] }
    );
  };

  getstudentpracticestats = async (studentid: string, org: OrgContext) => {
    // 404 for a learner that is not the caller's, like one that does not exist.
    await findOwnedStudent(org, { studentid });
    return dbinstance.getdbinstance().query(
      `SELECT 
      sp.*,
      lessonpractices.lessonpracticename as lessonpracticename,
      lessonpractices.lessonpracticeid as lessonpracticeid,
      lessons.lessonname AS lessonname,
      lessons.lessonorder AS lessonorder,
      lessons.lessonid AS lessonid,
      levels.levelid AS levelid,
      levels.levelname AS levelname,
      levels.levelorder AS levelorder,
      grades.gradename AS gradename,
      grades.gradeorder AS gradeorder,
      grades.gradeid AS gradeid
  FROM
      studentprogress AS sp
          INNER JOIN
      lessonpractices ON lessonpractices.lessonpracticeid = sp.studentprogressreferenceid
          INNER JOIN
      lessons ON lessons.lessonid = lessonpractices.lessonid
          INNER JOIN
      levels ON levels.levelid = lessons.levelid
          INNER JOIN
      grades ON grades.gradeid = levels.gradeid
  WHERE
      studentid = ?
          AND sp.progresstype = 1;`,
      { type: QueryTypes.SELECT, raw: true, replacements: [studentid] }
    );
  };

  getstudentlevelstats = async (studentid: string, org: OrgContext) => {
    // 404 for a learner that is not the caller's, like one that does not exist.
    await findOwnedStudent(org, { studentid });
    return dbinstance.getdbinstance().query(
      `SELECT 
      sp.*,
      levels.levelid AS levelid,
      levels.levelname AS levelname,
      levels.levelorder AS levelorder,
      grades.gradename AS gradename,
      grades.gradeorder AS gradeorder,
      grades.gradeid AS gradeid
  FROM
      studentprogress AS sp
          INNER JOIN
      levels ON levels.levelid =  sp.studentprogressreferenceid
          INNER JOIN
      grades ON grades.gradeid = levels.gradeid
  WHERE
     studentid = ? AND
          sp.progresstype = 3;`,
      { type: QueryTypes.SELECT, raw: true, replacements: [studentid] }
    );
  };

  getstudentaccess = async (students: Array<string>) => {
    // An empty list would build `userid in ()`, which is a MySQL syntax error.
    // The student list is empty on any install that has no students yet, so the
    // Students page fails before it can render its empty state.
    if (students.length === 0) {
      return [];
    }

    const placeholders = students.map(() => "?").join(",");
    const data1 = await dbinstance
      .getdbinstance()
      .query(
        `SELECT max(logintime) as logintime, userid FROM rpiuseraccess where userid in (${placeholders}) group by userid`,
        { type: QueryTypes.SELECT, raw: true, replacements: students }
      );

    // Login times held on the Pi cloud are supplementary: the local rows above
    // already answer the query. Deployments without a Pi layer leave RPI_CLOUD
    // unset, which leaves it as the "your-cloud-endpoint" placeholder and makes
    // this call throw, so a whole page of students would fail to load over an
    // optional enrichment. Degrade to the local rows instead.
    let cloudAccess: Array<unknown> = [];
    try {
      const response = await axios.post(
        `${Config.fortyk.api.rpi.cloud}/student/logintime`,
        students,
        {
          headers: {
            Authorization: Config.fortyk.api.serversynckey,
          },
        }
      );
      cloudAccess = response?.data?.data ?? [];
    } catch (error) {
      console.warn(
        `Could not read student login times from ${Config.fortyk.api.rpi.cloud}: ${
          (error as Error).message
        }. Falling back to locally recorded login times.`
      );
    }

    return unionBy(cloudAccess, data1, 'userid');
  }

  migrateStandards = async () => {
    const allstandards = await standards.findAll({
      attributes: ['standardid','standardname', 'schoolid'],
      where: { isdeleted: false, schoolid: {
        [Op.ne]: null as any
      }}
    });
    const allstudents = await students.findAll({
      include: [
        {
          model: schools,
          required: true
        }
      ]
    })
    const transaction = await dbinstance.getdbinstance().transaction();
    try {
      for await (const student of allstudents) {
        const standard = allstandards.find(standard => standard.standardname === student.standard && student.school?.schoolid === standard.schoolid);
        if(standard) {
          student.standard = standard.standardid;
          await student.save({fields: ['standard'], transaction});
        }
      }
      await transaction.commit();
    } catch (e) {
        await transaction.rollback();
        throw e;
    }
    return allstandards;
  }

  // `schoolid` is already resolved by the route (an unknown school was a 404 there).
  getAllStudentsForEdit = async (countryid: string = '', schoolid: string = '', studentid: string = '', org: OrgContext) => {
    const countryexists = await new CountryBusiness().getcountrybyid(
      countryid
    );
    if(countryid && !countryexists) throw new ApiError(ErrorCode.NOT_FOUND, "That country doesn't exist.");
    const where: WhereOptions<studentsAttributes> = {};
    where.isactive = 1;
    // Soft-deleted learners are excluded here too, not just from getAllStudents:
    // isactive is untouched by a delete, so without this they reappear in the
    // edit list. History/reports still retain them.
    where.isdeleted = false;
    if(countryid) where['$school.countryid$'] = countryid;
    if(schoolid) where.schoolid = schoolid;
    if(studentid) where.studentid = studentid;
    const stds = await students.findAll({
      where: await andInOwnedSchools(where, org),
      attributes: [
        'studentid',
        'studentfirstname',
        'studentlastname',
        'familyname',
        'mothername',
        'fathername',
        'dateofbirth',
        'genderid',
        ...WG_DOMAIN_COLUMNS,
        'city',
        'country',
        'state',
        'dateofjoin',
        'standard',
        'schoolname',
        'schooltype',
        'type',
        'isactive',
        'is_teacher_acc',
        'curriculumids',
      ],
      include: [
        {
          model: schoolusers,
          as: 'schooluser',
          required: true,
          attributes: ['schooluserid', 'schoolusername']
        },
        {
          model: standards,
          as: 'class',
          required: false,
          attributes: ['standardid', 'standardname']
        },
        {
          model: schools,
          required: true,
          attributes: ['countryid'],
        }
      ]
    });
    const studentsForEdit: Array<IStudentImportFormat> = [];
    for await (const x of stds) {
      const currs = await curriculums.findAll({ 
        where: {
          curriculumid: {
            [Op.in]: x.curriculumids ?? []
          }
        }
      });
      let currnames = '';
      currs?.forEach(cur => {
        if(currnames) currnames += '/' + cur.curriculumname;
        else currnames = cur.curriculumname;
      })
      studentsForEdit.push({
        studentid: x.studentid,
        schooluserid: x.schooluser.schooluserid,
        schoolusername: x.schooluser.schoolusername ?? '',
        schoolname: x.schoolname ?? '',
        curriculums: currnames,
        standard: x.class?.standardname ?? '',
        studentfirstname: x.studentfirstname,
        studentlastname: x.studentlastname ?? '',
        familyname: x.familyname ?? '',
        mothername: x.mothername ?? '',
        fathername: x.fathername ?? '',
        contact: x.contact ?? '',
        genderid: (x.genderid).toString() ?? '',
        wg_seeing: x.wg_seeing?.toString() ?? '',
        wg_hearing: x.wg_hearing?.toString() ?? '',
        wg_walking: x.wg_walking?.toString() ?? '',
        wg_remembering: x.wg_remembering?.toString() ?? '',
        wg_selfcare: x.wg_selfcare?.toString() ?? '',
        wg_communicating: x.wg_communicating?.toString() ?? '',
        dateofbirth: x.dateofbirth ? format(x.dateofbirth, 'dd-MM-yyyy') : '',
        dateofjoin: x.dateofjoin ? format(x.dateofjoin, 'dd-MM-yyyy') : '',
        schooltype: x.schooltype ?? '',
        city: x.city ?? "",
        country: x.country ?? "",
        state: x.state ?? "",
        type: x.type ?? '',
        isactive: x.isactive ? 1 : 0,
        schooluserpasswordhash: '',
        is_teacher_acc: (x.is_teacher_acc === true) ? '1' : ''
      })
    }
    return studentsForEdit;
  }

  updateStudents = async (
    studentdata: Array<IStudentImportFormat>,
    lmsuser: LmsUserToken,
    transaction: Transaction,
    org: OrgContext,
  ) => {
    // Before any row is written: every learner a row names, and every school it names, must be the caller's (else 404 and
    // nothing is written), and the curriculums a row names must have the owner of the school it names. (A curriculum that
    // is not found is left to the row's own checks below, which report it.)
    for (const [rowindex, x] of studentdata.entries()) {
      await findOwnedStudent(org, { studentid: x.studentid }, transaction);
      const school = await requireOwnedSchoolByName(org, x.schoolname, transaction, `students.${rowindex}.schoolname`);
      const named = await curriculums.findAll({
        where: { curriculumname: { [Op.in]: x.curriculums.split('/') } },
        attributes: ['curriculumid'],
        raw: true,
      });
      await assertEnrolmentFits(await ownerOfSchool(school.schoolid, transaction), named.map((c) => c.curriculumid), transaction);
    }
    for (const [rowindex, x] of studentdata.entries()) {
      const student = await students.findOne({
        where: await andInOwnedSchools({ studentid: x.studentid }, org, transaction),
        include: [
          {
            model: schoolusers,
            as: 'schooluser',
            required: true,
            where: { schooluserid: x.schooluserid, schoolusername: x.schoolusername }
          }
        ]
      });
      if(!student) throw new ApiError(ErrorCode.NOT_FOUND, "That student doesn't exist.");
      // The school the row now names, resolved in this transaction. A learner
      // moved to another school gets that school's id together with its OWN
      // stored name (not the text in the file); a name that matches no school
      // fails the whole update.
      // The error names the row (`students.<i>.schoolname`), so a batch that fails says which learner.
      const school = await requireOwnedSchoolByName(org, x.schoolname, transaction, `students.${rowindex}.schoolname`);
      const standard = await standards.findOne({
        where: { standardname: x.standard },
        attributes: ['standardid','standardname'],
        include: [
          {
            model: schools,
            attributes: [],
            required: true,
            where: { schoolid: school.schoolid }
          }
        ]
      });
      if(!standard && parseInt(x.is_teacher_acc ?? '0') !== 1) throw new ApiError(ErrorCode.INVALID_INPUT, "That school or class doesn't exist.", { fields: [{ field: 'standard', message: "That school or class doesn't exist." }] });
      const doj = x.dateofjoin;
      const dob = x.dateofbirth;
      const currs = await curriculums.findAll({
        where: {
          curriculumname: {
            [Op.in]: x.curriculums.split('/')
          }
        },
        attributes: ['curriculumid'],
        raw: true,
      });
      if(!currs || currs.length !== x.curriculums.split('/').length) throw new ApiError(ErrorCode.INVALID_INPUT, "One or more of those curriculums doesn't exist.", { fields: [{ field: 'curriculums', message: "One or more of those curriculums doesn't exist." }] });
      await students.update(
        {
          city: x.city,
          country: x.country,
          genderid: parseInt(x.genderid),
          ...washingtonGroupColumnsForUpdate(x, student),
          isactive: 1,
          state: x.state,
          studentfirstname: x.studentfirstname,
          contact: x.contact,
          dateofbirth: isValid(
            parse(dob, "dd-MM-yyyy", new Date())
          )
            ? parse(dob, "dd-MM-yyyy", new Date())
            : undefined,
          dateofjoin: isValid(parse(doj, "dd-MM-yyyy", new Date()))
            ? parse(doj, "dd-MM-yyyy", new Date())
            : new Date(),
          familyname: x.familyname,
          fathername: x.fathername,
          mothername: x.mothername,
          schoolname: school.schoolname,
          schoolid: school.schoolid,
          schooltype: x.schooltype,
          standard: standard?.standardid,
          studentlastname: x.studentlastname,
          type: x.type,
          updated_at: new Date(),
          updated_by: lmsuser.lmsuserid,
          is_teacher_acc: (parseInt(x.is_teacher_acc ?? '0') === 1) ? true : false,
          curriculumids: currs.map(cur => cur.curriculumid)
        },
        {
          where: { studentid: student.studentid },
          transaction
        },
      );
      const user = await schoolusers.findOne({
        where: { schooluserid: student.schooluser.schooluserid }
      });
      if(!user) {
        throw new ApiError(ErrorCode.NOT_FOUND, "That student's account doesn't exist.");
      } else {
        // update school name and id together
        user.schoolname = school.schoolname;
        user.schoolid = school.schoolid;
        await user.save({fields: ['schoolname', 'schoolid'], transaction});
      }
      // change user id
      if(
        x.schoolusername && 
        x.schoolusername !== '' &&
        student.schooluser.schoolusername !== x.schoolusername
      ) {
        user.schoolusername = x.schoolusername;
        await user.save({fields: ['schoolusername'], transaction});
      }
      // change password
      if(x.schooluserpasswordhash) {
        user.schooluserpasswordhash = hashPassword(x.schooluserpasswordhash);
        await user.save({fields: ['schooluserpasswordhash'], transaction});
      }
      // removed student
      // if(x.isactive === 0 && x.isactive !== studentactive) {
      //   user.schoolusername = user.schoolusername + '_deleted'; 
      //   await user.save({fields: ['schoolusername'], transaction});
      // }
    }
    return;
  };

  migrateSubjectCurriculum = async () => {
    const allstudents = await students.findAll({
      where: {
        curriculumids: { [Op.is]: null as any }
      }
    });
    const transaction = await dbinstance.getdbinstance().transaction();
    try {
      for await (const student of allstudents) {
        if(student.curriculumid) {
          student.curriculumids = [student.curriculumid];
          await student.save({fields: ['curriculumids'], transaction});
        }
      }
      await transaction.commit();
    } catch (e) {
        await transaction.rollback();
        throw e;
    }
  }
}
