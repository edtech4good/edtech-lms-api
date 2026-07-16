/* eslint-disable @typescript-eslint/no-explicit-any */
import { lmsusers, lmsusersAttributes } from "../models/data-models/init-models"
import { Role } from '../models/enums';
import { BadRequestException } from '@nestjs/common';
import md5 from 'crypto-js/md5';
import { v4 as uuidv4 } from 'uuid';
import { TokenBusiness } from './token.business';
import { WhereOptions } from "sequelize/types";
import { roles } from "src/models/data-models/roles";
import { permissions } from "src/models/data-models/permissions";
import { IPaging } from "src/models/IPaging";
import { buildWhere } from "src/services/util.service";
import { LmsUserToken } from "src/models/token.model";
import { dbinstance } from "src/services/dbservice";
import { RolePermissionBusiness } from "./role-permission.business";

export class UserBusiness {

  createUser = async (user: lmsusersAttributes, lmsuserroles?: string[], currentuser?: LmsUserToken) => {
    const transaction = await dbinstance.getdbinstance().transaction();
    try {
      user.lmsuserid = uuidv4();
      user.lmsuserpasswordhash = md5(user.lmsuserpasswordhash).toString();
      // LEGACY, and not a claim about this user. The column is NOT NULL so it
      // must be written, but authorization reads `lmsusers_roles` (via the
      // token's lmsuserroles) — never this. It said `superadmin` for every
      // account while AccessGuard still trusted it, which is how a
      // zero-permission user could reach admin-only endpoints; see
      // docs/authorization-model.md. Do not reintroduce a check on it. It
      // wants dropping in its own migration, once the clients that read it
      // from the JWT are off it.
      user.lmsuserrole = Role.superadmin;
      user.isverified = user.isverified || false;
      user.isdisabled = user.isdisabled || false;
      if(currentuser){
        user.created_by = currentuser.lmsuserid;
      }
      const createduser = await lmsusers.create(user, { transaction });
      const rls = await roles.findAll({
        where: { roleid: lmsuserroles }
      });
      if(rls.length === lmsuserroles?.length) {
        await createduser.setRoles(rls, {transaction});
      }
      await transaction.commit();
      return createduser
    } catch (e) {
        await transaction.rollback();
        throw e;
    }
  };
  isemailtaken = async (lmsusername: string, excludeuserid?: string) => {
    let where: any = { lmsusername };
    if (excludeuserid) {
      where = { ...where, lmsuserid: { $ne: excludeuserid } };
    }
    const user = await lmsusers.findOne({ where });
    return !!user;
  };
  getuser = async (lmsuserid: any) => {
    const _user = await lmsusers.findOne({ where: { lmsuserid } });
    if (_user) {
      return _user.get({ plain: true });
    }

    throw new BadRequestException('Please authenticate');
  };

  /**
   * The RBAC roles a user actually holds, with the permissions behind them.
   *
   * `roleid` is not decoration: it is the value the `Role` enum is built from,
   * so it is what AccessGuard compares against. Loading only `rolename` leaves
   * the token unable to say which roles its bearer has.
   */
  private static rolesInclude = {
    model: roles,
    attributes: ["roleid", "rolename"],
    through: { attributes: [] },
    include: [{
      model: permissions,
      attributes: ["permissionname"],
      through: { attributes: [] }
    }]
  };

  /**
   * Loads roles because token generation needs them. Without them,
   * `generateAuthToken` calls `roles.forEach` on undefined and throws, which
   * `refreshAuth` swallows into "Please authenticate" — so before this, every
   * non-superadmin was silently logged out the first time their token
   * refreshed. Superadmin never noticed: the isSuperAdmin username check skips
   * that branch entirely.
   */
  getuserbyid = (lmsuserid: string) => {
    return lmsusers.findOne({
      where: { lmsuserid },
      include: [UserBusiness.rolesInclude],
    });
  };

  disableuserbyid = async (lmsuserid: string) => {
    const transaction = await dbinstance.getdbinstance().transaction();
    try {
      const lmsuser = await lmsusers.findOne({ where: { lmsuserid } });
      if(lmsuser) {
        lmsuser.isdisabled = true;
        await lmsuser.save({fields: ['isdisabled'], transaction});
        await lmsuser.setRoles([], {transaction});
      }
      await transaction.commit();
    } catch (e) {
        await transaction.rollback();
        throw e;
    }
  };

  getuserbyemail = (lmsusername: string) => {
    return lmsusers.findOne({
      where: { lmsusername, isdisabled: false },
      include: [UserBusiness.rolesInclude]
    });
  };

  updateuserbasic = async (user: lmsusers) => {
    const _user = await this.getuser(user.lmsuserid);
    _user.firstname = user.firstname;
    _user.lastname = user.lastname;
    return this.updateuser(_user, { lmsuserid: user.lmsuserid });
  };

  userRetrieveRolePerm = async (user: lmsusers) => {
    user.roles = await user.getRoles();
    // for(const role of user.roles) {
    //   role.permissions = await user
    // }
  }

  updatepassword = async (lmsuserid: string, password: string) => {
    const _user = await this.getuser(lmsuserid);
    _user.lmsuserpasswordhash = md5(password).toString();
    const localuser = await this.updateuser(_user, { lmsuserid });
    const tokenbusiness = new TokenBusiness();
    await tokenbusiness.clearChangePasswordToken(lmsuserid);
    return localuser;
  };
  private updateuser = async (_user: lmsusersAttributes, where: WhereOptions<lmsusersAttributes>) => {
    return lmsusers.update(_user, { where });
  }
  activateuser = async (lmsuserid: string) => {
    const _user = await this.getuser(lmsuserid);
    _user.isdisabled = false;
    return lmsusers.update(_user, { where: { lmsuserid } });
  };
  deactivateuser = async (lmsuserid: string) => {
    const _user = await this.getuser(lmsuserid);
    _user.isdisabled = true;
    return lmsusers.update(_user, { where: { lmsuserid } });
  };
  userverifyemail = async (userid: string) => {
    const _user = await this.getuser(userid);
    _user.isverified = true;
    const localuser = lmsusers.update(_user, { where: { lmsuserid: userid } });
    const tokenbusiness = new TokenBusiness();
    await tokenbusiness.clearVerifyEmailToken(userid);
    return localuser;
  };
  sanitizeUser = (user: any) => ({
    ...user,
    _id: null,
    passwordhash: null,
  });

  getusersall = async (paging: IPaging) => {
    let where: WhereOptions<lmsusersAttributes> = {
      isdisabled: false
    };

    const order = ["lmsusername"];
    const limit = paging.pagesize || 20;
    let offset = 0;
    if ((paging.pageindex || 1) > 1) {
      offset = limit * ((paging.pageindex || 1) - 1);
    }
    where = { ...buildWhere<lmsusersAttributes>(paging, where) };

    const users = await lmsusers.findAndCountAll(
      { 
        where, order, limit, offset,
        include: [
          {
            model: roles,
            attributes: ['rolename'],
            through: {attributes: []}
          }
        ]
      }
    ).then(users => {
      users.rows = users.rows.map(user => {
        const str = user.roles.map(role => role.rolename).join(", ") ?? '';
        user.setDataValue('formattedroles', str);
        return user
      });
      return users
    });
    return users
  };

  getlmsuserbyid = async (lmsuserid: string) => {
    const user = await lmsusers.findOne({ 
      where: { lmsuserid },
      include: [{
        model: roles,
        attributes: ["roleid", "rolename"],
        through: {attributes: []},
        include: [{
          model: permissions,
          attributes: ["permissionid", "permissionname"],
          through: {attributes: []}
        }]
      }]
    });
    const allroles = await new RolePermissionBusiness().getallroles();
    if(user) {
      const roles = allroles.filter(function (o1) {
        const matched = user.roles.some(function (o2) {
          return o1.id === o2.roleid; // return the ones with equal id
        });
        if(matched) {
          o1.checked = true;
        }
        return true;
      });
      return { user, roles}
    }
  };

  updateUser = async (usr: lmsusersAttributes, lmsuserroles?: string[], currentuser?: LmsUserToken) => {
    const transaction = await dbinstance.getdbinstance().transaction();
    try {
      const user = await lmsusers.findOne({
        where: { lmsuserid: usr.lmsuserid }
      });
      if(user) {
        user.lmsusername = usr.lmsusername;
        user.lmsuserpasswordhash = usr.lmsuserpasswordhash ? md5(usr.lmsuserpasswordhash).toString() : user.lmsuserpasswordhash;
        user.countries = usr.countries;
        user.schools = usr.schools;
        if(currentuser){
          user.updated_at = new Date();
          user.updated_by = currentuser.lmsuserid;
        }
        await user.save({ fields: ['lmsusername', 'lmsuserpasswordhash', 'countries', 'schools', 'updated_at', 'updated_by'], transaction});
        const rls = await roles.findAll({
          where: { roleid: lmsuserroles }
        });
        if(rls.length === lmsuserroles?.length) {
          await user.setRoles(rls, {transaction});
        }
        await transaction.commit();
        return user
      }
    } catch (e) {
        await transaction.rollback();
        throw e;
    }
  };
}
