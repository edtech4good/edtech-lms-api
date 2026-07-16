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
import { dbinstance } from "src/services/dbservice";
import { SUPERADMIN } from "src/models/enums/permissions.enum";
import { BadRequestException } from "@nestjs/common";
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
            const rl = await roles.create(role, { transaction });
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
                throw new BadRequestException('Role Not Found');
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

    getallRoles = async (paging: IMultiPaging) => {
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

        return await roles.findAndCountAll({ where, order, limit, offset });
    }

    getallroles = async () => {
        const rls = await roles.findAll();
        const formatedroles = rls.map(rl => {
            return {
                id: rl.roleid,
                text: rl.rolename,
                checked: false
            }
        })
        return formatedroles
    }

    getRolebyid = async (roleid: string) => {
        const role = await roles.findOne({
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

    bindUserRoles = async (rolePerms: BindUserRolesRequest) => {
        const user = await lmsusers.findOne({ where: { lmsuserid: rolePerms.lmsuserid }});
        const selectedroles = await roles.findAll({ where: { roleid: { [Op.in]: rolePerms.rolesid} } });
        return await user?.setRoles(selectedroles);
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
                throw new BadRequestException('Role Not Found');
            }
        } catch (e) {
            await transaction.rollback();
            throw e;
        }
    }

}