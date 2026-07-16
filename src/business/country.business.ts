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
import { SchoolBusiness } from "./school.business";

export class CountryBusiness {
  createcountry = async (country: countriesAttributes, user: LmsUserToken) => {
    country.countryid = uuidv4();
    country.isdeleted = false;
    country.created_by = user.lmsuserid;
    return await countries.create(country);
  };
  getcountrybyid = (countryid: string) =>
    countries.findOne({ where: { countryid, isdeleted: false } });
  getcountryall = async (paging: IPaging) => {
    let where: WhereOptions<countriesAttributes> = {
      isdeleted: false,
    };

    const order = ["countryname"];
    const limit = paging.pagesize || 20;
    let offset = 0;
    if ((paging.pageindex || 1) > 1) {
      offset = limit * ((paging.pageindex || 1) - 1);
    }
    where = { ...buildWhere<countriesAttributes>(paging, where) };

    return await countries.findAndCountAll({ where, order, limit, offset });
  };
  getAllcountries = async () => {
    const where: WhereOptions<countriesAttributes> = {
      isdeleted: false,
    };
    return await countries.findAll({ where });
  }
  getCountriesWithFilter = async (countryname: string, user: LmsUserToken) => {
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

    return await countries.findAll({ where, order });
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

  getCountries = async () => {
    const where: WhereOptions<countriesAttributes> = {
      //isdeleted: false,
    };
    const order = ["countryname"];

    return await countries.findAll({ where, order });
  };
}
