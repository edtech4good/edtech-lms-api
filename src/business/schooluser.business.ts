import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { hashPassword } from "src/services/password.service";
import { Op, Transaction, WhereOptions } from "sequelize";
import {
  schoolusers,
  schoolusersAttributes,
} from "src/models/data-models/schoolusers";
import { students, studentsAttributes } from "src/models/data-models/students";
import { OrgContext } from "src/decorators/org.decorator";
import { withSchoolIds } from "./school-identity";
import { andInOwnedSchools } from "./school-scope";
import { studentApiAttributes, studentApiRosterAttributes } from "./student-api-payload";

/** The rows of a roster push that names its school keep their `schoolid` (see student-api-payload.ts). */
export interface RosterOptions {
  withSchoolId?: boolean;
}
const rosterAttributes = (options: RosterOptions) => (options.withSchoolId === true ? studentApiRosterAttributes : studentApiAttributes);

export class SchoolUserBusiness {
  // No caller today; kept writing both school columns (see school-identity.ts).
  importschooluser = async (newschooluser: schoolusersAttributes) => {
    const [withId] = await withSchoolIds([{ ...newschooluser }]);
    const newschoolusersresult = await schoolusers.create(withId);
    return {
      ...newschooluser,
      schooluser: newschoolusersresult.get({ plain: true }),
    };
  };
  // Feeds the student sync to the student API (`/import/students`). Load-bearing
  // for soft delete: it must keep returning soft-deleted schoolusers (it filters
  // `schooluserstatus`, NOT `isdeleted`) so `isdeleted: true` reaches the student
  // API's schoolusers and its login refuses them (edtech-lms-rpi-api#8). If you
  // ever add an `isdeleted: false` filter here — or make the soft delete also
  // clear `schooluserstatus` — deleted learners drop out of this export, their
  // `isdeleted` never syncs, and the tablet login-block silently stops working.
  getschooluserbyschoolid = async (schoolid: string, online: boolean = false, options: RosterOptions = {}) => {
    schoolusers.hasOne(students, {
      foreignKey: "schooluserid",
      sourceKey: "schooluserid",
    });
    students.belongsTo(schoolusers, {
      foreignKey: "schooluserid",
    });

    const schoolwhere: WhereOptions<studentsAttributes> = {};
    if(!online) {
      schoolwhere.is_teacher_acc = false;
    }
    schoolwhere.schoolid = schoolid;

    return schoolusers.findAll({
      where: {
        schooluserstatus: true,
      },
      attributes: rosterAttributes(options),
      include: [
        {
          where: schoolwhere,
          model: students,
          attributes: rosterAttributes(options),
        },
      ],
      // The rows used to come out in the order MySQL scanned `students` (by learner
      // id), because the filter had no index to use. With the filter on the indexed
      // `schoolid` the plan, and so the order, changed. The export is a payload for
      // another service, so its order is pinned to what it always was.
      order: [[students, "studentid", "ASC"]],
    });
  };

  getschooluserbyid = async (schooluserid: Array<string>, options: RosterOptions = {}) => {
    schoolusers.hasOne(students, {
      foreignKey: "schooluserid",
      sourceKey: "schooluserid",
    });
    students.belongsTo(schoolusers, {
      foreignKey: "schooluserid",
    });

    return schoolusers.findAll({
      where: {
        schooluserstatus: true,
        schooluserid: {
          [Op.in]: schooluserid,
        },
      },
      attributes: rosterAttributes(options),
      include: [
        {
          model: students,
          attributes: rosterAttributes(options),
        },
      ],
    });
  };

  getschoolteachersbyid = async (schooluserid: Array<string>, options: RosterOptions = {}) => {
    return schoolusers.findAll({
      where: {
        schooluserstatus: true,
        schooluserid: {
          [Op.in]: schooluserid,
        },
      },
      attributes: rosterAttributes(options),
    });
  };

  getuser = async (schooluserid: string) => {
    const _user = await schoolusers.findOne({ where: { schooluserid } });
    if (_user) {
      return _user.get({ plain: true });
    }
    // NOT_FOUND, not SIGN_IN_REQUIRED: the id here is often admin-supplied
    // (EditUser/DeleteUser validators), and a 401 would sign the ADMIN out
    // of lms-ui for editing a user that no longer exists. Token-derived
    // callers (auth.business, auth.controller) map this to SIGN_IN_REQUIRED.
    throw new ApiError(ErrorCode.NOT_FOUND, "That user doesn't exist.");
  };

  getuserbyid = (schooluserid: string) =>
    schoolusers.findOne({ where: { schooluserid } });

  getuserbyname = (schoolusername: string) =>
    schoolusers.findOne({ where: { schoolusername } });

  sanitizeUser = (user: any) => ({
    ...user,
    _id: null,
    passwordhash: null,
  });

  // Rows that carry only a `schoolname` get their `schoolid` resolved here,
  // inside the caller's transaction (see school-identity.ts); rows that already
  // carry both are stored as given.
  createSchoolUser = async (
    schoolusersdata: Array<schoolusersAttributes>,
    transaction: Transaction
  ) =>
    schoolusers.bulkCreate(
      (await withSchoolIds(schoolusersdata, transaction)).map((x) => ({
        ...x,
        schooluserpasswordhash: hashPassword(x.schooluserpasswordhash),
      })),
      {
        transaction,
      }
    );

  schoolUserExists = (schooluserdata: Array<string>) =>
    schoolusers.findAll({
      where: {
        schoolusername: {
          [Op.in]: schooluserdata.map((x) => x.trim().toLowerCase()),
        },
      },
      attributes: {
        exclude: [
          "schooluserid",
          "schooluserstatus",
          "schoolname",
          "isdisabled",
          "schooluserpasswordhash",
          "schooluserrole",
        ],
      },
    });

  // Soft delete keeps the row, so its `schoolusername` (a UNIQUE column) stays
  // occupied — that exact handle cannot be re-enrolled while the deleted row
  // exists. Deliberate: `schoolUserExists` rejects the reused name cleanly at
  // create time (not a DB error), and freeing it would mean renaming the row,
  // which corrupts the learner history this soft delete exists to keep.
  // Learner usernames are auto-generated, so reuse pressure is near zero.
  deleteschooluser = async (
    schooluserid: string,
    deletedby: string,
    transaction: Transaction,
    org: OrgContext,
  ) =>
    schoolusers.update(
      {
        isdeleted: true,
        deleted_at: new Date(),
        deleted_by: deletedby,
      },
      {
        // Only a login of one of the caller's schools.
        where: await andInOwnedSchools({ schooluserid, isdeleted: false }, org, transaction),
        transaction,
      },
    );
}
