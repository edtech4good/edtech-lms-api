import {schoolcontributedata, schoolcontributedataAttributes} from "../models/data-models/schoolcontributedata";
import {LmsUserToken} from "../models/token.model";
import {v4 as uuidv4} from "uuid";
import { Op, WhereOptions } from "sequelize";
import { BadRequestException } from "@nestjs/common";
import { schools, schoolsAttributes } from "src/models/data-models/school";
import { IPaging } from "src/models/IPaging";
import { buildWhere } from "src/services/util.service";
import { format } from "date-fns";

export interface ChartItemFormat {
    name: Date | string;
    value: number;
  }
  
  export interface LineChartFormat {
    name: string;
    series: Array<ChartItemFormat>;
  }

export class SchoolcontributeBusiness {

    createSchoolContribute = async (schoolContribute: schoolcontributedataAttributes, user: LmsUserToken) => {
        schoolContribute.schoolcontributeid = uuidv4();
        schoolContribute.isdeleted = false;
        schoolContribute.created_at = new Date();
        schoolContribute.created_by = user.lmsuserid;
        return await schoolcontributedata.create(schoolContribute);
    }

    isexistsschoolNameContribute = async (schoolcontribute: schoolcontributedataAttributes) => {
        const where: WhereOptions<schoolcontributedataAttributes> = {
            schoolid: schoolcontribute?.schoolid,
            schoolname: schoolcontribute?.schoolname,
            isdeleted: false,
        };
        if ((schoolcontribute.schoolcontributeid ?? "").trim().length > 0) {
            where.schoolcontributeid = {
                [Op.not]: schoolcontribute.schoolcontributeid,
            };
        }
        const tempdt = await schoolcontributedata.count({ where });
        return tempdt > 0;
    };

    isexistsschoolcontributeID = async (schoolcontributeid: string) => {
        const where: WhereOptions<schoolcontributedataAttributes> = {
          schoolcontributeid,
          isdeleted: false,
        };
        const tempdt = await schoolcontributedata.count({ where });
        return tempdt > 0;
      };
    
    isexistsschoolID = async (schoolid: string) => {
        const where: WhereOptions<schoolcontributedataAttributes> = {
            schoolid,
            isdeleted: false,
        };
        const tempdt = await schoolcontributedata.count({ where });
        return tempdt > 0;
    };

    isexistcreated_at = async (schoolid: string) => {
        const where: WhereOptions<schoolcontributedataAttributes> = {
            schoolid,
            isdeleted: false,
        };
        const school = await schoolcontributedata.findOne({
            order:[['created_at', 'DESC']],
            where: where,
        });
        if(school){
            const createTime = new Date(school?.created_at ?? '');
            const currentTime = new Date();
            const createDate = new Intl.DateTimeFormat("en-US", 
            {
                year: "numeric",
                month: "numeric",
            }
            ).format(createTime);
            const currentDate = new Intl.DateTimeFormat("en-US", 
            {
                year: "numeric",
                month: "numeric",
            }
            ).format(currentTime);
    
            if(createDate === currentDate){
                return true;
            }else{
                return false;
            }
        }
        return false;
    };

    getschoolcontributeid = async (schoolcontributeid: string) => {
        const school = await schoolcontributedata.findOne({
            where: {
                schoolcontributeid,
                isdeleted: false,
            },
        });
        return school;
    }

    getSchoolContributeById = async (schoolid: string, date: string) => {
        const allSchool: any[] =[];
        const where:WhereOptions<schoolsAttributes> = {
            schoolid, 
            isdeleted: false
        };
       const School =  await schoolcontributedata.findAll({
        order:[['created_at', 'DESC']],
        where,
        include: [
            {
              model: schools,
              required: false,
              attributes: ["schoolname"],
            },
          ],});

          if(!date){
            return School;
          }else{
            for (const school of School){
                const createDate = new Intl.DateTimeFormat("en-US", 
                {
                    year: "numeric",
                    month: "numeric",
                }
                ).format(new Date(school?.created_at ?? ''));
                const FillDate = new Intl.DateTimeFormat("en-US", 
                {
                    year: "numeric",
                    month: "numeric",
                }
                ).format(new Date(date));
                if(createDate === FillDate){
                    allSchool.push(school);
                }
            }
            return allSchool;
          }
    }

    async getschoolById(schoolid: string) {
        const School =  await schoolcontributedata.findAll({
            where: { schoolid: schoolid, isdeleted: false }
        });
        return School;
    }

    getSchoolDashboardById = async (schoolid: string) => {
        return  await schoolcontributedata.findAll({
            order:[['created_at', 'DESC']],
            where: {
                schoolid,
                isdeleted: false,
            },
            limit: 3,
        });
     }

    getAllSchoolContribute = async (schoolname: string, countryid: string, date: string) => {
        const getDashboard: any[] = [];
        const allSchool = await this.getSchoolsWithFilter(schoolname,countryid)
        for( const school of allSchool){
            const dashboard = await this.getSchoolContributeById(school.schoolid,date);
            if(dashboard.length > 0 && dashboard != null){
                getDashboard.push(dashboard[0]);
            }
        }
        return getDashboard;
    }

    updatedSchoolContribute = async (school: schoolcontributedataAttributes, user: LmsUserToken) => {
        const tempdata = await this.getschoolById(school.schoolid ?? '');
        tempdata.map(async (temp:any) => {
            if(temp) {
                temp.schoolname = school.schoolname;
                temp.schoolid = school.schoolid;
                temp.countryid = school.countryid;
                temp.updated_at = new Date();
                temp.updated_by = user.lmsuserid;
                const findschool = await schoolcontributedata.findAll({ where: { schoolid: school.schoolid }});
                if(!findschool) throw new BadRequestException('no school found');
                await temp.save({ fields: ["schoolname", "schoolid", "countryid", "updated_at", "updated_by"]});
            }else{
                return null;
            }
        })
        return tempdata;
    };

    updatedSchoolContributeDashboard = async (school: schoolcontributedataAttributes, user: LmsUserToken) => {
        const temp = await this.getschoolcontributeid(school.schoolcontributeid ?? '');
        if (temp) {
            temp.expected = school.expected;
            temp.actual = school.actual;
            temp.updated_at = new Date();
            temp.updated_by = user.lmsuserid;
            const findschool = await schoolcontributedata.findAll({ where: { schoolid: school.schoolcontributeid }});
            if(!findschool) throw new BadRequestException('no school found');
            await temp.save({ fields: ["expected","actual", "updated_at", "updated_by"]});
            return temp;
        } else {
            return null;
        }
    };

    deleteSchoolContribute = async (schoolid: string, user: LmsUserToken) => {
        const tempdata = await this.getschoolById(schoolid);
        for (const temp of tempdata ?? []) {
            if(temp) {
                temp.isdeleted = true,
                temp.deleted_at = new Date(),
                temp.deleted_by  = user.lmsuserid,
                await temp.save({ fields: ["isdeleted", "deleted_at", "deleted_by"] });
            }else{
                return false;
            }
        }
        return true;
    }

    deleteSchoolContributeId = async (schoolcontributeid: string, user: LmsUserToken) => {
        const temp = await this.getschoolcontributeid(schoolcontributeid);
            if(temp) {
                temp.isdeleted = true,
                temp.deleted_at = new Date(),
                temp.deleted_by  = user.lmsuserid,
                await temp.save({ fields: ["isdeleted", "deleted_at", "deleted_by"] });
            }else{
                return false;
            }
        return true;
    }

    getSchooldashboard = async (schoolid: string) => {
        const data: Array<LineChartFormat> = [];
        const schools = await this.getSchoolDashboardById(schoolid);
        for (const school of schools) {
            if(school){
                const timeZone = new Date(school?.created_at ?? '')
                  const calender = new Intl.DateTimeFormat("en-US", 
                  {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "numeric",
                    second: "numeric",
                    hour12: true,
                }).format(timeZone);
                const  item:Array<ChartItemFormat> = [
                {
                    name: 'Expected($)',
                    value: school?.expected ?? 0,
                },
                {
                    name: 'Actuals($)',
                    value: school?.actual ?? 0,
                }]
                data.push({name: calender , series: item})
            }
        }
        data.sort();
        data.reverse();
        return data;
    }

    getAllSchooldashboard = async () => {
        const data: Array<LineChartFormat> = [];
        const school = await this.getAllSchoolContribute('','','');
            for(const getschool of school){
                const  item:Array<ChartItemFormat> = [
            {
                name: 'Expected($)',
                value: getschool?.expected ?? 0,
            },
            {
                name: 'Actuals($)',
                value: getschool?.actual ?? 0,
            }]
            data.push({name: getschool?.schoolname ?? '', series: item})
        }
        return data;
    }

    getAllSchoolContributeId = async (paging: IPaging, schoolid: string) => {
        let where: WhereOptions<schoolcontributedataAttributes> = {
            schoolid: schoolid,
            isdeleted: false,
          };
          const limit = paging.pagesize || 20;
          let offset = 0;
          if ((paging.pageindex || 1) > 1) {
            offset = limit * ((paging.pageindex || 1) - 1);
          }
          where = { ...buildWhere<schoolcontributedataAttributes>(paging, where) };

          const schoolcontribute = await schoolcontributedata.findAndCountAll({
            where,
            order: [["created_at", 'DESC']],
            limit,
            offset,
            attributes: [
              "schoolcontributeid",
              "expected",
              "actual",
              "schoolid",
              "schoolname",
              "created_at",
            ],
          });
          return schoolcontribute;
    }

    getSchoolDashboardCountry = async (schoolname: string, countryid: string, date: string) =>{
        const data: Array<LineChartFormat> = [];
        const school = await this.getAllSchoolContribute(schoolname, countryid, date);
        for(const getSchool of school){
            const item: Array<ChartItemFormat> = [
                {
                    name: 'Expected($)',
                    value: getSchool?.expected ?? 0,
                },
                {
                    name: 'Actuals($)',
                    value: getSchool?.actual ?? 0,
                }
            ];
            const day = new Date(getSchool?.created_at).getDate();
            const month = new Date(getSchool?.created_at);
            const mmm = format(month, "MMM");
            const year = new Date(getSchool?.created_at).getFullYear();
            data.push({name:`${day}/${mmm}/${year}/ ${getSchool.schoolname}` ?? '' ,series: item })
        }
        return data;

    }

    reportDownload = async(date: string) => {
        const report: any[] = [];
        const school = await this.getAllSchoolContribute('', '',date);
        for(const getschool of school){
            const createTime = new Date(getschool?.created_at ?? '');
            const currentTime = new Date();
            const createDate = new Intl.DateTimeFormat("en-US", 
            {
                year: "numeric",
                month: "numeric",
            }
            ).format(createTime);
            const currentDate = new Intl.DateTimeFormat("en-US", 
            {
                year: "numeric",
                month: "numeric",
            }
            ).format(currentTime);

            if(date){
                report.push(getschool);
            }else{
                if(createDate === currentDate){
                    report.push(getschool);
                }else{
                    const temp = await this.getschoolcontributeid(getschool.schoolcontributeid);
                    if(temp){
                        temp.expected = 0;
                        temp.actual = 0;
                        temp.created_at = new Date(0);
                        report.push(temp);
                    }
                }
            }
        }
        return report;
    }

    getSchoolsWithFilter = async (schoolname: string, countryid: string) => {
        const where: WhereOptions<schoolsAttributes> = {
          isdeleted: false,
        };
        const order = ["schoolname"];
        if(countryid) {
          where.countryid = countryid;
        }
        if(schoolname){
            where.schoolname = schoolname;
        }
        return await schools.findAll({ where, order });
      };


    getSchoolContribution = async () => {
        const where: WhereOptions<schoolcontributedataAttributes> = {
            //isdeleted: false,
        };
        const order = ["schoolname"];

        return await schoolcontributedata.findAll({ where, order });
    };

}
