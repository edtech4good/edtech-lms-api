import { BadRequestException } from "@nestjs/common";
import md5 from "md5";
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
        schooluserpasswordhash: md5(x.schooluserpasswordhash),
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

  deleteschooluser = (schooluserid: string, transaction: Transaction) =>
    schoolusers.destroy({
      where: {
        schooluserid,
      },
      transaction,
    });

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
