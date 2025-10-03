import { BadRequestException } from "@nestjs/common";
import { Op, Transaction } from "sequelize";
import { logfiles } from "src/models/data-models/logfiles";
import { rpiuseraccess } from "src/models/data-models/rpiuseraccess";
import { schoolusers } from "src/models/data-models/schoolusers";
import { studentactives } from "src/models/data-models/studentactives";
import { studentappusages } from "src/models/data-models/studentappusage";
import { studentgradesprogress } from "src/models/data-models/studentgradesprogress";
import { studentlearningprogress } from "src/models/data-models/studentlearningprogress";
import { studentlessonsprogress } from "src/models/data-models/studentlessonprogress";
import { studentlevelsprogress } from "src/models/data-models/studentlevelsprogress";
import { studentpoints } from "src/models/data-models/studentpoints";
import { studentprogress } from "src/models/data-models/studentprogress";
import { studentprogressquestions } from "src/models/data-models/studentprogressquestions";
import { syncs } from "src/models/data-models/syncrecord";
import { LmsUserToken } from "src/models/token.model";
import { AWSService } from "src/services/aws.service";
import { validateFile } from "src/services/util.service";
import { File } from "unzipper";
import { v4 as uuidv4 } from "uuid";

export interface studentprogresslog {
  studentactives: Array<studentactives>;
  studentlearningprogress: Array<studentlearningprogress>;
  studentgradesprogress: Array<studentgradesprogress>;
  studentlevelsprogress: Array<studentlevelsprogress>;
  studentlessonsprogress: Array<studentlessonsprogress>;
  studentpoints: Array<studentpoints>;
  studentappusages: Array<studentappusages>;
}

export interface Istudentprogress {
  log?: {
    access?: any;
    result?: any;
    progress?: studentprogresslog;
  };
}

export class LogBusiness {
  private _transaction: Transaction;
  constructor(transaction: Transaction) {
    this._transaction = transaction;
  }
  importaccesslog = (access: Array<rpiuseraccess>) =>
    rpiuseraccess.bulkCreate(access, {
      transaction: this._transaction,
      updateOnDuplicate: ["userid", "logintime", "ipaddress", "logouttime", "timespent", "status"],
    });
  importprogresslog = (progress: Array<studentprogress>) =>
    studentprogress.bulkCreate(progress, {
      transaction: this._transaction,
      updateOnDuplicate: [
        "studentid",
        "ispass",
        "studentprogressreferenceid",
        "starttime",
        "endtime",
        "progresstype",
        "marks",
        "points",
        "resultpercentage",
        "fullpoints",
        "scores"
      ],
    });
  importstudentprogresslog = async (progress: studentprogresslog) => {
    await studentactives.bulkCreate(progress.studentactives, {
      transaction: this._transaction,
      updateOnDuplicate: [
        "studentid",
        "referenceid",
        "referencetype",
        "created_at"
      ],
    });
    await studentlearningprogress.bulkCreate(progress.studentlearningprogress, {
      transaction: this._transaction,
      updateOnDuplicate: [
        "studentid",
        "content_length",
        "lastupdated",
        "lessonlearningid",
        "points",
        "progress",
        "progress_percentage",
        "userid",
        "viewed"
      ],
    });
    await studentgradesprogress.bulkCreate(progress.studentgradesprogress, {
      transaction: this._transaction,
      updateOnDuplicate: [
        "studentid",
        "completed",
        "curriculumid",
        "gradeid",
        "lastupdated",
        "points",
        "progress",
        "scores",
      ],
    });
    await studentlevelsprogress.bulkCreate(progress.studentlevelsprogress, {
      transaction: this._transaction,
      updateOnDuplicate: [
        "studentid",
        "completed",
        "curid",
        "gradeid",
        "lastupdated",
        "levelid",
        "points",
        "progress",
        "scores",
      ],
    });
    await studentlessonsprogress.bulkCreate(progress.studentlessonsprogress, {
      transaction: this._transaction,
      updateOnDuplicate: [
        "studentid",
        "completed",
        "curid",
        "gradeid",
        "lastupdated",
        "levelid",
        "points",
        "progress",
        "lessonid",
        "scores",
      ],
    });
    await studentpoints.bulkCreate(progress.studentpoints, {
      transaction: this._transaction,
      updateOnDuplicate: [
        "studentid",
        "levelid",
        "lessonid",
        "totalgradepoints",
        "gradepoints",
        "totallevelpoints",
        "levelpoints",
        "lessonpoints",
        "levelquizscores",
        "learningpoints",
        "practicepoints",
        "quizpoints",
        "totallearningpoints",
        "totalpracticepoints",
        "totalquizpoints",
        "scores",
        "created_at",
      ],
    });
    await studentappusages.bulkCreate(progress.studentappusages, {
      transaction: this._transaction,
      updateOnDuplicate: [
        "schooluserid",
        "time_spent",
        "last_updated",
        "created_at",
      ],
    });
  }
  importprogressquestionlog = (
    progressquestions: Array<studentprogressquestions>
  ) =>
    studentprogressquestions.bulkCreate(progressquestions, {
      transaction: this._transaction,
      updateOnDuplicate: [
        "studentprogressid",
        "tries",
        "iscorrect",
        "referencequestionid",
      ],
    });
  clearuseraccesslogs = async (
    rpiuseraccessid: Array<string>
  ): Promise<boolean> => {
    if (rpiuseraccessid.length > 0) {
      await rpiuseraccess.destroy({
        where: {
          rpiuseraccessid: { [Op.in]: rpiuseraccessid },
        },
      });
    }
    return true;
  };
  clearstudentprogresslogs = async (
    studentprogressid: Array<string>
  ): Promise<boolean> => {
    if (studentprogressid.length > 0) {
      await studentprogressquestions.destroy({
        where: {
          studentprogressid: { [Op.in]: studentprogressid },
        },
      });

      await studentprogress.destroy({
        where: {
          studentprogressid: { [Op.in]: studentprogressid },
        },
      });
    }
    return true;
  };

  importstudentsprogress = async(logdata: Istudentprogress) => {
    if (
      logdata &&
      logdata.log &&
      logdata.log?.access &&
      logdata.log?.result &&
      logdata.log?.progress
    ) {
      if (logdata.log.access && logdata.log.access.length > 0) {
        /* await logbusiness.clearuseraccesslogs(
          logdata.log.access.map((x: any) => x.useraccessid)
        );*/
        await this.importaccesslog(logdata.log.access);
      }
      if (logdata.log.result && logdata.log.result.length > 0) {
        /*await logbusiness.clearstudentprogresslogs(
          logdata.log.result.map((x: any) => x.studentprogressid)
        );*/
        await this.importprogresslog(logdata.log.result);

        await this.importprogressquestionlog(
          logdata.log.result
            .map((x: any) => x.studentprogressquestions || [])
            .flat()
        );
      }
      if (logdata.log.progress) {
        await this.importstudentprogresslog(logdata.log.progress);
      }
    }
    return;
  }

  createstudentaccesslogfiles = async (file: File, parentfileid: string) => {
    validateFile(file);
    await logfiles.create({
      logfileid: uuidv4(),
      logfilename: file.path,
      parentfileid,
      type: 1
    }, {transaction: this._transaction})
  }

  uploadZipFileToAWSS3 = async (file: Express.Multer.File, customFilename: string, uuid: string) => {
    const s3meta = await AWSService.uploadS3(
      customFilename,
      file.buffer
    );
    return await logfiles.create({
      logfileid: uuid,
      logfilemeta: s3meta,
      logfilename: customFilename,
      type: 2
    }, {transaction: this._transaction})
  }

  recordSyncActivity = async (user: LmsUserToken, filename: string, offlineonline: boolean) => {
    if(!user.schooluserid) throw new BadRequestException('Please login as a teacher!');
    const teacher = await schoolusers.findOne({
      where: { schooluserid: user.schooluserid}
    });
    if(!teacher) throw new BadRequestException('Teacher does not exist!');
    await syncs.create({
      syncid: uuidv4(),
      filename,
      type: 1,
      offlineonline,
      created_by: teacher.schooluserid
    }, { transaction: this._transaction})
    return;
  }
}
