/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException } from "@nestjs/common";
import { uniq } from "lodash";
import { col, fn, literal, Op, WhereOptions } from "sequelize";
import { IPaging } from "src/models/IPaging";
import { LmsUserToken } from "src/models/token.model";
import { v4 as uuidv4 } from "uuid";
import { QuestionBusiness } from ".";
import {
  countries,
  curriculumcountry,
  curriculumcountryCreationAttributes,
  curriculums,
  curriculumsAttributes,
  grades,
  lessons,
  levelquizquestions,
  levels,
  schools,
  students,
} from "../models/data-models/init-models";
import { buildWhere } from "./../services/util.service";
import { subjects } from "src/models/data-models/subjects";

export class CurriculumBusiness {
  createCurriculum = async (curriculum: curriculumsAttributes, user: LmsUserToken) => {
    curriculum.curriculumid = uuidv4();
    curriculum.isdeleted = false;
    curriculum.curriculumstatus = true;
    curriculum.created_by = user.lmsuserid;
    return await curriculums.create(curriculum);
  };
  getCurriculumbyid = async (curriculumid: string) => {
    const curriculumcountries = await curriculumcountry.findAll({
      attributes: ['countryid'],
      where: {
        curriculumid
      }
    })
    const curs = await curriculums.findOne({ where: { curriculumid, isdeleted: false } });
    const countryids = curriculumcountries.map(curt => curt.countryid);
    curs?.setDataValue('countryid', countryids);
    return curs
  }
  getCurriculumall = async (paging: IPaging) => {
    let where: WhereOptions<curriculumsAttributes> = {
      isdeleted: false,
    };
    const order = ["curriculumname"];
    const limit = paging.pagesize || 20;
    let offset = 0;
    if ((paging.pageindex || 1) > 1) {
      offset = limit * ((paging.pageindex || 1) - 1);
    }
    where = { ...buildWhere<curriculumsAttributes>(paging, where) };
    const curs = await curriculums.findAndCountAll({ where, order, limit, offset });
    const curcts = await curriculumcountry.findAll();
    for await (const cur of curs.rows) {
      const countryids = curcts.filter(curct => curct.curriculumid == cur.curriculumid);
      const cts = await Promise.all(countryids.map(async ct =>{
        const country = await countries.findOne({
          attributes: ['countryname'],
          where: { countryid: ct.countryid }
        })
        return country?.countryname ?? '';
      }));
      const subject = await subjects.findOne({
        where: {
          subjectid: cur.subjectid
        },
        attributes: ['subjectname']
      });

      cur.setDataValue('subjectid', subject?.subjectname ?? '')
      cur.setDataValue('countryid', cts)
    }
    return curs;
  };

  getCurriculums = async () => {
    const where: WhereOptions<curriculumsAttributes> = {
      //isdeleted: false,
    };
    const order = ["curriculumname"];

    return await curriculums.findAll({ where, order });
  };
  getCurriculumsWithFilter = async (cur: string, studentid: string, standardid: string, schoolname: string) => {
    const where: WhereOptions<curriculumsAttributes> = {
      isdeleted: false,
      curriculumstatus: true,
      curriculumname: {
        [Op.like]: literal(`'%${cur.trim()}%'`)
      }
    };
    if(studentid || standardid) {
      const wherestd: any = {};
      if(studentid) wherestd.studentid = studentid;
      if(standardid) wherestd.standard = standardid;
      const std = await students.findOne({
        where: wherestd, attributes: ['studentid','curriculumids'],
      });
      if(std) where.curriculumid = {
        [Op.in]: std.curriculumids ?? []
      }
    }
    if(schoolname) {
      const school = await schools.findOne({
        where: {
          schoolname: schoolname
        }
      });
      if(school) {
        where.curriculumid = {
          [Op.in]: Array.isArray(school.curriculums) ? (school.curriculums ?? []): JSON.parse(school.curriculums as unknown as string)
        }
      }
    }
    const order = ["curriculumname"];

    return await curriculums.findAll({ where, order });
  };
  getCurriculumname = (curriculumname: string) =>
    curriculums.findOne({ where: { curriculumname, isdeleted: false } });
  updateCurriculum = async (curriculum: curriculumsAttributes, user: LmsUserToken) => {
    const tempdt = await this.getCurriculumbyid(curriculum.curriculumid);
    if (tempdt) {
      tempdt.curriculumname = curriculum.curriculumname;
      tempdt.curriculumdescription = curriculum.curriculumdescription;
      tempdt.updated_at = new Date();
      tempdt.updated_by = user.lmsuserid;
      tempdt.subjectid = curriculum.subjectid;
      await tempdt.save({
        fields: ["curriculumname", "curriculumdescription", "subjectid", 'updated_at', 'updated_by'],
      });
      //await tempdt.reload();
      return tempdt;
    } else {
      return null;
    }
  };
  deleteCurriculum = async (curriculumid: string, user: LmsUserToken) => {
    const tempdt = await this.getCurriculumbyid(curriculumid);
    if (tempdt) {
      tempdt.isdeleted = true;
      tempdt.deleted_at = new Date();
      tempdt.deleted_by = user.lmsuserid;
      await tempdt.save({ fields: ["isdeleted", 'deleted_at', 'deleted_by'] });
      await curriculumcountry.destroy({
        where: {
          curriculumid
        }
      })
      return true;
    } else {
      return false;
    }
  };

  activateCurriculum = async (curriculumid: string) => {
    const tempdt = await this.getCurriculumbyid(curriculumid);
    if (tempdt) {
      tempdt.curriculumstatus = true;
      await tempdt.save({ fields: ["curriculumstatus"] });
      return true;
    } else {
      return false;
    }
  };

  deavtivateCurriculum = async (curriculumid: string) => {
    const tempdt = await this.getCurriculumbyid(curriculumid);
    if (tempdt) {
      tempdt.curriculumstatus = false;
      await tempdt.save({ fields: ["curriculumstatus"] });
      return true;
    } else {
      return false;
    }
  };
  isexistsCurriculumName = async (curriculum: curriculumsAttributes) => {
    let where: WhereOptions<curriculumsAttributes> = {
      curriculumname: curriculum.curriculumname,
      isdeleted: false,
    };
    if ((curriculum.curriculumid ?? "").trim().length > 0) {
      where = {
        ...where,
        curriculumid: {
          [Op.not]: curriculum.curriculumid,
        },
      };
    }
    const tempdt = await curriculums.count({ where });
    return tempdt > 0;
  };

  isexistsCurriculumID = async (curriculumid: string) => {
    const where: WhereOptions<curriculumsAttributes> = {
      curriculumid,
      isdeleted: false,
    };
    const tempdt = await curriculums.count({ where });
    return tempdt > 0;
  };

  findcurriculumgrades = async (curriculumid: string) => {
    curriculums.hasMany(grades, {
      foreignKey: "curriculumid",
      sourceKey: "curriculumid",
    });
    grades.belongsTo(curriculums, {
      foreignKey: "curriculumid",
    });
    grades.hasMany(levels, {
      foreignKey: "gradeid",
      sourceKey: "gradeid",
    });
    levels.belongsTo(grades, {
      foreignKey: "gradeid",
    });

    levels.hasMany(lessons, {
      foreignKey: "levelid",
      sourceKey: "levelid",
    });
    lessons.belongsTo(levels, {
      foreignKey: "levelid",
    });

    const curriculumobject = await curriculums.findOne({
      where: { curriculumid, curriculumstatus: true, isdeleted: false },
      attributes: {
        exclude: [],
      },
      order: [[grades, levels, lessons, "lessonorder", "ASC"]],
      include: [
        {
          where: {
            gradeid: { [Op.ne]: null },
            gradestatus: true,
            isdeleted: false,
          },
          model: grades,
          include: [
            {
              where: {
                levelid: { [Op.ne]: null },
                levelstatus: true,
                isdeleted: false,
              },
              model: levels,
              include: [
                {
                  where: {
                    lessonid: { [Op.ne]: null },
                    lessonstatus: true,
                    isdeleted: false,
                  },
                  model: lessons,
                },
              ],
            },
          ],
        },
      ],
    });

    const levelquestioncountobject = await levelquizquestions.findAll({
      group: ["levelid"],
      attributes: [[fn("COUNT", col("levelid")), "levelquizcount"], "levelid"],
    });

    const levelquestioncountdata = levelquestioncountobject.map(
      (levelquestioncount) => levelquestioncount.get({ plain: true })
    );
    if (curriculumobject) {
      const temp: any = curriculumobject.get({ plain: true });
      temp.grades = temp.grades.map((grade: any) => {
        grade.levels = grade.levels.map((level: any & { hasquiz: boolean }) => {
          const levelquestioncount = levelquestioncountdata.find(
            (x) => x.levelid === level.levelid
          );

          // eslint-disable-next-line no-param-reassign
          return {
            ...level,
            hasquiz: levelquestioncount ? true : false,
            lessons: level.lessons.map((lesson: lessons) => {
              const number = lesson.lessonname.match(/[0-9]+/g);
              return {
                ...lesson,
                lessonheading:
                  number && number.length > 0 ? number[0] : lesson.lessonname,
              };
            }),
          };
        });
        return grade;
      });
      return temp;
    }
    return null;
  };

  getDocuments = async (curriculumid: string) => {
    const qb = new QuestionBusiness();
    const map: {
      grades: Array<{
        levels: Array<{
          lessons: Array<any>;
        }>;
      }>;
    } = await new CurriculumBusiness().findcurriculumgrades(curriculumid);
    const files: Array<string> = [];

    const extractFile = (y: Array<any>) => {
      if (!Array.isArray(y)) {
        return;
      }
      y.forEach((f: any) => {
        if (f?.questionfile?.filename) {
          files.push(f?.questionfile?.filename);
        }
        if (f?.questionheading?.headingfile?.filename) {
          files.push(f?.questionheading?.headingfile?.filename);
        }
        if (f?.questionoptions) {
          f?.questionoptions.forEach((g: any) => {
            if (g?.questionoptionfile?.filename) {
              files.push(g?.questionoptionfile?.filename);
            }
            if (g?.questionassociate?.questionassociatefile?.filename) {
              files.push(g?.questionassociate?.questionassociatefile?.filename);
            }
          });
        }
      });
    };

    const fc = map.grades.map(async (x) => {
      return await Promise.all(
        x.levels.map(async (y: any) => {
          y.lessons = await Promise.all(
            y.lessons.map(async (z: any) => {
              z.question = JSON.parse(
                JSON.stringify(await qb.getlessonquestions(z.lessonid))
              );
              z.question.learningpath.forEach((h: any) => {
                if (h?.lessonpracticequestions) {
                  extractFile(
                    h.lessonpracticequestions.map((q: any) => q.question)
                  );
                }
                if (h?.lessonquizquestions) {
                  extractFile(
                    h.lessonquizquestions.map((q: any) => q.question)
                  );
                }
                if (h?.lessonlearningfileobject?.filename) {
                  files.push(h?.lessonlearningfileobject?.filename);
                }
              });
              return z;
            })
          );
          if (y.hasquiz) {
            y.questions = JSON.parse(
              JSON.stringify(await qb.getlevelquestions(y.levelid))
            );

            extractFile(
              y.questions.levelquizquestions.map((fc: any) => fc.question)
            );
          }
          return y;
        })
      );
    });
    await Promise.all(fc);

    return uniq(files);
  };

  createcurriculumcountry = async (countryid: Array<string>, curriculumid: string, curriculumcountryid?: string) => {
    const cts = await countries.findAll({
      where: {
        countryid: countryid
      }
    })
    if (countryid.length != cts.length) {
      throw new BadRequestException('some country not found');
    }
    const curriculumcountrys: curriculumcountryCreationAttributes[] = [];
    cts.forEach(ct => {
      curriculumcountrys.push({
        curriculumcountryid: !curriculumcountryid ? uuidv4() : curriculumcountryid,
        curriculumid: curriculumid,
        countryid: ct.countryid
      })
    });
    curriculumcountry.bulkCreate(curriculumcountrys, {
      updateOnDuplicate: ["countryid"]
    })
  }
  updatecurriculumcountry = async (countryid: Array<string>, curriculumid: string) => {
    const cts = await countries.findAll({
      where: {
        countryid: countryid
      }
    })
    if (countryid.length != cts.length) {
      throw new BadRequestException('some country not found');
    }
    await curriculumcountry.destroy({
      where: {
        curriculumid
      }
    })
    const curriculumcountrys: curriculumcountryCreationAttributes[] = [];
    cts.forEach(ct => {
      curriculumcountrys.push({
        curriculumcountryid: uuidv4(),
        curriculumid: curriculumid,
        countryid: ct.countryid
      })
    });
    curriculumcountry.bulkCreate(curriculumcountrys, {
      updateOnDuplicate: ["countryid"]
    })
  }

  getAllCurriculumbyCountryid = async (countryid: string, getBaseline: boolean = false) => {
    const curriculumcountries = await curriculumcountry.findAll({
      attributes: ['curriculumid'],
      where: {
        countryid
      }
    })
    const curriculumids = curriculumcountries.map(curt => curt.curriculumid);
    let curs = await curriculums.findAll({ where: { curriculumid: curriculumids, isdeleted: false } });
    if (!getBaseline) {
      curs = curs.filter(cur => !cur.curriculumname.includes('Baseline') && !cur.curriculumname.includes('baseline'))
    }
    return curs
  }
}
