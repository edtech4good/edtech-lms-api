/* eslint-disable @typescript-eslint/no-explicit-any */
import { Op, WhereOptions } from "sequelize";
import { IPaging } from "src/models/IPaging";
import { LmsUserToken } from "src/models/token.model";
import { buildWhere } from "src/services/util.service";
import { v4 as uuidv4 } from "uuid";
import {
  countries,
  countriesAttributes,
} from "../models/data-models/init-models";
import { OrgContext } from "src/decorators/org.decorator";
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { SchoolBusiness } from "./school.business";
import { andLinkedCountries } from "./school-scope";

export class CountryBusiness {
  createcountry = async (country: countriesAttributes, user: LmsUserToken) => {
    country.countryid = uuidv4();
    country.isdeleted = false;
    country.created_by = user.lmsuserid;
    return await countries.create(country);
  };
  getcountrybyid = (countryid: string) =>
    countries.findOne({ where: { countryid, isdeleted: false } });
  /** One country the caller's organisation is linked to; unknown or not linked: 404. */
  getOwnedCountry = async (org: OrgContext, countryid: string) => {
    const country = await countries.findOne({
      where: await andLinkedCountries({ countryid, isdeleted: false }, org),
    });
    if (!country) {
      throw new ApiError(ErrorCode.NOT_FOUND, "That country doesn't exist.");
    }
    return country;
  };
  getcountryall = async (paging: IPaging, org: OrgContext) => {
    let where: WhereOptions<countriesAttributes> = {
      isdeleted: false,
    };

    const order = ["countryname"];
    const limit = paging.pagesize || 20;
    let offset = 0;
    if ((paging.pageindex || 1) > 1) {
      offset = limit * ((paging.pageindex || 1) - 1);
    }
    // The caller's countries are ANDed on the outside: a filter (which builds its own `Op.and`) cannot replace them.
    where = await andLinkedCountries({ ...buildWhere<countriesAttributes>(paging, where) }, org);

    return await countries.findAndCountAll({ where, order, limit, offset });
  };
  /** The countries the caller's organisation is linked to (every country for the platform). */
  getAllcountries = async (org: OrgContext) => {
    const where: WhereOptions<countriesAttributes> = {
      isdeleted: false,
    };
    return await countries.findAll({ where: await andLinkedCountries(where, org) });
  }
  /**
   * `scope` is the caller's organisation context: a staff token's own, or, for a school-user (teacher) token, the
   * organisation that owns the teacher's school (`schoolUserOrgContext`). `null` is a caller in scope of no
   * organisation (a teacher whose school belongs to none): nothing is linked to it, so the list is empty.
   */
  getCountriesWithFilter = async (countryname: string, user: LmsUserToken, scope: OrgContext | null) => {
    if (scope === null) {
      return [];
    }
    const where: WhereOptions<countriesAttributes> = {
      isdeleted: false,
      countryname: {
        [Op.like]: `%${countryname.trim()}%`
      }
    };
    const order = ["countryname"];

    if(user.countries && user.countries.length > 0) {
      where.countryid = {
        [Op.in]: user.countries
      }
    }

    return await countries.findAll({
      where: await andLinkedCountries(where, scope),
      order,
    });
  };
  getcountryname = (countryname: string) =>
    countries.findOne({ where: { countryname, isdeleted: false } });
  updatecountryName = async (country: countriesAttributes, user: LmsUserToken) => {
    const tempdt = await this.getcountrybyid(country.countryid);
    if (tempdt) {
      tempdt.countryname = country.countryname;
      tempdt.expectedusage = country.expectedusage ?? 0;
      tempdt.updated_at = new Date();
      tempdt.updated_by = user.lmsuserid;
      await tempdt.save({ fields: ["countryname", "expectedusage", "updated_at", "updated_by"] });
      //await tempdt.reload();
      return tempdt;
    } else {
      return null;
    }
  };
  deletecountry = async (countryid: string, user: LmsUserToken) => {
    const tempdt = await this.getcountrybyid(countryid);
    if (tempdt) {
      tempdt.isdeleted = true;
      tempdt.deleted_at = new Date();
      tempdt.deleted_by = user.lmsuserid;
      await tempdt.save({ fields: ["isdeleted", "deleted_at", "deleted_by"] });
      return true;
    } else {
      return false;
    }
  };
  isexistscountryName = async (country: countriesAttributes) => {
    const where: WhereOptions<countriesAttributes> = {
      countryname: country.countryname,
      isdeleted: false,
    };
    if ((country.countryid ?? "").trim().length > 0) {
      where.countryid = {
        [Op.not]: country.countryid,
      };
    }
    const tempdt = await countries.count({ where });
    return tempdt > 0;
  };

  isexistscountryID = async (countryid: string) => {
    const where: WhereOptions<countriesAttributes> = {
      countryid,
      isdeleted: false,
    };
    const tempdt = await countries.count({ where });
    return tempdt > 0;
  };

  countryIsBinded = async (countryid: string) => {
    const where: WhereOptions<countriesAttributes> = {
      countryid,
      isdeleted: false,
    };
    const tempdt = await countries.findOne({ where });

    const count = await new SchoolBusiness().getschoolsbycountry(
      tempdt?.countryid || ""
    );

    return count.length > 0;
  };
}
