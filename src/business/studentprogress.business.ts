import { schoolusers, schoolusersAttributes } from "src/models/data-models/schoolusers";
import {
  studentgradesprogress,
  studentgradesprogressAttributes,
} from "src/models/data-models/studentgradesprogress";
import {
  studentlearningprogress,
  studentlearningprogressAttributes,
} from "src/models/data-models/studentlearningprogress";
import {
  studentlessonsprogress,
  studentlessonsprogressAttributes,
} from "src/models/data-models/studentlessonprogress";
import {
  studentlevelsprogress,
  studentlevelsprogressAttributes,
} from "src/models/data-models/studentlevelsprogress";
import {
  studentprogress,
  studentprogressAttributes,
} from "src/models/data-models/studentprogress";

export interface exportpayload {
  studentusers: schoolusersAttributes[];
  studentprogresses: studentpointsprogress;
}

export interface studentpointsprogress {
  studentprogress: studentprogressAttributes[];
  studentlearningprogress: studentlearningprogressAttributes[];
  studentgradesprogress: studentgradesprogressAttributes[];
  studentlevelsprogress: studentlevelsprogressAttributes[];
  studentlessonsprogress: studentlessonsprogressAttributes[];
}

export class StudentProgress {
  getstudentprogress = async (schoolusers: schoolusers[]) => {
    const stps: studentpointsprogress = {
      studentprogress: [],
      studentlearningprogress: [],
      studentgradesprogress: [],
      studentlevelsprogress: [],
      studentlessonsprogress: [],
    };
    for await (const schooluser of schoolusers) {
      if (schooluser.student) {
        const student = schooluser.student;
        const sp = (
          await studentprogress.findAll({
            where: {
              studentid: student.studentid,
            },
          })
        ).map((x) => ({
          ...x.get({ plain: true }),
        }));
        const stlp = (
          await studentlearningprogress.findAll({
            where: {
              studentid: student.studentid,
            },
          })
        ).map((x) => ({
          ...x.get({ plain: true }),
        }));
        const stgp = (
          await studentgradesprogress.findAll({
            where: {
              studentid: student.studentid,
            },
          })
        ).map((x) => ({
          ...x.get({ plain: true }),
        }));
        const stlvp = (
          await studentlevelsprogress.findAll({
            where: {
              studentid: student.studentid,
            },
          })
        ).map((x) => ({
          ...x.get({ plain: true }),
        }));
        const stlsp = (
          await studentlessonsprogress.findAll({
            where: {
              studentid: student.studentid,
            },
          })
        ).map((x) => ({
          ...x.get({ plain: true }),
        }));
        stps.studentprogress = [...stps.studentprogress, ...sp];
        stps.studentlearningprogress = [
          ...stps.studentlearningprogress,
          ...stlp,
        ];
        stps.studentgradesprogress = [...stps.studentgradesprogress, ...stgp];
        stps.studentlevelsprogress = [...stps.studentlevelsprogress, ...stlvp];
        stps.studentlessonsprogress = [
          ...stps.studentlessonsprogress,
          ...stlsp,
        ];
      }
    }
    return stps;
  };
}
