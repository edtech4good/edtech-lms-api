import { col, fn, Op, Transaction, WhereOptions } from "sequelize";
import { assertSameOwner, ownerOfCurriculum } from "./content-owner";
import { OrgContext } from "src/decorators/org.decorator";
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { organisationcountry } from "src/models/data-models/organisationcountry";
import { dbinstance, rollbackQuietly } from "src/services/dbservice";
import { lockLiveOrganisation, scopeOf } from "./org-scope";
import { andSchoolScope, findOwnedSchool, inOwnedSchools } from "./school-scope";
import { countries } from "src/models/data-models/countries";
import { curriculums } from "src/models/data-models/curriculums";
import { schools, schoolsAttributes } from "src/models/data-models/school";
import { schoolcontributedata } from "src/models/data-models/schoolcontributedata";
import { schoolusers } from "src/models/data-models/schoolusers";
import { standards } from "src/models/data-models/standard";
import { students } from "src/models/data-models/students";
import { IMultiPaging } from "src/models/IPaging";
import { LmsUserToken } from "src/models/token.model";
import { SchoolCurriculumBase } from "src/modules/school/models/SchoolResponse";
import { constructWhere } from "src/services/util.service";
// import { buildWhere } from "src/services/util.service";
import { v4 as uuidv4 } from "uuid";
import { CurriculumBusiness } from "./curriculum.business";
import { StudentBusiness } from "./student.business";

/**
 * What a create or edit of a school carries in: the school's own columns, and the organisation the request ASKED for
 * (`undefined` when it named none, `null` when it named "no organisation"). The organisation the school is stored with is
 * decided here (`schoolOrganisation`), never taken from the request as it stands.
 */
export type SchoolWrite = Omit<schoolsAttributes, "organisationid"> & { organisationid?: string | null };

/** Every curriculum in `ids` must have the school's owner (see `assertSameOwner`). */
const assertCurriculumsFitOwner = async (owner: string | null | undefined, ids: unknown, transaction: Transaction) => {
  for (const id of Array.isArray(ids) ? (ids as string[]) : []) {
    assertSameOwner(owner ?? null, await ownerOfCurriculum(id, transaction));
  }
};

/** The admin's school form has no organisation field, so the message names the switcher (as the content-create message does). */
const CHOOSE_ORGANISATION =
  "Act as an organisation first (use the organisation switcher), or choose the organisation this school belongs to.";
const KEEP_ORGANISATION =
  "A school must belong to an organisation. Choose one, or leave the organisation out to keep the current one.";

const organisationRequired = (message: string) =>
  new ApiError(ErrorCode.INVALID_INPUT, "Some of the information isn't valid.", {
    fields: [{ field: "organisationid", message }],
  });

export class SchoolBusiness {
  getschoolbyname = (schoolname: string) =>
    schools.findOne({
      where: { schoolname, isdeleted: false },
    });

  /** The schools that have learners, one row each, among the caller's schools. */
  getallschools = async (org: OrgContext) =>
    students.findAll({
      where: await inOwnedSchools(org),
      attributes: [
        [fn("min", col("schooltype")), "schooltype"],
        // one row per school (by id: two schools may share a name); the name is the stored copy
        [fn("min", col("schoolname")), "schoolname"],
        "schoolid",
        [fn("min", col("city")), "city"],
        [fn("min", col("country")), "country"],
        [fn("min", col("state")), "state"],
      ],
      group: "schoolid",
    });

  // No caller scope: used where a country is checked for schools of any organisation (a platform action).
  getschoolsbycountry = (countryid: string) =>
    schools.findAll({
      where: { countryid }
    })

  /** A country's schools among the caller's schools. */
  getownedschoolsbycountry = (org: OrgContext, countryid: string) =>
    schools.findAll({
      where: andSchoolScope({ countryid }, org),
    })

  /**
   * Which organisation a school written by this caller gets, checked inside the
   * caller's transaction.
   *
   *  - Caller scope organisation X: the school is X's. A requested organisation,
   *    if one was sent, must be X (else 403).
   *  - Caller scope platform: the school gets the organisation the request names.
   *    A school always has an organisation (`schools.organisationid` is required),
   *    so a platform caller who is not acting as an organisation and names none
   *    (or names `null`) is refused with 400 before anything is written.
   * An organisation that is written must exist and not be deleted (the row is
   * locked and read here: the foreign key does not know about `isdeleted`), and
   * the school's country must be one the organisation is linked to
   * (`organisationcountry`), else 400.
   */
  private schoolOrganisation = async (opts: {
    org: OrgContext;
    requested: string | null | undefined;
    current: string | null;
    creating: boolean;
    countryid: string;
    transaction: Transaction;
  }): Promise<string | null> => {
    const scope = scopeOf(opts.org);
    let resulting: string | null;
    if (opts.creating) {
      if (scope.kind === "organisation") {
        // An organisation's staff write their own organisation; a different
        // value is refused.
        if (opts.requested !== undefined && opts.requested !== scope.organisationid) {
          throw new ApiError(ErrorCode.NOT_ALLOWED);
        }
        resulting = scope.organisationid;
      } else {
        resulting = opts.requested === undefined ? null : opts.requested;
        if (resulting === null) {
          throw organisationRequired(CHOOSE_ORGANISATION);
        }
      }
    } else {
      // Updating: only a platform caller names an organisation (the key is
      // refused for anyone else); otherwise the school keeps its own.
      if (opts.requested !== undefined && scope.kind !== "platform") {
        throw new ApiError(ErrorCode.NOT_ALLOWED);
      }
      resulting = opts.requested === undefined ? opts.current : opts.requested;
      if (opts.requested === null) {
        // The column is being written, and it cannot be emptied.
        throw organisationRequired(KEEP_ORGANISATION);
      }
    }
    if (resulting !== null) {
      // The organisation row is locked (shared) whenever the school has or is being
      // given one, NOT only when it changes: the country check below and an
      // organisation's own edit of its country links must not interleave. An
      // organisation update takes the same row for update before it touches its
      // links, so either this check sees the links after that edit committed, or
      // the edit waits until this transaction has written the school.
      if (!(await lockLiveOrganisation(resulting, opts.transaction))) {
        throw new ApiError(ErrorCode.INVALID_INPUT, "Some of the information isn't valid.", {
          fields: [{ field: "organisationid", message: "Choose an organisation that exists." }],
        });
      }
      const linked = await organisationcountry.count({
        where: { organisationid: resulting, countryid: opts.countryid },
        transaction: opts.transaction,
      });
      if (linked === 0) {
        throw new ApiError(ErrorCode.INVALID_INPUT, "Some of the information isn't valid.", {
          fields: [{ field: "countryid", message: "That country isn't one of this organisation's countries." }],
        });
      }
    }
    return resulting;
  };

  createschool = async (school: SchoolWrite, user: LmsUserToken, org: OrgContext) => {
    const requested = school.organisationid;
    scopeOf(org);
    const transaction = await dbinstance.getdbinstance().transaction();
    try {
      // Never null here: for a create `schoolOrganisation` refuses before it returns one.
      const organisationid = (await this.schoolOrganisation({
        org,
        requested,
        current: null,
        creating: true,
        countryid: school.countryid,
        transaction,
      })) as string;
      // A curriculum of another organisation cannot be attached to the school.
      await assertCurriculumsFitOwner(organisationid, school.curriculums, transaction);
      school.schoolid = uuidv4();
      // Surrounding whitespace is never part of a school's name: a name stored
      // with it cannot be matched by the writers that look schools up by name.
      school.schoolname = school.schoolname.trim();
      school.isdeleted = false;
      school.created_by = user.lmsuserid;
      const created = await schools.create({ ...school, organisationid }, { transaction });
      await transaction.commit();
      return created;
    } catch (e) {
      await rollbackQuietly(transaction);
      throw e;
    }
  };
  getschoolbyid = (schoolid: string) =>
    schools.findOne({ where: { schoolid, isdeleted: false }});
  getschoolall = async (paging: IMultiPaging, org: OrgContext) => {
    let where: WhereOptions<schoolsAttributes> = {
      isdeleted: false,
    };
    const order = ["schoolname"];
    const limit = paging.pagesize || 20;
    let offset = 0;
    if ((paging.pageindex || 1) > 1) {
      offset = limit * ((paging.pageindex || 1) - 1);
    }
    // The caller's scope is ANDed on the outside: a filter (which builds its own `Op.and`) cannot replace it.
    where = andSchoolScope({ ...constructWhere<schoolsAttributes>(paging, where) }, org);

    const allschoolscount = await schools.findAndCountAll({ where, order, limit, offset, 
      include:[
        { 
          model: countries,
          as: "countries"
        }
      ]
      });
    const filterschools = await Promise.all(allschoolscount.rows.map(async school => {
      // const curs = school.curriculums;
      const newcurs: Array<string | undefined> = [];
      for (let index = 0; index < school.curriculums?.length; index++) {
        const cur = await curriculums.findOne({ where: { curriculumid: school.curriculums[index] } });
        newcurs.push(cur?.curriculumname);
      }
      school.curriculums = newcurs as [string];
      return school
    }));
    allschoolscount.rows = filterschools;
    return allschoolscount
  };
  getSchoolsWithFilter = async (schoolname: string, countryid: string, user: LmsUserToken | undefined, org: OrgContext) => {
    const where: WhereOptions<schoolsAttributes> = {
      isdeleted: false,
      schoolname: {
        [Op.like]: `%${schoolname.trim()}%`
      }
    };
    const order = ["schoolname"];
    if(countryid) {
      where.countryid = countryid;
    }
    if(user && user.schools && user.schools.length > 0) {
      where.schoolid = {
        [Op.in]: user.schools
      }
    }
    return await schools.findAll({
      where: andSchoolScope(where, org),
      order,
    });
  };
  getschoolname = (schoolname: string) =>
    schools.findAll({ where: { schoolname, isdeleted: false } });
  /**
   * Renames and edits a school. The learners and school logins of a school are
   * tied to it by `schoolid` AND carry a copy of its name (`students.schoolname`,
   * `schoolusers.schoolname`), which every reader still joins on. Before C4 a
   * rename updated only `schools`, which left every learner and login of the
   * school pointing at a name that no longer exists. The copies now follow the
   * school in the same transaction, keyed on `schoolid`, so the id stays correct
   * and the two names never drift apart. The same goes for the copies in
   * `standards` and `schoolcontributedata` (both keyed on their own `schoolid`).
   *
   * ONE transaction, one lock order: (1) the school row, UPDATE lock; (2) the
   * organisation row, SHARE lock, only when an organisation is being written
   * (`lockLiveOrganisation`); (3) the organisation/country link, a plain read;
   * (4) the school save; (5) the copies: learners, logins, classes, Fees
   * Collection rows. The school is always taken before the organisation and the
   * copies last. A learner create takes only the school (SHARE) and then inserts,
   * so it queues behind or ahead of step 1 and never holds anything this
   * transaction waits for. Deleting an organisation takes the organisation row
   * (UPDATE) and then only COUNTS schools without a lock, so it never waits for a
   * school row; the other order (organisation then school) exists nowhere.
   */
  updateschoolName = async (school: SchoolWrite, user: LmsUserToken, org: OrgContext) => {
    const requested = school.organisationid;
    scopeOf(org);
    const transaction = await dbinstance.getdbinstance().transaction();
    try {
      // Read INSIDE the transaction under an update lock, and take the previous
      // name from this read. Read outside, an edit that had read the old name
      // could save it back (every listed field is written) after a rename had
      // committed and cascaded, undoing the cascade for that school.
      // (Among the caller's schools: another organisation's school, and a school with no organisation
      // for an organisation caller, are not found, like one that does not exist.)
      const tempdt = await findOwnedSchool(org, school.schoolid, { transaction, lock: Transaction.LOCK.UPDATE });
      // Only a platform caller changes a school's organisation (a different
      // value from anyone else is refused); whatever the organisation ends up
      // being, the country must be one of its countries.
      const resulting = await this.schoolOrganisation({
        org,
        requested,
        current: tempdt.organisationid ?? null,
        creating: false,
        countryid: school.countryid,
        transaction,
      });
      // Curriculums newly attached (or all of them, when the school's organisation changed) must
      // belong to the school's organisation; links that were already there are not re-checked.
      const before = Array.isArray(tempdt.curriculums) ? (tempdt.curriculums as string[]) : [];
      const attaching = (Array.isArray(school.curriculums) ? (school.curriculums as string[]) : []).filter(
        (id) => (tempdt.organisationid ?? null) !== (resulting ?? null) || !before.includes(id),
      );
      await assertCurriculumsFitOwner(resulting, attaching, transaction);
      const previousname = tempdt.schoolname;
      tempdt.schoolname = school.schoolname.trim();
      tempdt.countryid = school.countryid;
      tempdt.curriculums = school.curriculums;
      tempdt.updated_at = new Date();
      tempdt.updated_by = user.lmsuserid;
      const fields: (keyof schoolsAttributes)[] = ["schoolname", "countryid", "curriculums", "updated_at", "updated_by"];
      if (requested !== undefined) {
        // `resulting` is a live organisation's id: an update that names the column never empties it.
        tempdt.organisationid = resulting as string;
        fields.push("organisationid");
      }
      // uitheme is optional on this endpoint (branding/logo upload is a
      // later slice) — only touch it, and only save the column, when the
      // caller actually sent one.
      if (school.uitheme !== undefined) {
        tempdt.uitheme = school.uitheme;
        fields.push("uitheme");
      }
      await tempdt.save({ fields, transaction });
      if (previousname !== tempdt.schoolname) {
        await students.update(
          { schoolname: tempdt.schoolname },
          { where: { schoolid: tempdt.schoolid }, transaction },
        );
        await schoolusers.update(
          { schoolname: tempdt.schoolname },
          { where: { schoolid: tempdt.schoolid }, transaction },
        );
        // Other tables' copies of the name, both keyed on their own `schoolid`:
        // the class list payload (`standards`) and the Fees Collection list
        // (`schoolcontributedata`), which shows its own column.
        await standards.update(
          { schoolname: tempdt.schoolname },
          { where: { schoolid: tempdt.schoolid }, transaction },
        );
        await schoolcontributedata.update(
          { schoolname: tempdt.schoolname },
          { where: { schoolid: tempdt.schoolid }, transaction },
        );
      }
      await transaction.commit();
      return tempdt;
    } catch (e) {
      await rollbackQuietly(transaction);
      throw e;
    }
  };
  deleteschool = async (schoolid: string, user: LmsUserToken, org: OrgContext) => {
    const tempdt = await findOwnedSchool(org, schoolid);
    tempdt.isdeleted = true;
    tempdt.deleted_at = new Date();
    tempdt.deleted_by = user.lmsuserid;
    await tempdt.save({ fields: ["isdeleted", "deleted_at", "deleted_by"] });
    return true;
  };
  isexistsschoolName = async (school: Omit<schoolsAttributes, "organisationid">) => {
    const where: WhereOptions<schoolsAttributes> = {
      schoolname: school.schoolname,
      isdeleted: false,
    };
    if ((school.schoolid ?? "").trim().length > 0) {
      where.schoolid = {
        [Op.not]: school.schoolid,
      };
    }
    const tempdt = await schools.count({ where });
    return tempdt > 0;
  };

  isexistsschoolID = async (schoolid: string) => {
    const where: WhereOptions<schoolsAttributes> = {
      schoolid,
      isdeleted: false,
    };
    const tempdt = await schools.count({ where });
    return tempdt > 0;
  };

  schoolstudentexists = async (schoolid: string) => {
    const where: WhereOptions<schoolsAttributes> = {
      schoolid,
      isdeleted: false,
    };
    const tempdt = await schools.findOne({ where });

    if (!tempdt) {
      return false;
    }
    const count = await new StudentBusiness().getstudentcountbyschool(
      tempdt.schoolid
    );

    return count > 0;
  };

  getschoolcurriculums = async (schoolid: string, curriculumids: Array<string>) => {
    const data: Array<SchoolCurriculumBase> = [];
    for (const curriculumid of curriculumids) {
      const curriculum = await new CurriculumBusiness().getCurriculumbyid(curriculumid);
      data.push({
        schoolid: schoolid,
        curriculumid: curriculumid,
        curriculumname: curriculum?.curriculumname as string
      })
    }
    return data;
  }

  getSchools = async () => {
    const where: WhereOptions<schoolsAttributes> = {
      //isdeleted: false,
    };
    const order = ["schoolname"];

    return await schools.findAll({ where, order });
  };
}
