import { curriculumbaseline } from './../models/data-models/curriculumbaseline';
import { Op, WhereOptions } from "sequelize";
import { baselinequestion, baselinequestionAttributes } from "src/models/data-models/baselinequestion";
import { questions } from "src/models/data-models/questions";
import { LmsUserToken } from "src/models/token.model";
import { v4 as uuidv4 } from 'uuid';

export class BaselineQuestionBusiness {

  async create(baselinequestions: baselinequestionAttributes,user: LmsUserToken ){
    baselinequestions.baselinequestionid = uuidv4();
    baselinequestions.baselinequestionstatus = true;
    baselinequestions.isdeleted = false;
    baselinequestions.created_at = new Date();
    baselinequestions.created_by = user.lmsuserid;
    return await baselinequestion.create(baselinequestions)
  }

  async getBaselineQuestion(){
    const where: WhereOptions<baselinequestionAttributes> = {
      isdeleted: false,
    };
    const order = ['baselinequestionstatus'];
    return await baselinequestion.findAll({where, order});
  }

  getCurriculumBaseLineQuestionDuplicate = async (clonecurriculumbaselineid: string) => {
    const where: WhereOptions<baselinequestionAttributes> = {
      curriculumbaselineid:clonecurriculumbaselineid,
      isdeleted: false,
    };
    const temp = await baselinequestion.count({where});
    return temp > 0;
  };

  getCurriculumBaseLineQuestionEmpty = async (curriculumbaselineid: string) => {
    const where: WhereOptions<baselinequestionAttributes> = {
      curriculumbaselineid:curriculumbaselineid,
      isdeleted: false,
    };
    const temp = await baselinequestion.count({where});
    return temp > 0;
  };

  async clone(curriculumbaselineid: string, clonecurriculumbaselineid: string, user: LmsUserToken){
    const all: baselinequestionAttributes[] = [];
    const where: WhereOptions<baselinequestionAttributes> = {
      curriculumbaselineid,
      isdeleted: false,
    }
    const temps = await baselinequestion.findAll({where})

    for(const temp of temps) {
      if(temp){
        const tempcur = JSON.parse(JSON.stringify(temp));
        tempcur.curriculumbaselineid = clonecurriculumbaselineid;
        tempcur.baselinequestionid = uuidv4();
        tempcur.created_at = new Date();
        tempcur.updated_at = null;
        tempcur.deleted_at = null;
        tempcur.created_by = user.lmsuserid;
        all.push(tempcur);
      }
    }
    return await baselinequestion.bulkCreate(all);
  }

  async getBaselineQuestionid(baselinequestionid: string){
    return await baselinequestion.findOne({where: {baselinequestionid, isdeleted: false}})
  }

  async isBaselineQuestionexit(baselinequestionid: string){
    const where: WhereOptions<baselinequestionAttributes> = {
      baselinequestionid: baselinequestionid,
      isdeleted: false,
    }
    const found = await baselinequestion.count({where});
    return found > 0;
  }

  isexistsBaselineQuestionAdded = async (curriculumbaselineid: string, questionid: string, baselinequestionid: string | null | undefined = "") => {
    let where: WhereOptions<baselinequestionAttributes> = {
      curriculumbaselineid, questionid
    };
    if ((baselinequestionid ?? "").trim().length > 0) {
        where = {
            ...where,
            baselinequestionid: {
                [Op.not]: baselinequestionid
            }
        }
    }
    const tempdt = await baselinequestion.count({ where });
    return tempdt > 0;
};
  
  async getAllBaselineQuestion(curriculumbaselineid: string){
    const where: WhereOptions<baselinequestionAttributes> = {
      curriculumbaselineid: curriculumbaselineid,
      isdeleted: false,
    }
    curriculumbaseline.belongsTo(baselinequestion, {
      foreignKey: 'curriculumbaselineid',
    });
    baselinequestion.hasOne(curriculumbaseline, {
        foreignKey: 'curriculumbaselineid',
        sourceKey: 'curriculumbaselineid',
    });

    questions.belongsTo(baselinequestion, {
        foreignKey: 'questionid',
    });
    baselinequestion.hasOne(questions, {
        foreignKey: 'questionid',
        sourceKey: 'questionid',
    });
    const data = await baselinequestion.findAll({ 
      where,
      include: [
        {
          model: curriculumbaseline,
        },
        {
          model: questions,
        }
      ],
      order: ['baselinequestionorder']
    });

    return data ? data.map(
      (x) => <unknown>{
        baselinequestionid: x.baselinequestionid,
        curriculumbaselineid: x.curriculumbaselineid,
        questionid: x.questionid,
        baselinequestionstatus: x.baselinequestionstatus,
        baselinequestionorder: x.baselinequestionorder,
        baselinename: x.curriculumbaseline.baselinename,
        baselinetype: x.curriculumbaseline.baselinetype,
        // headingtext: x.question.questionheading.map((x: any)=> {return x.headingtext}),
        questionidentifier: x.question.questionidentifier,
      }
    ): undefined;
  }

  async activate(baselinequestionid: string){
    const where: WhereOptions<baselinequestionAttributes> = {
      isdeleted: false,
      baselinequestionid,
    }
    const temp = await baselinequestion.findOne({ where });
    if(temp){
      temp.baselinequestionstatus = true;
      await temp.save({
        fields: ['baselinequestionstatus']
      });
      return true;
    }else{
      return false;
    }
  }

  async deactivate(baselinequestionid: string){
    const where: WhereOptions<baselinequestionAttributes> = {
      isdeleted: false,
      baselinequestionid,
    }
    const temp = await baselinequestion.findOne({ where });
    if(temp){
      temp.baselinequestionstatus = false;
      await temp.save({
        fields: ['baselinequestionstatus']
      });
      return true;
    }else{
      return false;
    }
  }

  updateorderBaselineQuizQuestion = async (baselinequestionid: string, baselinequestionorder: number) => {
    const tempdt = await this.getBaselineQuestionid(baselinequestionid);
    if (tempdt) {
        tempdt.baselinequestionorder = baselinequestionorder;
        await tempdt.save({ fields: ['baselinequestionorder'] });
        return true;
    } else {
        return false;
    }
};

  async deleteBaselineQuestion(baselinequestionid: string, user: LmsUserToken){
    const where: WhereOptions<baselinequestionAttributes> ={
      baselinequestionid,
      isdeleted: false
    }
    const found = await baselinequestion.findOne({where});
    if(found){
      found.isdeleted = true;
      found.deleted_at = new Date;
      found.deleted_by = user.lmsuserid;
      await found.save({ fields: ['isdeleted', 'deleted_at', 'deleted_by'] });
      return true;
    }else{
      return false;
    }
  }

  async deleteBaselineQuestionCurriculum(curriculumbaselineid: string, user: LmsUserToken){
    const where: WhereOptions<baselinequestionAttributes> = {
      curriculumbaselineid,
      isdeleted: false,
    }
    const found = await baselinequestion.findAll({where});
    if(found){
      for(const temp of found){
        temp.isdeleted = true;
        temp.deleted_at = new Date;
        temp.deleted_by = user.lmsuserid;
        await temp.save({ fields: ['isdeleted', 'deleted_at', 'deleted_by'] });
      }
      return true;
    }else{
      return false;
    }
  }

}