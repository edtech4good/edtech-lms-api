import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { lmsusers } from "src/models/data-models/lmsusers";
import { permissions } from "src/models/data-models/permissions";
import { permissionstitle } from "src/models/data-models/permissionstitle";
import { roles } from "src/models/data-models/roles";
import { tokens } from "src/models/data-models/tokens";
import { Role } from "src/models/enums";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { dbinstance } from "src/services/dbservice";
import { RolePermissionBusiness } from "src/business/role-permission.business";
import { RolePermissionController } from "./role-perm.controller";

/**
 * Changing a custom role's permissions (PUT /roles/:roleid, POST /roles/create,
 * platform only):
 *  - a changed permission SET ends the sessions of every account holding the role,
 *    in the same transaction (their tokens carry the old permissions); an edit that
 *    leaves the set the same ends nothing;
 *  - a role other than Super Admin may not hold every permission (400): that would
 *    be the count-based `superadmin` wildcard.
 * Driven over real HTTP through the real strategy, guards, controller, validators
 * and business class; replaced are the models and the transaction.
 */
const tokenExists = jest.fn();
jest.mock("src/business/token.business", () => ({
  ...jest.requireActual("src/business/token.business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({
    tokenExists,
    validateStaffAccessToken: (...args: unknown[]) => tokenExists(...args),
  })),
}));

const ROLE = "11111111-1111-4111-8111-111111111111";
const ALL = ["p1", "p2", "p3"]; // the whole permissions table in this fake
const HOLDERS = ["holder-1", "holder-2"];

const bearer = (claims: Record<string, unknown>) =>
  `Bearer ${sign({ jti: "test-jti", ...claims }, Config.fortyk.api.applicationsecret, { expiresIn: "5m" })}`;
const platform = bearer({ lmsuserid: "p0", lmsuserroles: [Role.superadmin], permissions: ["superadmin"], organisationid: null, isplatform: true });

const order: string[] = [];
let held: string[]; // the permission ids the role holds now
let saved: number;
let created: number;
let destroyCalls: Array<{ ids: string[]; transaction: unknown }>;
const transaction = { commit: jest.fn(), rollback: jest.fn() };

describe("changing a role's permissions", () => {
  let app: INestApplication;

  beforeAll(async () => {
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    const moduleRef = await Test.createTestingModule({ controllers: [RolePermissionController], providers: [JwtAccessStrategy] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  afterAll(async () => app.close());

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    tokenExists.mockResolvedValue(true);
    order.length = 0;
    held = ["p1", "p2"];
    saved = 0;
    created = 0;
    destroyCalls = [];
    transaction.commit.mockReset().mockImplementation(async () => void order.push("commit"));
    transaction.rollback.mockReset().mockImplementation(async () => void order.push("rollback"));
    jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(transaction as never);
    const row = {
      roleid: ROLE,
      rolename: "Custom",
      save: async () => void (saved += 1),
      getPermissions: async () => held.map((permissionid) => ({ permissionid })),
      setPermissions: async (rows: Array<{ permissionid: string }>) => {
        order.push("setPermissions");
        held = [...new Set(rows.map((r) => r.permissionid))];
      },
    };
    jest.spyOn(roles, "count").mockImplementation((async (o: { where: { roleid?: string; rolename?: string } }) => (o.where.roleid === ROLE ? 1 : 0)) as never);
    jest.spyOn(roles, "findOne").mockImplementation((async (o: { where: { roleid: string } }) => (o.where.roleid === ROLE ? row : null)) as never);
    jest.spyOn(roles, "create").mockImplementation((async () => {
      created += 1;
      return row;
    }) as never);
    jest.spyOn(permissions, "findAll").mockImplementation((async (o: { where: { permissionid: Record<symbol, string[]> } }) => {
      const ids = (o.where.permissionid as Record<symbol, string[]>)[Object.getOwnPropertySymbols(o.where.permissionid)[0]];
      return ALL.filter((id) => ids.includes(id)).map((permissionid) => ({ permissionid }));
    }) as never);
    jest.spyOn(permissions, "count").mockResolvedValue(ALL.length as never);
    jest.spyOn(permissionstitle, "findAll").mockResolvedValue([] as never);
    jest.spyOn(lmsusers, "findAll").mockImplementation((async (o: { include: Array<{ where: { roleid: string } }> }) =>
      o.include[0].where.roleid === ROLE ? HOLDERS.map((lmsuserid) => ({ lmsuserid })) : []) as never);
    jest.spyOn(tokens, "destroy").mockImplementation((async (o: { where: { lmsuserid: Record<symbol, string[]> }; transaction?: unknown }) => {
      order.push("revoke");
      destroyCalls.push({ ids: o.where.lmsuserid[Object.getOwnPropertySymbols(o.where.lmsuserid)[0]], transaction: o.transaction });
      return 1;
    }) as never);
  });

  const put = (body: object, id = ROLE) => request(app.getHttpServer()).put(`/roles/${id}`).set("Authorization", platform).send(body);
  const create = (body: object) => request(app.getHttpServer()).post("/roles/create").set("Authorization", platform).send(body);

  describe("PUT /roles/:roleid: a changed permission set ends the holders' sessions", () => {
    it("narrowing: every holder's tokens are deleted, once, in the same transaction, after the change and before the commit", async () => {
      await put({ rolename: "Custom", permissionsid: ["p1"] }).expect(200);
      expect(held).toEqual(["p1"]);
      expect(destroyCalls).toEqual([{ ids: HOLDERS, transaction }]);
      expect(order).toEqual(["setPermissions", "revoke", "commit"]);
    });

    it("a swap of one permission for another (same size) is a change too", async () => {
      await put({ rolename: "Custom", permissionsid: ["p1", "p3"] }).expect(200);
      expect(destroyCalls).toHaveLength(1);
    });

    it("the same set ends nothing: a rename, the ids in another order, or repeated", async () => {
      await put({ rolename: "Renamed", permissionsid: ["p2", "p1"] }).expect(200);
      await put({ rolename: "Renamed again", permissionsid: ["p1", "p1", "p2"] }).expect(200);
      expect(saved).toBe(2);
      expect(destroyCalls).toEqual([]);
      expect(order).not.toContain("revoke");
    });

    it("the revoke rolls back with the transaction: a failed commit leaves it rolled back after the revoke", async () => {
      transaction.commit.mockReset().mockImplementation(async () => {
        order.push("commit");
        throw new Error("commit failed");
      });
      const res = await put({ rolename: "Custom", permissionsid: ["p1"] });
      expect(res.status).toBe(500);
      expect(destroyCalls[0].transaction).toBe(transaction);
      expect(order).toEqual(["setPermissions", "revoke", "commit", "rollback"]);
    });

    it("an unknown role is refused and nothing is revoked", async () => {
      await put({ rolename: "Custom", permissionsid: ["p1"] }, "99999999-9999-4999-8999-999999999999").expect(400);
      expect(destroyCalls).toEqual([]);
    });
  });

  describe("a role other than Super Admin may not hold every permission (400, nothing written)", () => {
    it("update: the full set is refused; no write, no revoke", async () => {
      const res = await put({ rolename: "Custom", permissionsid: ["p1", "p2", "p3"] });
      expect(res.status).toBe(400);
      expect(res.body.fields[0].field).toBe("permissionsid");
      expect(res.body.fields[0].message).toMatch(/Super Admin/);
      expect(saved).toBe(0);
      expect(held).toEqual(["p1", "p2"]);
      expect(destroyCalls).toEqual([]);
      expect(order).toEqual(["rollback"]);
    });

    it("update: repeated ids do not hide it", async () => {
      await put({ rolename: "Custom", permissionsid: ["p1", "p1", "p2", "p3"] }).expect(400);
      expect(held).toEqual(["p1", "p2"]);
    });

    it("update: one permission short of the full set is allowed", async () => {
      await put({ rolename: "Custom", permissionsid: ["p2", "p3"] }).expect(200);
      expect(held).toEqual(["p2", "p3"]);
    });

    it("create: the full set is refused and no role is created", async () => {
      const res = await create({ rolename: "Everything", permissionsid: ["p1", "p2", "p3"] });
      expect(res.status).toBe(400);
      expect(res.body.fields[0].field).toBe("permissionsid");
      expect(created).toBe(0);
      expect(order).toEqual(["rollback"]);
    });

    it("create: a set short of the full one is allowed", async () => {
      await create({ rolename: "Some", permissionsid: ["p1", "p2"] }).expect(200);
      expect(created).toBe(1);
    });
  });

  describe("assertNotEveryPermission counts distinct permissions, not rows", () => {
    const rows = (ids: string[]) => ids.map((permissionid) => ({ permissionid })) as never[];
    it("the same permission reached twice (an individual id and a group) does not make a full set, and a full set is refused", async () => {
      const business = new RolePermissionBusiness();
      await business.assertNotEveryPermission(ROLE, rows(["p1", "p1", "p2"]), transaction as never);
      await expect(business.assertNotEveryPermission(ROLE, rows(["p1", "p2", "p3"]), transaction as never)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    });

    it("Super Admin is exempt", async () => {
      await new RolePermissionBusiness().assertNotEveryPermission(Role.superadmin, rows(["p1", "p2", "p3"]), transaction as never);
    });
  });
});
