import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
// import { col, fn } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { rolePermAttributes, roles, rolesAttributes } from "src/models/data-models/roles";
import { permissions } from "src/models/data-models/permissions";
import { BindRolePermissionRequest, BindUserRolesRequest } from "src/modules/role-permission/models/RoleRequest";
import { Op, Transaction, WhereOptions } from "sequelize";
import { lmsusers } from "src/models/data-models/lmsusers";
import { permissionstitle } from "src/models/data-models/permissionstitle";
import { NodeLeaf, TreeNode } from "src/modules/role-permission/models/RoleBase";
import _ from "lodash";
import { dbinstance, rollbackQuietly } from "src/services/dbservice";
import {
  assertMayAddRoles,
  assertMayModifyUser,
  assertMaySetRoles,
  heldRoleIds,
  resolveRequestedRoles,
  revokeIfRolesChanged,
  rolesCallerMayAdd,
} from "./session-revocation";
import { Role } from "src/models/enums";
import { OrgContext } from "src/decorators/org.decorator";
import { findOwned, scopeOf } from "./org-scope";
import { organisationAfterChange } from "./staff-organisation";
import { SUPERADMIN } from "src/models/enums/permissions.enum";
import { LmsUserToken } from "src/models/token.model";
import { IMultiPaging } from '../models/IPaging';
import { constructWhere } from '../services/util.service';

export class RolePermissionBusiness {

    isexistsroleID = async (roleid: string) => {
        const where: WhereOptions<rolesAttributes> = {
            roleid,
        };
        const tempdt = await roles.count({ where });
        return tempdt > 0;
    };

    isexistsroleName = async (role: rolesAttributes) => {
        const where: WhereOptions<rolesAttributes> = {
          rolename: role.rolename,
        };
        if ((role.roleid ?? "").trim().length > 0) {
          where.roleid = {
            [Op.not]: role.roleid,
          };
        }
        const tempdt = await roles.count({ where });
        return tempdt > 0;
    };

    createRole = async (role: rolesAttributes, user: LmsUserToken) => {
        role.roleid = uuidv4();
        role.created_by = user.lmsuserid;
        const transaction = await dbinstance.getdbinstance().transaction();
        try {
            const rl = await roles.create(role as any, { transaction });
            await this.bindRolePerms({roleid: role.roleid, permissionsid: role.perms ?? []}, rl, transaction);
            await transaction.commit();
            return rl;
        } catch (e) {
            await transaction.rollback();
            throw e;
        }
    };

    updateRole = async (role: rolesAttributes, user: LmsUserToken) => {
        const transaction = await dbinstance.getdbinstance().transaction();
        try {
            const rl = await roles.findOne({
                where: { roleid: role.roleid }
            });
            if(rl) {
                rl.rolename = role.rolename;
                rl.updated_at = new Date();
                rl.updated_by = user.lmsuserid;
                await rl.save({ fields: ['rolename', 'updated_at', 'updated_by'], transaction});
                await this.bindRolePerms({roleid: rl.roleid, permissionsid: role.perms ?? []}, rl, transaction);
                await transaction.commit();
                return rl;
            } else {
                throw new ApiError(ErrorCode.NOT_FOUND, "That role doesn't exist.");
            }
        } catch (e) {
            await transaction.rollback();
            throw e;
        }
    };

    // Removed 16 Jul 2026 with the create-perm/:key endpoints that were their
    // only callers: createPerm, createAllPerms, createOnePerm. They created
    // permission rows at runtime; createOnePerm in particular could add an
    // arbitrary permission and so strip the count-based `superadmin` wildcard
    // from every Super Admin. Permission seeding now lives solely in the
    // idempotent migrations (20260407120500 + 20260716140000).

    /**
     * The roles a caller is offered. A platform caller who is not acting as an
     * organisation sees every role. A caller in an organisation's scope (its
     * staff, or a platform user acting as it) sees only the roles it could add to
     * an account (`rolesCallerMayAdd`), so a form built from this list offers
     * nothing the API would refuse; Super Admin is never among them. The scope
     * and the caller's permissions come from the validated token (`@Org()`),
     * never from the request; with no scope the call is refused (403).
     */
    getallRoles = async (paging: IMultiPaging, org: OrgContext) => {
        const scoped = scopeOf(org).kind === "organisation";
        let where: WhereOptions<rolesAttributes> = {
            // isdeleted: false,
        };
    
        const order = ["rolename"];
        const limit = paging.pagesize || 20;
        let offset = 0;
        if ((paging.pageindex || 1) > 1) {
        offset = limit * ((paging.pageindex || 1) - 1);
        }
        where = { ...constructWhere<rolesAttributes>(paging, where) };
        if (scoped) {
            const allowed = await rolesCallerMayAdd(org, await roles.findAll());
            // ANDed, so no filter in the request can bring another role back.
            where = { [Op.and]: [where, { roleid: { [Op.in]: [...allowed] } }] };
        }

        return await roles.findAndCountAll({ where, order, limit, offset });
    }

    /** The id/text list the staff forms use. Same visibility rule as `getallRoles`. */
    getallroles = async (org: OrgContext) => {
        const scoped = scopeOf(org).kind === "organisation";
        const all = await roles.findAll();
        // The set holds stored ids and is compared exactly: the database compares ids without regard to case.
        const allowed = scoped ? await rolesCallerMayAdd(org, all) : undefined;
        const rls = allowed ? all.filter((rl) => allowed.has(rl.roleid)) : all;
        const formatedroles = rls.map(rl => {
            return {
                id: rl.roleid,
                text: rl.rolename,
                checked: false
            }
        })
        return formatedroles
    }

    getRolebyid = async (roleid: string, org: OrgContext) => {
        const hideSuperAdmin = scopeOf(org).kind === "organisation";
        const found = await roles.findOne({
            where: { roleid },
            attributes: ['roleid', 'rolename'],
            include: [
                {
                    model: permissions,
                    attributes: ['permissionid', 'permissionname'],
                    include: [
                        {
                            model: permissionstitle,
                            attributes: ['permissiontitleid', 'permissiontitle']
                        }
                    ],
                    through: {attributes: []}
                }
            ]
        });
        const role = hideSuperAdmin && found?.roleid === Role.superadmin ? null : found;
        const permsNodes = await this.getallPermsNode();
        // source function: https://stackoverflow.com/a/64489535/14708196
        const groupBy = <T>(array: T[], predicate: (value: T, index: number, array: T[]) => string) =>
            array.reduce((acc, value, index, array) => {
                (acc[predicate(value, index, array)] ||= []).push(value);
                return acc;
            }, {} as { [key: string]: T[] });
        const selectedPerms: Array<string> = [];
        if(role) {
            const groupedProducts = groupBy(role.permissions, perm => perm.permissionstitle?.permissiontitleid);
            Object.entries(groupedProducts).forEach(([permtitleid, perms]) => {
                // const permtitle = perms[0]?.permissionstitle;
                // if(
                //     (permtitle.permissiontitle != 'Report' && perms.length >= NUMBER_OF_PERMISSIONS) ||
                //     (permtitle.permissiontitle === 'Report' && perms.length >= NUMBER_OF_REPORT_PERMISSIONS)
                // ) {
                //     selectedPerms.push(`all_${permtitleid}`);
                // } else {
                // }
                perms.forEach(perm => {
                    selectedPerms.push(perm.permissionid);
                });
            });
        }
        return { role, selectedPerms, permsNodes }
    }

    bindRolePerms = async (rolePerms: BindRolePermissionRequest, rl: roles, transaction: Transaction) => {
        // get permtitleid if select all perms
        const [all_perms, some_perms] =
        rolePerms.permissionsid.reduce((result: [string[], string[]], element) => {
            result[element.includes('all_') ? 0 : 1].push(element); // Determine and push to small/large arr
            return result;
        }, [[], []]);
        let perms: permissions[] = [];
        let perms1: permissions[] = [];
        let perms2: permissions[] = [];
        let perms3: permissions[] = [];
        if(some_perms.length > 0) {
            perms1 = await permissions.findAll({ where: { permissionid: { [Op.in]: some_perms} } });
        }
        if(all_perms.length > 0) {
            const permstitle = all_perms.map(ptid => ptid.substring(ptid.indexOf("_") + 1))
            perms2 = await this.checkParentRole(permstitle);
            perms3 = await permissions.findAll({
                include: [
                    {
                        model: permissionstitle,
                        where: { 
                            permissiontitleid: { [Op.in]: permstitle},
                            type: { [Op.or]: [1, 3] }
                        }
                    }
                ]
            });
            perms3 = _.union(perms2, perms3);
        }
        perms = _.union(perms1, perms3);
        const rolesPerms = await rl?.setPermissions(perms, { transaction }) as unknown as Array<rolePermAttributes>;
        return rolesPerms
    }

    checkParentRole = async (all_permstitle: string[]) => {
        const perms: Array<permissions> = [];
        await permissionstitle.findAll({
            where: { 
                permissiontitleid: { [Op.in]: all_permstitle},
                type: { [Op.or]: [2, 4] }
            },
        }).then(async permstitles => {
            for await (const permtitle of permstitles) {
                await permissionstitle.findAll({
                    where: { 
                        parentid: permtitle.permissiontitleid,
                        type: 4
                    },
                }).then(async permstitles => {
                    for await (const permtitle of permstitles) {
                        await permissionstitle.findAll({
                            where: { 
                                parentid: permtitle.permissiontitleid,
                                type: 3
                            },
                            include: [
                                {
                                    model: permissions
                                }
                            ]
                        }).then(async permstitles => {
                            for await (const permtitle of permstitles) {
                                perms.push(...permtitle.permissions);
                            }
                        });
                    }
                });
                await permissionstitle.findAll({
                    where: { 
                        parentid: permtitle.permissiontitleid,
                        type: 3
                    },
                    include: [
                        {
                            model: permissions
                        }
                    ]
                }).then(async permstitles => {
                    for await (const permtitle of permstitles) {
                        perms.push(...permtitle.permissions);
                    }
                });
                const itsperms = await permissions.findAll({
                    include: [
                        {
                            model: permissionstitle,
                            where: { 
                                permissiontitleid: permtitle.permissiontitleid,
                            }
                        }
                    ]
                });
                perms.push(...itsperms);
            }
        });
        return perms;
    }

    bindUserRoles = async (rolePerms: BindUserRolesRequest, org: OrgContext) => {
        // One transaction: the new role set and, if Super Admin is being
        // removed, the end of that user's sessions commit together. Every
        // refusal happens before the roles are touched.
        scopeOf(org);
        const transaction = await dbinstance.getdbinstance().transaction();
        try {
            // A user outside the caller's scope is a 404.
            const user = await findOwned(lmsusers, rolePerms.lmsuserid, org, {
                transaction,
                lock: Transaction.LOCK.UPDATE,
                notFound: () => new ApiError(ErrorCode.NOT_FOUND, "That user doesn't exist."),
            });
            const roleIdsBefore = await heldRoleIds(user, transaction);
            const hadSuperAdmin = roleIdsBefore.includes(Role.superadmin);
            // A caller who is not platform may not touch a Super Admin account.
            assertMayModifyUser({ caller: org, targetHoldsSuperAdmin: hadSuperAdmin });
            // 400 unless every requested role exists exactly as given.
            const selectedroles = await resolveRequestedRoles(rolePerms.rolesid, "rolesid", transaction);
            // Roles only: the organisation is not changed here, but a platform
            // account cannot be left with neither Super Admin nor an organisation.
            await organisationAfterChange({
                org,
                requested: undefined,
                current: user.organisationid ?? null,
                hadSuperAdmin,
                willHoldSuperAdmin: selectedroles.some((r) => r.roleid === Role.superadmin),
                transaction,
            });
            assertMaySetRoles({
                caller: org,
                hadSuperAdmin,
                newRoles: selectedroles,
                targetOrganisationid: user.organisationid,
            });
            // Roles the account does not hold now must be ones the caller may add.
            await assertMayAddRoles({ caller: org, currentRoleIds: roleIdsBefore, newRoles: selectedroles, transaction });
            const result = await user.setRoles(selectedroles, { transaction });
            // A changed role SET ends the account's sessions, in this transaction.
            await revokeIfRolesChanged(
                user.lmsuserid,
                roleIdsBefore,
                selectedroles.map((r) => r.roleid),
                transaction,
            );
            await transaction.commit();
            return result;
        } catch (e) {
            await rollbackQuietly(transaction);
            throw e;
        }
    }

    getallPerms = async () => {
        return await permissionstitle.findAll({
            attributes: [
                "permissiontitleid",
                "permissiontitle",
                "permissiondesc",
            ],
            include: {
                model: permissions
            }
        })
    }

    getallPermsNode = async () => {
        const permstitle = await permissionstitle.findAll({
            attributes: [
                "permissiontitleid",
                "permissiontitle",
                "permissiondesc",
                "permissiontitleorder",
                "type",
                "parentid",
            ],
            order: [['permissiontitleorder', 'ASC']],
            include: {
                model: permissions
            }
        });
        const formatperms: Array<TreeNode> = [];
        permstitle.filter(p => p.type !== 3 && p.type !== 4).forEach(permtitle => {
            if(permtitle.type === 2) {
                // children node
                const children: any = permstitle
                .filter(pst => pst.parentid === permtitle.permissiontitleid)
                // .sort((a,b) => a.permissiontitleorder - b.permissiontitleorder)
                .map(pt => {
                    let children: any;
                    if(pt.type === 4) {
                        children = permstitle.filter(pst => pst.parentid === pt.permissiontitleid).map(pt2 => {
                            const children: Array<NodeLeaf> = pt2?.permissions.map(perm => {
                                return <NodeLeaf>{
                                    title: perm.permissiondesc,
                                    key: perm.permissionid,
                                    isLeaf: true
                                }
                            });
                            return <TreeNode>{
                                title: pt2.permissiondesc,
                                key: 'all_' + pt2.permissiontitleid,
                                expanded: false,
                                children
                            }
                        });
                    } else {
                        children = pt?.permissions.map(perm => {
                            return <NodeLeaf>{
                                title: perm.permissiondesc,
                                key: perm.permissionid,
                                isLeaf: true
                            }
                        });
                    }
                    return <TreeNode>{
                        title: pt.permissiondesc,
                        key: 'all_' + pt.permissiontitleid,
                        expanded: false,
                        children
                    }
                });
                const permChildren: any = permtitle?.permissions.map(perm => {
                    return <NodeLeaf>{
                        title: perm.permissiondesc,
                        key: perm.permissionid,
                        isLeaf: true
                    }
                });
                formatperms.push(
                    <TreeNode>{
                        title: permtitle.permissiondesc,
                        key: 'all_' + permtitle.permissiontitleid,
                        expanded: false,
                        children: [...permChildren, ...children]
                    }
                )
            } else {
                // no children node
                const children: Array<NodeLeaf> = permtitle?.permissions.map(perm => {
                    return <NodeLeaf>{
                        title: perm.permissiondesc,
                        key: perm.permissionid,
                        isLeaf: true
                    }
                });
                formatperms.push(
                    <TreeNode> {
                        title: permtitle.permissiondesc,
                        key: 'all_' + permtitle.permissiontitleid,
                        expanded: false,
                        children
                    }
                )
            }
        });
        return formatperms
    }

    convertRolesPermsToArrayOfString = async (roles: Array<roles>, isSuperAdmin: boolean = false) => {
        let perms: Array<string> = [];
        if(!isSuperAdmin) {
            roles.forEach(role => {
                const permissions = role.permissions ?? [];
                for (const perm of permissions) {
                    perms.push(perm.permissionname);
                }
            });
            // Distinct, because the wildcard below is awarded by COUNT. Two roles
            // that overlap pushed the same permission twice, so a bearer holding
            // Admin (159) plus any 31-grant role reached 190 — COUNT(*) of
            // permissions — and was handed `superadmin` while actually holding
            // 159 distinct. The wildcard is a full server-side bypass in
            // CheckPermissionsGuard, so this must count what is held, not how
            // many times it was mentioned.
            perms = [...new Set(perms)];
            const countallperms = await permissions.count();
            if(countallperms != 0 && perms.length === countallperms) perms.push(SUPERADMIN);
        } else {
            const allperms = await permissions.findAll({
                attributes: ['permissionname']
            });
            perms = allperms.map(perm => perm.permissionname);
            perms.push(SUPERADMIN);
        }
        return perms
    }

    checkRoleIsBinded = async (roleid: string) => {
        const userrole = await roles.findOne({
            where: { roleid },
            attributes: [],
            include: [{
                model: lmsusers,
                required: true,
                attributes: ['lmsuserid']
            }]
        })
        if(userrole) return true
        return false
    }

    deleterole = async (roleid: string) => {
        const transaction = await dbinstance.getdbinstance().transaction();
        try {
            const rl = await roles.findOne({
                where: { roleid }
            });
            if(rl) {
                await rl.setPermissions([], {transaction});
                await rl.destroy({transaction});
                await transaction.commit();
                return rl;
            } else {
                throw new ApiError(ErrorCode.NOT_FOUND, "That role doesn't exist.");
            }
        } catch (e) {
            await transaction.rollback();
            throw e;
        }
    }

}