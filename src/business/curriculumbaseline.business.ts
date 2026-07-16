import { Op, WhereOptions } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import {
  curriculumbaseline,
  curriculumbaselineAttributes,
  schools,
  schoolusers,
  studentprogress,
  students,
} from "../models/data-models/init-models";
import { CurriculumBusiness } from "./curriculum.business";
import { LmsUserToken } from "src/models/token.model";
import { BaselineQuestionBusiness } from "./baslinequestion.business";
import { baselinequestion, baselinequestionAttributes } from "src/models/data-models/baselinequestion";
import { IStudentBaselineResult } from "src/modules/curriculumbaseline/models/StudentResult";
export class CurriculumBaseLineBusiness {
  getCurriculumBaseLines = (old: boolean = false) => {
    const option: any = {};
    const where: WhereOptions<curriculumbaselineAttributes> = {
      isdeleted: false,
    };
    if(old) {
      where.created_by = null;
      option.attributes = ['curriculumbaselineid', 'curriculumid', 'baselineid'];
    }
    option.where = where;
    return curriculumbaseline.findAll(option);
  };

  getCurriculumBaseLineByID = (curriculumbaselineid: string) => {
    const where: WhereOptions<curriculumbaselineAttributes> = {
      curriculumbaselineid,
      isdeleted: false,
    };
    return curriculumbaseline.findOne({ where });
  };

  getBaselineQuestionExits = async (curriculumbaselineid: string) => {
    const where: WhereOptions<baselinequestionAttributes> = {
      curriculumbaselineid,
      isdeleted: false,
    }
    const temp = await baselinequestion.count({where});
    return temp > 0;
  }

  getCurriculumBaseLineNameExits = async (curriculumbaselineid: string, baselinename: string,baselinetype: number) => {
    const where: WhereOptions<curriculumbaselineAttributes> = {
      baselinetype,
      baselinename,
      isdeleted: false,
    };
    if ((curriculumbaselineid ?? "").trim().length > 0) {
      where.curriculumbaselineid = {
        [Op.not]: curriculumbaselineid,
      };
    }
    const tempdt = await curriculumbaseline.count({ where });
    return tempdt > 0;

  };

  getCurriculumBaseLineValidationYear = async (
    curriculumid: string,
    baselineid: string,
    baselinetype: number,
  ) => {
    const where: WhereOptions<curriculumbaselineAttributes> = {
      curriculumid,
      baselineid,
      isdeleted: false,
    };
    const curs = await curriculumbaseline.findAll({ 
      where: where,
      limit:3,
      order: [['created_at','DESC']]
    });
    if(curs.length > 0){
      for(const tempcurs of curs){
      const createTime = new Date(tempcurs?.created_at ?? '');
      const createDate = new Intl.DateTimeFormat("en-US",{year: "numeric",}).format(createTime);
      const currentTime = new Date();
      const currentDate = new Intl.DateTimeFormat("en-US", {year: "numeric",}).format(currentTime);
        if(currentDate === createDate){
          if(tempcurs.baselinetype === baselinetype){
            return true;
          }
        }else{
          return false;
        }
      }
    }else{
      return false;
    }
  };

  createCurriculumBaseLine = async (
    curriculumbaselinedata: curriculumbaselineAttributes,
    user: LmsUserToken
  ) => {
    curriculumbaselinedata.curriculumbaselineid = uuidv4();
    curriculumbaselinedata.baselinestatus = false;
    curriculumbaselinedata.isdeleted = false;
    curriculumbaselinedata.created_at = new Date();
    curriculumbaselinedata.created_by = user.lmsuserid;
    return await curriculumbaseline.create(curriculumbaselinedata);
  }
  // curriculumbaseline.create({
  //   ...curriculumbaselinedata,
  //   curriculumbaselineid: uuidv4(),
  // });
  updateCurriculumBaseLine = async (
    curriculumbaseline: curriculumbaselineAttributes,
    user: LmsUserToken
  ) => {
    const tempCurriculumbaseline = await this.getCurriculumBaseLineByID(curriculumbaseline.curriculumbaselineid)
    if(tempCurriculumbaseline){
      tempCurriculumbaseline.curriculumid = curriculumbaseline.curriculumid;
      tempCurriculumbaseline.baselineid = curriculumbaseline.baselineid;
      tempCurriculumbaseline.baselinename = curriculumbaseline.baselinename;
      tempCurriculumbaseline.baselinetype = curriculumbaseline.baselinetype;
      tempCurriculumbaseline.startdate = curriculumbaseline.startdate;
      tempCurriculumbaseline.enddate = curriculumbaseline.enddate;
      tempCurriculumbaseline.schoolid = curriculumbaseline.schoolid;
      tempCurriculumbaseline.updated_at = new Date();
      tempCurriculumbaseline.updated_by = user.lmsuserid;
      await tempCurriculumbaseline.save({
        fields: ["curriculumid", "baselineid", "baselinename", "baselinetype", "startdate", "enddate", "schoolid", "updated_at", "updated_by"]
      })
      return tempCurriculumbaseline;
    }
    return null;

  };

  activate = async (curriculumbaselineid: string) => {
    const tempCurriculumbaseline = await this.getCurriculumBaseLineByID(curriculumbaselineid);
    if(tempCurriculumbaseline){
      tempCurriculumbaseline.baselinestatus = true;
      await tempCurriculumbaseline.save({ 
        fields: ["baselinestatus"]
      })
      return true;
    }else{
      return false;
    }
  }

  async activateByCurriculumid(curriculumbaselineid: string, curriculumid: string) {
    // deactivate
    const whereAll: WhereOptions<curriculumbaselineAttributes> = {
      curriculumbaselineid: {
        [Op.not]: curriculumbaselineid,
      },
      curriculumid: curriculumid,
      baselinestatus : true,
      isdeleted: false,
    };
    const tempCurriculumbaseline = await curriculumbaseline.findOne({where:whereAll});
    if(tempCurriculumbaseline){
        tempCurriculumbaseline.baselinestatus = false;
        await tempCurriculumbaseline.save({fields: ["baselinestatus"]});
    }
    
    // activate
    const baseline = await this.getCurriculumBaseLineByID(curriculumbaselineid);
    if(baseline){
      baseline.baselinestatus = true;
      await baseline.save({fields: ["baselinestatus"]});
    }
    return true;
  }

  deactivate = async (curriculumbaselineid: string) => {
    const tempCurriculumbaseline = await this.getCurriculumBaseLineByID(curriculumbaselineid);
    if(tempCurriculumbaseline){
      tempCurriculumbaseline.baselinestatus = false;
      await tempCurriculumbaseline.save({ 
        fields: ["baselinestatus"]
      })
      return true;
    }else{
      return false;
    }
  }

  deleteCurriculumBaseLine = async (curriculumbaselineid: string, user: LmsUserToken) => {
    const tempCurriculumbaseline = await this.getCurriculumBaseLineByID(curriculumbaselineid);
    const tempBaselineQuestion = await new BaselineQuestionBusiness().deleteBaselineQuestionCurriculum(curriculumbaselineid,user);
    if(tempCurriculumbaseline){
      
      tempCurriculumbaseline.isdeleted = true;
      tempCurriculumbaseline.deleted_at = new Date();
      tempCurriculumbaseline.deleted_by = user.lmsuserid;
      await tempCurriculumbaseline.save({
        fields:["isdeleted", "deleted_at", "deleted_by"]
      })
      return tempBaselineQuestion;
    }else{
      return false;
    }
    // curriculumbaseline.destroy({
    //   where: {
    //     curriculumbaselineid,
    //   },
    // });
  }

  getAllCurriculumBaseLines = async () => {
    const allcurriculums = await new CurriculumBusiness().getCurriculums();
    const curriculumentries = Object.fromEntries(
      allcurriculums.map((x) => [x.curriculumid, x.get({ plain: true })])
    );
    const allcurriculumbaseline = await curriculumbaseline.findAll({
      where: {
        isdeleted: false,
      },
      order:[['created_at', 'DESC']],
    });
    
    return allcurriculumbaseline.map((x: curriculumbaseline) => {
      return {
        ...x,
        baselinename: x.baselinename,
        baselinestatus: x.baselinestatus,
        baselinetype: x.baselinetype,
        startdate: x.startdate,
        enddate: x.enddate,
        created_at: x.created_at,
        schoolid: x.schoolid,
        curriculumbaselineid: x.curriculumbaselineid,
        baseline: curriculumentries[x.baselineid],
        curriculum: curriculumentries[x.curriculumid],
      };
    });
  };

    getAllCurriculumBaseLinesQuery = async (baselinename: string,baselinetype: number) => {
    const allcurriculums = await new CurriculumBusiness().getCurriculums();
    const curriculumentries = Object.fromEntries(
      allcurriculums.map((x) => [x.curriculumid, x.get({ plain: true })])
    );
    const where: WhereOptions<curriculumbaselineAttributes> = {
        isdeleted: false,
        // baselinename: {
        //   [Op.like]: `%${cur.trim()}%`
        // }
      }
    if(baselinename.length > 0) {
      where.baselinename = {
        [Op.like]: `%${baselinename.trim()}%`
      }
    }
    if(baselinetype > 0) {
      where.baselinetype = baselinetype;
    }
    const allcurriculumbaseline = await curriculumbaseline.findAll({
      where,
      order:[['created_at', 'DESC']],
    });
    
    return allcurriculumbaseline.map((x: curriculumbaseline) => {
      return {
        ...x,
        baselinename: x.baselinename,
        baselinestatus: x.baselinestatus,
        baselinetype: x.baselinetype,
        startdate: x.startdate,
        enddate: x.enddate,
        schoolid: x.schoolid,
        created_at: x.created_at,
        curriculumbaselineid: x.curriculumbaselineid,
        baseline: curriculumentries[x.baselineid],
        curriculum: curriculumentries[x.curriculumid],
      };
    });
  };

  getAllCurriculumBaseLinesid = async (curriculumbaselineid: string) => {
    const allcurriculums = await new CurriculumBusiness().getCurriculums();
    const curriculumentries = Object.fromEntries(
      allcurriculums.map((x) => [x.curriculumid, x.get({ plain: true })])
    );
    const getcurriculumbaseline = await curriculumbaseline.findOne({
      where: {
        curriculumbaselineid,
        isdeleted: false
      },
      order:[['created_at', 'DESC']],
    });
    
    return {
      data: {
        baselinename: getcurriculumbaseline?.baselinename,
        baselinestatus: getcurriculumbaseline?.baselinestatus,
        baselinetype: getcurriculumbaseline?.baselinetype,
        startdate: getcurriculumbaseline?.startdate,
        enddate: getcurriculumbaseline?.enddate,
        schoolid: getcurriculumbaseline?.schoolid,
        curriculumbaselineid: getcurriculumbaseline?.curriculumbaselineid,
        baseline: curriculumentries[getcurriculumbaseline!.baselineid],
        curriculum: curriculumentries[getcurriculumbaseline!.curriculumid],
      }
    }
  };

  async getSchoolBaseline(curriculumbaselineid: string){
    const schooldata: any[] = [];
    const where: WhereOptions<curriculumbaselineAttributes> = {
      curriculumbaselineid,
      isdeleted: false,
    };
    const schoolbaseline = await curriculumbaseline.findOne({where});
    const school = await schools.findAll({ 
      where:{
        isdeleted: false,
      }, 
      order:["schoolname"],
    });

    schoolbaseline?.schoolid.map(
      (schoolid: string) => {
        const getSchooldata = school.find((data: any) => data.schoolid === schoolid);
        schooldata.push(getSchooldata);
      }
    )

    return schooldata.map(
      (x: any) => { 
        return {
          curriculumbaselineid: schoolbaseline?.curriculumbaselineid,
          baselinename: schoolbaseline?.baselinename,
          baselinetype: schoolbaseline?.baselinetype,
          schoolname: x.schoolname,
          schoolid: x.schoolid,
        };
      });
  }

  async getStudentBaselineEndlineResults(curriculumbaselineid: string) {
    curriculumbaseline.hasMany(studentprogress, {
      foreignKey: "studentprogressreferenceid",
      sourceKey: "curriculumbaselineid",
    });
    studentprogress.belongsTo(curriculumbaseline, {
        foreignKey: "studentprogressreferenceid",
    });
    const totalquestions = await baselinequestion.count({
      where: {
        curriculumbaselineid
      }
    })
    const results = await studentprogress.findAll({
      where: {
        studentprogressreferenceid: curriculumbaselineid
      },
      include: [
        {
          model: students,
          attributes: ['studentfirstname', 'schoolname'],
          required: true,
          include: [
            {
              model: schoolusers,
              as: 'schooluser',
              required: true,
              attributes: ['schoolusername']
            }
          ]
        },
        {
          model: curriculumbaseline,
          attributes: ['baselinename'],
          required: true
        }
      ]
    }).then(rsls => {
      rsls.forEach(rsl => {
        (rsl as any).setDataValue('totalquestions', totalquestions);
      })
      return rsls;
    });
    return results
  }

  formatStudentBaselineEndlineResults = (stdprogresses: Array<studentprogress>) => {
    const formattedStudentResults: Array<IStudentBaselineResult> = [];
    stdprogresses.forEach(stdp => {
      const totalquestions = (stdp as any).totalquestions ?? (stdp.get({plain: true}) as any).totalquestions;
      formattedStudentResults.push({
        student: (stdp as any).student?.studentfirstname ?? '',
        username: (stdp as any).student?.schooluser?.schoolusername ?? '',
        schoolname: (stdp as any).student?.schoolname ?? '',
        baselinename: (stdp as any).curriculumbaseline?.baselinename ?? '',
        ispass: stdp.ispass ? 'Pass' : '',
        resultpercentage: stdp.resultpercentage,
        correct: stdp.marks,
        totalquestions: totalquestions ?? 0,
        scores: stdp.scores
      })
    });
    return formattedStudentResults
  }
}
