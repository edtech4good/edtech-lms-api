import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { lmsusers } from "src/models/data-models/lmsusers";
import { roles } from "src/models/data-models/roles";
import { tokens } from "src/models/data-models/tokens";
import { Role } from "src/models/enums";
import { RolePermissionController } from "src/modules/role-permission/role-perm.controller";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { dbinstance } from "src/services/dbservice";
import { UserController } from "./user.controller";

/**
 * Who may hand out, keep or take away the Super Admin role. `isplatform` is "no
 * organisation AND Super Admin", so whoever can set that role on a user with no
 * organisation can create a platform account. The rule, wherever roles are set
 * (POST /user/create, PUT /user/:id, POST /roles/user-bind-role, and DELETE
 * /user/:id which clears every role):
 *  - a role set that includes Super Admin needs a platform caller, and a target
 *    with no organisation (even for a platform caller);
 *  - removing Super Admin from anyone needs a platform caller;
 *  - nothing is written when it is refused.
 *
 * The rule is applied to role ROWS read from the database, never to the ids in
 * the request, and a request that names a role that does not exist exactly as
 * stored is refused with 400 before anything is written. A caller who is not a
 * platform user may not modify an account that holds Super Admin in any way.
 *
 * Driven over real HTTP through the real strategy, guards, controllers and
 * business classes; only the models and the transaction are replaced.
 */
const tokenExists = jest.fn();
jest.mock("src/business/token.business", () => ({
  ...jest.requireActual("src/business/token.business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({
    tokenExists,
    // The per-request query is tested in token.business.organisation.spec.ts.
    validateStaffAccessToken: (...args: unknown[]) => tokenExists(...args),
  })),
}));

const ORG = "33333333-3333-4333-8333-333333333333";
const TARGET = "55555555-5555-4555-8555-555555555555";
const ROLE_NAMES: Record<string, string> = {
  [Role.superadmin]: "Super Admin",
  [Role.admin]: "Admin",
  [Role.teacher]: "Teacher",
};

const bearer = (claims: Record<string, unknown>) =>
  `Bearer ${sign({ jti: "test-jti", ...claims }, Config.fortyk.api.applicationsecret, { expiresIn: "5m" })}`;

const PERMS = ["create_user", "update_user", "delete_user", "view_user"];
const callers = {
  // No organisation, Super Admin, the wildcard a real Super Admin carries.
  platform: bearer({ lmsuserid: "caller", lmsuserroles: [Role.superadmin], permissions: ["superadmin"], organisationid: null, isplatform: true }),
  // Holds the Super Admin role and the wildcard, but belongs to an organisation.
  orgSuperAdmin: bearer({ lmsuserid: "caller", lmsuserroles: [Role.superadmin], permissions: ["superadmin"], organisationid: ORG, isplatform: false }),
  // No organisation, no Super Admin, holds the user-administration permissions.
  unassignedAdmin: bearer({ lmsuserid: "caller", lmsuserroles: [Role.admin], permissions: PERMS, organisationid: null, isplatform: false }),
  // An organisation's Admin holding the same permissions.
  orgAdmin: bearer({ lmsuserid: "caller", lmsuserroles: [Role.admin], permissions: PERMS, organisationid: ORG, isplatform: false }),
};

const roleRow = (roleid: string) => ({ roleid, rolename: ROLE_NAMES[roleid] ?? roleid });

type Target = {
  lmsuserid: string;
  lmsusername: string;
  organisationid: string | null;
  isdisabled: boolean;
  held: string[];
};
let target: Target;
let fake: ReturnType<typeof makeFake>;

const makeFake = (t: Target) => {
  const plain = { lmsuserid: t.lmsuserid, lmsusername: t.lmsusername, organisationid: t.organisationid };
  return {
    ...plain,
    lmsuserpasswordhash: "hash",
    setRoles: jest.fn().mockResolvedValue([]),
    getRoles: jest.fn().mockImplementation(async () => t.held.map(roleRow)),
    save: jest.fn().mockResolvedValue(undefined),
    setDataValue: jest.fn(),
    get: jest.fn().mockReturnValue(plain),
  };
};

const transaction = { commit: jest.fn(), rollback: jest.fn() };
let destroy: jest.SpyInstance;
let create: jest.SpyInstance;

describe("Super Admin role: who may set it (create, update, bind, delete)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    const moduleRef = await Test.createTestingModule({
      controllers: [UserController, RolePermissionController],
      providers: [JwtAccessStrategy],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    tokenExists.mockResolvedValue(true);
    transaction.commit.mockReset();
    transaction.rollback.mockReset();
    jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(transaction as never);
    target = { lmsuserid: TARGET, lmsusername: "target@example.com", organisationid: null, isdisabled: false, held: [Role.admin] };
    fake = makeFake(target);
    // Validators ask whether an email is taken (by name) or load the target (by id).
    jest.spyOn(lmsusers, "findOne").mockImplementation((async (o: { where: Record<string, unknown> }) =>
      "lmsusername" in o.where ? null : fake) as never);
    create = jest.spyOn(lmsusers, "create").mockImplementation((async () => fake) as never);
    // Like MySQL on `roles.roleid` (utf8mb4_unicode_ci): ids match ignoring case
    // and trailing spaces, and the row that comes back carries the id as STORED.
    // Ids that name no role return nothing.
    jest.spyOn(roles, "findAll").mockImplementation((async (o: { where: { roleid: unknown } }) => {
      const ids = Object.getOwnPropertySymbols(o.where.roleid as object).map((k) => (o.where.roleid as Record<symbol, string[]>)[k])[0];
      const stored = Object.keys(ROLE_NAMES);
      return stored
        .filter((canonical) => ids.some((id) => id.replace(/ +$/, "").toLowerCase() === canonical.toLowerCase()))
        .map(roleRow);
    }) as never);
    destroy = jest.spyOn(tokens, "destroy").mockResolvedValue(1 as never);
  });

  afterAll(async () => {
    await app.close();
  });

  const send = {
    create: (token: string, lmsuserroles: string[]) =>
      request(app.getHttpServer())
        .post("/user/create")
        .set("Authorization", token)
        .send({ lmsusername: "new.person@example.com", lmsuserpasswordhash: "SamplePass12", lmsuserroles }),
    update: (token: string, lmsuserroles: string[]) =>
      request(app.getHttpServer())
        .put(`/user/${TARGET}`)
        .set("Authorization", token)
        .send({ lmsusername: "target@example.com", lmsuserroles }),
    bind: (token: string, rolesid: string[]) =>
      request(app.getHttpServer())
        .post("/roles/user-bind-role")
        .set("Authorization", token)
        .send({ lmsuserid: TARGET, rolesid }),
    remove: (token: string) =>
      request(app.getHttpServer()).delete(`/user/${TARGET}`).set("Authorization", token),
  };

  const nothingWritten = () => {
    expect(create).not.toHaveBeenCalled();
    expect(fake.save).not.toHaveBeenCalled();
    expect(fake.setRoles).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
  };

  describe.each([
    ["an organisation-holding Super Admin", "orgSuperAdmin"],
    ["an unassigned Admin holding the user permissions", "unassignedAdmin"],
    ["an organisation's Admin holding the user permissions", "orgAdmin"],
  ] as const)("%s", (_name, who) => {
    const token = callers[who];

    it("is refused with 403 creating a user with Super Admin (alone or among other roles); nothing is written", async () => {
      for (const set of [[Role.superadmin], [Role.admin, Role.superadmin]]) {
        const res = await send.create(token, set);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe("NOT_ALLOWED");
      }
      nothingWritten();
      expect(transaction.rollback).toHaveBeenCalled();
    });

    it("is refused with 403 updating a user to include Super Admin (a user with no organisation); nothing is written", async () => {
      const res = await send.update(token, [Role.superadmin]);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("NOT_ALLOWED");
      nothingWritten();
      expect(transaction.rollback).toHaveBeenCalled();
    });

    it("is refused with 403 binding Super Admin to a user with no organisation; nothing is written", async () => {
      const res = await send.bind(token, [Role.superadmin, Role.admin]);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("NOT_ALLOWED");
      nothingWritten();
    });

    it("is refused with 403 editing a user who holds Super Admin while keeping it", async () => {
      target.held = [Role.superadmin];
      await send.update(token, [Role.superadmin, Role.admin]).expect(403);
      await send.bind(token, [Role.superadmin]).expect(403);
      nothingWritten();
    });

    it("is refused with 403 removing Super Admin from a user who holds it, by update, by bind and by delete", async () => {
      target.held = [Role.superadmin, Role.admin];
      await send.update(token, [Role.admin]).expect(403);
      await send.bind(token, [Role.admin]).expect(403);
      await send.remove(token).expect(403);
      nothingWritten();
    });

    it("still succeeds for other roles: create, update, bind and delete of a user who is not Super Admin", async () => {
      await send.create(token, [Role.admin, Role.teacher]).expect(200);
      expect(create).toHaveBeenCalledTimes(1);
      await send.update(token, [Role.teacher]).expect(200);
      await send.bind(token, [Role.teacher]).expect(200);
      await send.remove(token).expect(200);
      expect(fake.setRoles).toHaveBeenCalled();
    });
  });

  describe("a platform caller", () => {
    const token = callers.platform;

    it("can create a user with Super Admin", async () => {
      await send.create(token, [Role.superadmin]).expect(200);
      expect(create).toHaveBeenCalledTimes(1);
      expect(fake.setRoles).toHaveBeenCalledTimes(1);
    });

    it("can bind and update Super Admin onto a user with no organisation", async () => {
      await send.bind(token, [Role.superadmin]).expect(200);
      await send.update(token, [Role.superadmin, Role.admin]).expect(200);
      expect(fake.setRoles).toHaveBeenCalledTimes(2);
    });

    it("can remove Super Admin from a user, and that user's sessions end in the same transaction", async () => {
      target.held = [Role.superadmin];
      await send.bind(token, [Role.admin]).expect(200);
      expect(destroy).toHaveBeenCalledWith({ where: { lmsuserid: TARGET }, transaction });
    });

    it("can delete a user who holds Super Admin", async () => {
      target.held = [Role.superadmin];
      await send.remove(token).expect(200);
    });

    it("is refused with 403 binding or updating Super Admin onto a user who HAS an organisation; nothing is written", async () => {
      target.organisationid = ORG;
      fake = makeFake(target);
      for (const res of [await send.bind(token, [Role.superadmin]), await send.update(token, [Role.superadmin, Role.admin])]) {
        expect(res.status).toBe(403);
        expect(res.body.code).toBe("NOT_ALLOWED");
      }
      nothingWritten();
    });

    it("can still give a user who has an organisation any other role", async () => {
      target.organisationid = ORG;
      fake = makeFake(target);
      await send.bind(token, [Role.admin]).expect(200);
    });
  });

  describe("role ids are resolved to rows; the rule never sees request strings", () => {
    const variants = ["mapyr2pw", "MAPYR2PW", "Mapyr2Pw ", "mApYr2PW"];

    describe.each([
      ["an organisation-holding Super Admin", "orgSuperAdmin"],
      ["an unassigned Admin holding the user permissions", "unassignedAdmin"],
      ["a platform user", "platform"],
    ] as const)("%s", (_name, who) => {
      const token = callers[who];

      it.each(variants)("create with the Super Admin id spelled %j is 400, and nothing is written", async (variant) => {
        for (const set of [[variant], [Role.admin, variant]]) {
          const res = await send.create(token, set);
          expect(res.status).toBe(400);
          expect(res.body.code).toBe("INVALID_INPUT");
        }
        nothingWritten();
      });

      it.each(variants)("update with the Super Admin id spelled %j is 400, and nothing is written", async (variant) => {
        const res = await send.update(token, [variant]);
        expect(res.status).toBe(400);
        nothingWritten();
      });

      it.each(variants)("bind with the Super Admin id spelled %j is 400, and nothing is written", async (variant) => {
        const res = await send.bind(token, [variant]);
        expect(res.status).toBe(400);
        nothingWritten();
      });

      it("a role id given twice, or twice differing only in case, is 400", async () => {
        await send.create(token, [Role.admin, Role.admin]).expect(400);
        await send.create(token, [Role.superadmin, "mapyr2pw"]).expect(400);
        await send.bind(token, [Role.admin, "ZR5ER4QD"]).expect(400);
        nothingWritten();
      });
    });
  });

  describe("an unknown role id is 400 and nothing is saved (no partial save)", () => {
    it.each([
      ["an organisation-holding Super Admin", "orgSuperAdmin"],
      ["an unassigned Admin holding the user permissions", "unassignedAdmin"],
      ["a platform user", "platform"],
    ] as const)("%s: create, update and bind", async (_name, who) => {
      const token = callers[who];
      for (const res of [
        await send.create(token, [Role.admin, "zzzzzzzz"]),
        await send.update(token, [Role.admin, "zzzzzzzz"]),
        await send.update(token, ["zzzzzzzz"]),
        await send.bind(token, [Role.admin, "zzzzzzzz"]),
      ]) {
        expect(res.status).toBe(400);
        expect(res.body.code).toBe("INVALID_INPUT");
      }
      nothingWritten();
    });

    it("update with an unknown role id does not change the email or the password", async () => {
      const res = await request(app.getHttpServer())
        .put(`/user/${TARGET}`)
        .set("Authorization", callers.orgSuperAdmin)
        .send({ lmsusername: "changed@example.com", lmsuserpasswordhash: "ChangedPass12", lmsuserroles: [Role.admin, "zzzzzzzz"] });
      expect(res.status).toBe(400);
      expect(fake.save).not.toHaveBeenCalled();
      expect(fake.lmsusername).toBe("target@example.com");
    });
  });

  describe("a caller who is not platform may not modify an account that holds Super Admin, whatever fields change", () => {
    const edit = (token: string, body: Record<string, unknown>) =>
      request(app.getHttpServer()).put(`/user/${TARGET}`).set("Authorization", token).send(body);
    const edits: Array<[string, Record<string, unknown>]> = [
      ["only the email", { lmsusername: "changed@example.com", lmsuserroles: [Role.superadmin] }],
      ["only the password", { lmsusername: "target@example.com", lmsuserpasswordhash: "ChangedPass12", lmsuserroles: [Role.superadmin] }],
      ["only a harmless field (country scope)", { lmsusername: "target@example.com", lmsuserroles: [Role.superadmin], countryids: ["b0000000-0000-4000-8000-000000000001"] }],
      ["the roles to something else", { lmsusername: "target@example.com", lmsuserroles: [Role.admin] }],
      ["with an empty role list", { lmsusername: "target@example.com", lmsuserroles: [] }],
    ];

    describe.each([
      ["an organisation-holding Super Admin", "orgSuperAdmin"],
      ["an unassigned Admin holding the user permissions", "unassignedAdmin"],
      ["an organisation's Admin holding the user permissions", "orgAdmin"],
    ] as const)("%s", (_name, who) => {
      it.each(edits)("editing %s is refused with 403 and nothing is written", async (_what, body) => {
        target.held = [Role.superadmin];
        const res = await edit(callers[who], body);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe("NOT_ALLOWED");
        nothingWritten();
        expect(transaction.rollback).toHaveBeenCalled();
      });

      it("the same holds when the target also holds other roles", async () => {
        target.held = [Role.superadmin, Role.admin];
        await edit(callers[who], edits[0][1]).expect(403);
        nothingWritten();
      });
    });

    it.each(edits.slice(0, 3))("a platform user editing %s is allowed", async (_what, body) => {
      target.held = [Role.superadmin];
      await edit(callers.platform, body).expect(200);
      expect(fake.save).toHaveBeenCalledTimes(1);
    });

    it("a caller who is not platform may still edit a user who is NOT Super Admin: email, password, scope and roles", async () => {
      target.held = [Role.admin];
      for (const who of ["orgSuperAdmin", "unassignedAdmin", "orgAdmin"] as const) {
        fake.save.mockClear();
        await edit(callers[who], { lmsusername: "changed@example.com", lmsuserpasswordhash: "ChangedPass12", lmsuserroles: [Role.teacher], countryids: [] }).expect(200);
        expect(fake.save).toHaveBeenCalledTimes(1);
      }
    });

    it("a platform edit of a non-Super-Admin user with the roles left as they were is allowed", async () => {
      target.held = [Role.admin];
      await edit(callers.platform, { lmsusername: "target@example.com", lmsuserroles: [Role.admin] }).expect(200);
    });
  });

  describe("the request shape: roles are always an array of ids", () => {
    it("PUT /user/:id without lmsuserroles is 400 (the admin form always sends the array), and nothing is saved", async () => {
      for (const who of ["platform", "orgSuperAdmin"] as const) {
        const res = await request(app.getHttpServer())
          .put(`/user/${TARGET}`)
          .set("Authorization", callers[who])
          .send({ lmsusername: "changed@example.com", lmsuserpasswordhash: "ChangedPass12" });
        expect(res.status).toBe(400);
      }
      nothingWritten();
    });

    it("PUT /user/:id with an empty array is accepted: it clears the roles, as the admin form's untick-all does", async () => {
      target.held = [Role.admin];
      await request(app.getHttpServer())
        .put(`/user/${TARGET}`)
        .set("Authorization", callers.platform)
        .send({ lmsusername: "target@example.com", lmsuserpasswordhash: null, lmsuserroles: [] })
        .expect(200);
      expect(fake.setRoles).toHaveBeenCalledWith([], expect.anything());
    });

    it("the whole body the admin form sends is accepted (id repeated in the body, null password, scope arrays)", async () => {
      target.held = [Role.admin];
      await request(app.getHttpServer())
        .put(`/user/${TARGET}`)
        .set("Authorization", callers.platform)
        .send({ lmsuserid: TARGET, lmsusername: "target@example.com", lmsuserpasswordhash: null, lmsuserroles: [Role.admin], countryids: [], schoolids: [] })
        .expect(200);
    });

    it.each([
      ["an object item", [{ $ne: "x" }]],
      ["a number item", [7]],
      ["a null item", [null]],
      ["a nested array", [[Role.admin]]],
      ["an oversized id", ["x".repeat(500)]],
      ["too many ids", Array.from({ length: 60 }, (_v, i) => `r${i}`)],
      ["a string instead of an array", Role.admin],
    ])("a roles list with %s is 400 on create, update and bind (never a 500), and nothing is written", async (_name, list) => {
      const token = callers.platform;
      const r1 = await request(app.getHttpServer()).post("/user/create").set("Authorization", token)
        .send({ lmsusername: "new.person@example.com", lmsuserpasswordhash: "SamplePass12", lmsuserroles: list });
      const r2 = await request(app.getHttpServer()).put(`/user/${TARGET}`).set("Authorization", token)
        .send({ lmsusername: "target@example.com", lmsuserroles: list });
      const r3 = await request(app.getHttpServer()).post("/roles/user-bind-role").set("Authorization", token)
        .send({ lmsuserid: TARGET, rolesid: list });
      expect([r1.status, r2.status, r3.status]).toEqual([400, 400, 400]);
      nothingWritten();
    });

    it("DELETE /user/:id has no body and is not affected by the update body rules", async () => {
      await send.remove(callers.platform).expect(200);
    });
  });

  it("acting as an organisation does not change the rule: a platform token (isplatform true) with an organisationid can still hand out Super Admin to an unassigned target", async () => {
    const acting = bearer({ lmsuserid: "caller", lmsuserroles: [Role.superadmin], permissions: ["superadmin"], organisationid: ORG, isplatform: true });
    await send.bind(acting, [Role.superadmin]).expect(200);
  });

  it("refuses a user without the permission before the rule is reached (401/403 unchanged)", async () => {
    await send.create("", [Role.admin]).expect(401);
    const noPerm = bearer({ lmsuserid: "caller", lmsuserroles: [Role.admin], permissions: [], organisationid: null, isplatform: false });
    await send.create(noPerm, [Role.admin]).expect(403);
    nothingWritten();
  });
});
