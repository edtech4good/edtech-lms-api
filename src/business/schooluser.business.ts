import { BadRequestException } from "@nestjs/common";
import { hashPassword } from "src/services/password.service";
import { Op, Transaction, WhereOptions } from "sequelize";
import {
  schoolusers,
  schoolusersAttributes,
} from "src/models/data-models/schoolusers";
import { students, studentsAttributes } from "src/models/data-models/students";

export class SchoolUserBusiness {
  importschooluser = async (newschooluser: schoolusers) => {
    const newschoolusersresult = await schoolusers.create({ ...newschooluser });
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
  getschooluserbyschoolname = async (schoolname: string, online: boolean = false) => {
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
    schoolwhere.schoolname = schoolname;

    return schoolusers.findAll({
      where: {
        schooluserstatus: true,
      },
      attributes: {
        exclude: [],
      },
      include: [
        {
          where: schoolwhere,
          model: students,
        },
      ],
    });
  };

  getschooluserbyid = async (schooluserid: Array<string>) => {
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
      attributes: {
        exclude: [],
      },
      include: [
        {
          model: students,
        },
      ],
    });
  };

  getschoolteachersbyid = async (schooluserid: Array<string>) => {
    return schoolusers.findAll({
      where: {
        schooluserstatus: true,
        schooluserid: {
          [Op.in]: schooluserid,
        },
      },
    });
  };

  getuser = async (schooluserid: string) => {
    const _user = await schoolusers.findOne({ where: { schooluserid } });
    if (_user) {
      return _user.get({ plain: true });
    }
    throw new BadRequestException("Please authenticate");
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

  createSchoolUser = (
    schoolusersdata: Array<schoolusersAttributes>,
    transaction: Transaction
  ) =>
    schoolusers.bulkCreate(
      schoolusersdata.map((x) => ({
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
  deleteschooluser = (
    schooluserid: string,
    deletedby: string,
    transaction: Transaction,
  ) =>
    schoolusers.update(
      {
        isdeleted: true,
        deleted_at: new Date(),
        deleted_by: deletedby,
      },
      {
        where: {
          schooluserid,
          isdeleted: false,
        },
        transaction,
      },
    );

  getschoolusers = async () => {
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
      },
      attributes: {
        exclude: [],
      },
      include: [
        {
          model: students,
          required: false
        },
      ],
    });
  };
}
