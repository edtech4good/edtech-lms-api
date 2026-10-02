/* eslint-disable @typescript-eslint/no-explicit-any */
import { lmsusers, lmsusersAttributes } from "../models/data-models/init-models"
import { Role } from '../models/enums';
import { ApiError } from 'src/models/ApiError';
import { ErrorCode } from 'src/models/enums/errorcode.enum';
import { hashPassword } from 'src/services/password.service';
import { v4 as uuidv4 } from 'uuid';
import { TokenBusiness } from './token.business';
import { WhereOptions } from "sequelize/types";
import { Transaction } from "sequelize";
import { roles } from "src/models/data-models/roles";
import { permissions } from "src/models/data-models/permissions";
import { IPaging } from "src/models/IPaging";
import { buildWhere } from "src/services/util.service";
import { LmsUserToken } from "src/models/token.model";
import { dbinstance } from "src/services/dbservice";
import { OrgContext } from "src/decorators/org.decorator";
import {
  assertMayAddRoles,
  assertMayModifyUser,
  assertMayModifyUserId,
  assertMaySetRoles,
  heldRoleIds,
  holdsSuperAdmin,
  resolveRequestedRoles,
  revokeStaffSessions,
  sameRoleSet,
} from "./session-revocation";
import { Logger } from "src/config";
import { isSameEmailAddress } from "src/services/email-address";
import { RolePermissionBusiness } from "./role-permission.business";
import { andOwned, findOwned, scopeOf } from "./org-scope";
import { organisationAfterChange, organisationForNewAccount } from "./staff-organisation";
import { organisations } from "src/models/data-models/organisations";

export class UserBusiness {

  createUser = async (user: lmsusersAttributes, lmsuserroles: string[] | undefined, currentuser: LmsUserToken | undefined, org: OrgContext) => {
    // `user.organisationid` is what the request asked for: undefined when the
    // key was not sent. What the account actually gets is decided below.
    const requestedOrganisationid = user.organisationid;
    scopeOf(org); // fail closed before anything else
    const transaction = await dbinstance.getdbinstance().transaction();
    try {
      // The roles are resolved to database rows first (400 unless every
      // requested id is exactly an existing role), and the Super Admin rule is
      // applied to those rows with the organisation the account will get.
      // Nothing has been written when any of this refuses.
      const rls = await resolveRequestedRoles(lmsuserroles, "lmsuserroles", transaction);
      const holdsSuperAdminAfter = rls.some((r) => r.roleid === Role.superadmin);
      user.organisationid = await organisationForNewAccount({
        org,
        requested: requestedOrganisationid,
        holdsSuperAdmin: holdsSuperAdminAfter,
        transaction,
      });
      assertMaySetRoles({
        caller: org,
        hadSuperAdmin: false,
        newRoles: rls,
        targetOrganisationid: user.organisationid,
      });
      // On create every role is an addition: each must be one the caller may add.
      await assertMayAddRoles({ caller: org, currentRoleIds: [], newRoles: rls, transaction });
      user.lmsuserid = uuidv4();
      user.lmsuserpasswordhash = hashPassword(user.lmsuserpasswordhash);
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
      await createduser.setRoles(rls, {transaction});
      await transaction.commit();
      // Freshly hashed above so it can be written; must not ride along in
      // the response.
      (createduser as any).setDataValue('lmsuserpasswordhash', undefined);
      return createduser
    } catch (e) {
        await transaction.rollback();
        throw e;
    }
  };
  /**
   * The enabled accounts a password-reset or verification-email request names:
   * accounts whose stored address IS the given address (isSameEmailAddress),
   * not merely one the database finds close to it.
   */
  private static accountsNamedByAddress = async (address: string, includeDisabled: boolean) => {
    const candidates = await lmsusers.findAll({
      where: includeDisabled ? { lmsusername: address } : { lmsusername: address, isdisabled: false },
    });
    return candidates.filter((user) => isSameEmailAddress(user.lmsusername, address));
  };

  /**
   * The one enabled account whose stored address is the given address, or null.
   * Null as well when the address matches no account, matches only loosely
   * (not the same text), or matches more than one account (nothing is acted on
   * then; the event is logged without the address).
   */
  getuserforemailrequest = async (address: string) => {
    const matches = await UserBusiness.accountsNamedByAddress(address, false);
    if (matches.length > 1) {
      Logger.warn("An email request matched more than one account; no action was taken");
      return null;
    }
    return matches[0] ?? null;
  };

  /** Is exactly one account (enabled or not) stored under the given address? Same comparison as above. */
  isemailregisteredforrequest = async (address: string) => {
    const matches = await UserBusiness.accountsNamedByAddress(address, true);
    if (matches.length > 1) {
      Logger.warn("An email request matched more than one account; no action was taken");
    }
    return matches.length === 1;
  };

  isemailtaken = async (lmsusername: string, excludeuserid?: string) => {
    let where: any = { lmsusername };
    if (excludeuserid) {
      where = { ...where, lmsuserid: { $ne: excludeuserid } };
    }
    const user = await lmsusers.findOne({ where });
    return !!user;
  };
  /**
   * One account within the caller's scope, as plain data. An account in another
   * organisation, or a platform account asked for by an organisation's caller,
   * is the same 404 as an id that does not exist.
   */
  getuserscoped = async (lmsuserid: string, org: OrgContext) => {
    const user = await findOwned(lmsusers, lmsuserid, org, {
      notFound: () => new ApiError(ErrorCode.NOT_FOUND, "That user doesn't exist."),
    });
    return user.get({ plain: true });
  };
  getuser = async (lmsuserid: any) => {
    const _user = await lmsusers.findOne({ where: { lmsuserid } });
    if (_user) {
      return _user.get({ plain: true });
    }

    // NOT_FOUND, not SIGN_IN_REQUIRED: the id here is often admin-supplied
    // (EditUser/DeleteUser validators), and a 401 would sign the ADMIN out
    // of lms-ui for editing a user that no longer exists. Token-derived
    // callers (auth.business, auth.controller) map this to SIGN_IN_REQUIRED.
    throw new ApiError(ErrorCode.NOT_FOUND, "That user doesn't exist.");
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

  disableuserbyid = async (lmsuserid: string, org: OrgContext) => {
    scopeOf(org);
    const transaction = await dbinstance.getdbinstance().transaction();
    try {
      const lmsuser = await findOwned(lmsusers, lmsuserid, org, {
        transaction,
        lock: Transaction.LOCK.UPDATE,
        notFound: () => new ApiError(ErrorCode.NOT_FOUND, "That user doesn't exist."),
      });
      const hadSuperAdmin = await holdsSuperAdmin(lmsuser, transaction);
      assertMayModifyUser({ caller: org, targetHoldsSuperAdmin: hadSuperAdmin });
      // Deleting a user clears every role, Super Admin included.
      assertMaySetRoles({ caller: org, hadSuperAdmin, newRoles: [], targetOrganisationid: lmsuser.organisationid });
      lmsuser.isdisabled = true;
      await lmsuser.save({fields: ['isdisabled'], transaction});
      await lmsuser.setRoles([], {transaction});
      // A disabled user's sessions end whatever roles they held.
      await revokeStaffSessions(lmsuser.lmsuserid, transaction);
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

  // updateuserbasic, activateuser and deactivateuser change another user's row.
  // No route calls them today; they take the caller so that one that does is
  // held to the same rule as the user routes.
  updateuserbasic = async (user: lmsusers, org: OrgContext) => {
    await assertMayModifyUserId(user.lmsuserid, org);
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

  // Called with the account named by a change-password token that was emailed
  // to that account: the token is the proof, there is no other caller.
  updatepassword = async (lmsuserid: string, password: string) => {
    const _user = await this.getuser(lmsuserid);
    _user.lmsuserpasswordhash = hashPassword(password);
    const localuser = await this.updateuser(_user, { lmsuserid });
    const tokenbusiness = new TokenBusiness();
    await tokenbusiness.clearChangePasswordToken(lmsuserid);
    return localuser;
  };
  private updateuser = async (_user: lmsusersAttributes, where: WhereOptions<lmsusersAttributes>) => {
    return lmsusers.update(_user, { where });
  }
  activateuser = async (lmsuserid: string, org: OrgContext) => {
    await assertMayModifyUserId(lmsuserid, org);
    const _user = await this.getuser(lmsuserid);
    _user.isdisabled = false;
    return lmsusers.update(_user, { where: { lmsuserid } });
  };
  deactivateuser = async (lmsuserid: string, org: OrgContext) => {
    await assertMayModifyUserId(lmsuserid, org);
    const _user = await this.getuser(lmsuserid);
    _user.isdisabled = true;
    return lmsusers.update(_user, { where: { lmsuserid } });
  };
  // Called with the account named by an email-verification token: the token is
  // the proof, there is no other caller.
  userverifyemail = async (userid: string) => {
    const _user = await this.getuser(userid);
    _user.isverified = true;
    const localuser = lmsusers.update(_user, { where: { lmsuserid: userid } });
    const tokenbusiness = new TokenBusiness();
    await tokenbusiness.clearVerifyEmailToken(userid);
    return localuser;
  };
  getusersall = async (paging: IPaging, org: OrgContext) => {
    let where: WhereOptions<lmsusersAttributes> = {
      isdisabled: false
    };

    const order = ["lmsusername"];
    const limit = paging.pagesize || 20;
    let offset = 0;
    if ((paging.pageindex || 1) > 1) {
      offset = limit * ((paging.pageindex || 1) - 1);
    }
    // The caller's scope is ANDed with everything else, the filter included, so
    // nothing in the request can widen it: an organisation's caller lists only
    // its own staff, and counts only those.
    const scopedwhere = andOwned({ ...buildWhere<lmsusersAttributes>(paging, where) }, org);

    const users = await lmsusers.findAndCountAll(
      {
        where: scopedwhere, order, limit, offset,
        distinct: true,
        attributes: { exclude: ["lmsuserpasswordhash"] },
        include: [
          {
            model: roles,
            attributes: ['rolename'],
            through: {attributes: []}
          },
          {
            model: organisations,
            as: "organisation",
            attributes: ["organisationid", "organisationname"],
            required: false,
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

  getlmsuserbyid = async (lmsuserid: string, org: OrgContext) => {
    const user = await findOwned(lmsusers, lmsuserid, org, {
      attributes: { exclude: ["lmsuserpasswordhash"] },
      include: [{
        model: roles,
        attributes: ["roleid", "rolename"],
        through: {attributes: []},
        include: [{
          model: permissions,
          attributes: ["permissionid", "permissionname"],
          through: {attributes: []}
        }]
      }, {
        model: organisations,
        as: "organisation",
        attributes: ["organisationid", "organisationname"],
        required: false,
      }],
      notFound: () => new ApiError(ErrorCode.NOT_FOUND, "That user doesn't exist."),
    });
    const allroles = await new RolePermissionBusiness().getallroles(org);
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

  updateUser = async (usr: lmsusersAttributes, lmsuserroles: string[], currentuser: LmsUserToken | undefined, org: OrgContext) => {
    // `usr.organisationid` is what the request asked for (undefined: not sent).
    const requestedOrganisationid = usr.organisationid;
    scopeOf(org);
    const transaction = await dbinstance.getdbinstance().transaction();
    try {
      // A user outside the caller's scope is a 404, whatever else is wrong.
      const user = await findOwned(lmsusers, usr.lmsuserid, org, {
        transaction,
        lock: Transaction.LOCK.UPDATE,
        notFound: () => new ApiError(ErrorCode.NOT_FOUND, "That user doesn't exist."),
      });
      // Every refusal below happens before the first write, so a refused
      // request leaves the user exactly as it was.
      //  1. a caller who is not platform may not touch a Super Admin account at
      //     all, whatever fields the request changes;
      //  2. the requested roles must all exist (400, no partial save);
      //  3. only a platform caller changes the organisation; the resulting
      //     organisation is checked (live, locked) and the Super Admin rule is
      //     applied with it.
      const roleIdsBefore = await heldRoleIds(user, transaction);
      const hadSuperAdmin = roleIdsBefore.includes(Role.superadmin);
      assertMayModifyUser({ caller: org, targetHoldsSuperAdmin: hadSuperAdmin });
      const rls = await resolveRequestedRoles(lmsuserroles, "lmsuserroles", transaction);
      const willHoldSuperAdmin = rls.some((r) => r.roleid === Role.superadmin);
      const after = await organisationAfterChange({
        org,
        requested: requestedOrganisationid,
        current: user.organisationid ?? null,
        hadSuperAdmin,
        willHoldSuperAdmin,
        transaction,
      });
      assertMaySetRoles({
        caller: org,
        hadSuperAdmin,
        newRoles: rls,
        targetOrganisationid: after.organisationid,
      });
      // Roles the account does not hold now must be ones the caller may add.
      await assertMayAddRoles({ caller: org, currentRoleIds: roleIdsBefore, newRoles: rls, transaction });
      user.lmsusername = usr.lmsusername;
      user.lmsuserpasswordhash = usr.lmsuserpasswordhash ? hashPassword(usr.lmsuserpasswordhash) : user.lmsuserpasswordhash;
      user.countries = usr.countries;
      user.schools = usr.schools;
      const fields: Array<keyof lmsusersAttributes> = ['lmsusername', 'lmsuserpasswordhash', 'countries', 'schools', 'updated_at', 'updated_by'];
      if (after.changed) {
        user.organisationid = after.organisationid;
        fields.push('organisationid');
      }
      if(currentuser){
        user.updated_at = new Date();
        user.updated_by = currentuser.lmsuserid;
      }
      await user.save({ fields, transaction});
      await user.setRoles(rls, {transaction});
      // A changed role SET, or a move to another organisation, ends the account's
      // sessions (once), in this transaction. An edit that changes neither ends
      // nothing. (The per-request check already refuses a moved account's old
      // token; the rows go too.)
      const rolesChanged = !sameRoleSet(roleIdsBefore, rls.map((r) => r.roleid));
      if (rolesChanged || after.changed) {
        await revokeStaffSessions(user.lmsuserid, transaction);
      }
      await transaction.commit();
      // The hash is loaded above (old or newly-set) so it can be preserved
      // or written on save; it must not ride along in the response.
      (user as any).setDataValue('lmsuserpasswordhash', undefined);
      return user
    } catch (e) {
        await transaction.rollback();
        throw e;
    }
  };
}
