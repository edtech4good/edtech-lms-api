import { createHash } from "crypto";
import { ORGANISATION_ADMIN_PERMISSIONS_20261002 } from "./frozen/organisation-admin-20261002";
import { PERMISSIONS_AS_SHIPPED_20260716 } from "./frozen/permissions-20260716";
import { Role } from "../models/enums";

/**
 * The "Organisation Admin" role: its frozen permission list, and the seed
 * migration that creates the role and grants the list.
 *
 * The list is pinned here (count and checksum), so changing what the role holds
 * means a new migration with its own list, never an edit of this one. The
 * migration is exercised against a fake query interface that records every
 * statement; the real up / down / up is run on a real database as part of the
 * review of the change.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require("./migrations/20261002120000-seed-organisation-admin-role");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const adminGrant = require("./migrations/20260716160000-grant-admin-teacher-permissions");

const ROLE_ID = "unb3Fy8p";
const ROLE_NAME = "Organisation Admin";
const ADMIN = "zr5ER4QD";

const sha = (names: ReadonlyArray<string>) =>
  createHash("sha256").update([...names].sort().join("\n")).digest("hex");

const LIST_COUNT = 161;
const LIST_SHA = "d4925c08362ebbe5ea2c2713125022552910f359d39da72854d78a149db34b79";

const ORGANISATION = ["view_organisation", "create_organisation", "update_organisation", "delete_organisation"];
const ROLE_WRITES = ["create_role", "update_role", "delete_role"];
const COUNTRY_WRITES = ["create_country", "update_country", "delete_country"];
const STAFF_AND_ROLE_READ = ["view_user", "create_user", "update_user", "delete_user", "view_role"];

describe("the Organisation Admin frozen permission list", () => {
  it("has exactly the 161 names it shipped with (count and checksum), each once", () => {
    expect(ORGANISATION_ADMIN_PERMISSIONS_20261002).toHaveLength(LIST_COUNT);
    expect(new Set(ORGANISATION_ADMIN_PERMISSIONS_20261002).size).toBe(LIST_COUNT);
    expect(sha(ORGANISATION_ADMIN_PERMISSIONS_20261002)).toBe(LIST_SHA);
  });

  it("holds the staff permissions and the role-list read", () => {
    for (const name of STAFF_AND_ROLE_READ) {
      expect(ORGANISATION_ADMIN_PERMISSIONS_20261002).toContain(name);
    }
  });

  it("holds none of the organisation permissions", () => {
    for (const name of ORGANISATION) {
      expect(ORGANISATION_ADMIN_PERMISSIONS_20261002).not.toContain(name);
    }
  });

  it("holds none of create_role, update_role, delete_role", () => {
    for (const name of ROLE_WRITES) {
      expect(ORGANISATION_ADMIN_PERMISSIONS_20261002).not.toContain(name);
    }
  });

  it("holds none of the country writes, which only platform routes use", () => {
    for (const name of COUNTRY_WRITES) {
      expect(ORGANISATION_ADMIN_PERMISSIONS_20261002).not.toContain(name);
    }
  });

  it("is made of names that exist in the shipped permission list (no new permission rows)", () => {
    for (const name of ORGANISATION_ADMIN_PERMISSIONS_20261002) {
      expect(PERMISSIONS_AS_SHIPPED_20260716).toContain(name);
    }
  });

  it("is what Admin is granted, plus the staff permissions and view_role, minus the country writes", async () => {
    const calls: Array<{ roleid: string; names: string[] }> = [];
    await adminGrant.up({
      sequelize: {
        query: jest.fn(async (_sql: string, o?: { replacements?: { roleid: string; names: string[] } }) => {
          if (o?.replacements?.names) calls.push(o.replacements);
          return [[], undefined];
        }),
        transaction: (cb: (t: unknown) => Promise<void>) => cb({}),
      },
    });
    const admin = calls.find((c) => c.roleid === ADMIN)!.names;
    expect(admin).toHaveLength(159);
    const expected = [...admin.filter((n) => !COUNTRY_WRITES.includes(n)), ...STAFF_AND_ROLE_READ];
    expect(sha(ORGANISATION_ADMIN_PERMISSIONS_20261002)).toBe(sha(expected));
  });
});

describe("Role.organisationadmin", () => {
  it("is the id the migration seeds", () => {
    expect(Role.organisationadmin).toBe(ROLE_ID);
  });

  it("is a new id in the style of the others (eight letters and digits) and does not collide with them", () => {
    expect(Role.organisationadmin).toMatch(/^[A-Za-z0-9]{8}$/);
    const others = Object.values(Role).filter((v) => v !== Role.organisationadmin);
    expect(others.map((v) => String(v).toLowerCase())).not.toContain(Role.organisationadmin.toLowerCase());
  });
});

type Statement = { sql: string; replacements?: Record<string, unknown> };

/** A query interface that records statements and answers the migration's reads from `answers`. */
const fake = (answers: {
  existing?: Array<{ roleid: string; rolename: string }>;
  total?: number;
  held?: number;
  holders?: number;
  others?: number;
}) => {
  const statements: Statement[] = [];
  const query = jest.fn(async (sql: string, o?: { replacements?: Record<string, unknown> }) => {
    statements.push({ sql, replacements: o?.replacements });
    if (/SELECT `roleid`, `rolename` FROM `roles`/.test(sql)) return [answers.existing ?? [], undefined];
    if (/SELECT COUNT\(\*\) AS n FROM `permissions`$/.test(sql.trim())) return [[{ n: answers.total ?? 194 }], undefined];
    if (/COUNT\(DISTINCT rp/.test(sql)) return [[{ n: answers.held ?? 161 }], undefined];
    if (/FROM `lmsusers_roles`/.test(sql)) return [[{ n: answers.holders ?? 0 }], undefined];
    if (/NOT IN \(:names\)/.test(sql)) return [[{ n: answers.others ?? 0 }], undefined];
    return [[], undefined];
  });
  const transaction = jest.fn((cb: (t: unknown) => Promise<void>) => cb({}));
  return { statements, qi: { sequelize: { query, transaction } } };
};

const inserts = (s: Statement[]) => s.filter((x) => /^INSERT INTO `roles`/.test(x.sql.trim()));
const grants = (s: Statement[]) => s.filter((x) => /INSERT INTO `roles_permissions`/.test(x.sql));
const deletes = (s: Statement[]) => s.filter((x) => /^DELETE/.test(x.sql.trim()));

describe("20261002120000-seed-organisation-admin-role up()", () => {
  it("creates the role under its id and name, then grants exactly the frozen list to that role", async () => {
    const { statements, qi } = fake({});
    await migration.up(qi);
    const created = inserts(statements);
    expect(created).toHaveLength(1);
    expect(created[0].replacements).toMatchObject({ roleid: ROLE_ID, rolename: ROLE_NAME });
    const g = grants(statements);
    expect(g).toHaveLength(1);
    expect(g[0].replacements!.roleid).toBe(ROLE_ID);
    expect(g[0].replacements!.names).toEqual([...ORGANISATION_ADMIN_PERMISSIONS_20261002]);
    expect(sha(g[0].replacements!.names as string[])).toBe(LIST_SHA);
  });

  it("grants only permissions that are not already held (idempotent), by name, never every row", async () => {
    const { statements, qi } = fake({});
    await migration.up(qi);
    const sql = grants(statements)[0].sql;
    expect(sql).toMatch(/NOT EXISTS/);
    expect(sql).toMatch(/permissionname` IN \(:names\)/);
    expect(statements.some((s) => /SELECT \* FROM `?permissions/i.test(s.sql))).toBe(false);
  });

  it("creates no permission rows", async () => {
    const { statements, qi } = fake({});
    await migration.up(qi);
    expect(statements.some((s) => /INSERT INTO `permissions`/i.test(s.sql))).toBe(false);
  });

  it("run again over a database that already has the role: no second role row, the grant is still the guarded one", async () => {
    const { statements, qi } = fake({ existing: [{ roleid: ROLE_ID, rolename: ROLE_NAME }] });
    await migration.up(qi);
    expect(inserts(statements)).toHaveLength(0);
    expect(grants(statements)).toHaveLength(1);
  });

  it.each([
    ["the id with another name", [{ roleid: ROLE_ID, rolename: "Something Else" }]],
    ["the name with another id", [{ roleid: "other001", rolename: ROLE_NAME }]],
    ["an id that differs only by case", [{ roleid: ROLE_ID.toUpperCase(), rolename: "Another" }]],
  ])("refuses when a role already uses %s, and changes nothing", async (_label, existing) => {
    const { statements, qi } = fake({ existing });
    await expect(migration.up(qi)).rejects.toThrow(/Rename or delete them/);
    expect(inserts(statements)).toHaveLength(0);
    expect(grants(statements)).toHaveLength(0);
  });

  it("the refusal states a count and no names or ids", async () => {
    const { qi } = fake({ existing: [{ roleid: "other001", rolename: ROLE_NAME }] });
    const error = await migration.up(qi).catch((e: Error) => e);
    expect(error.message).toMatch(/1 existing role\(s\)/);
    expect(error.message).not.toContain("other001");
  });

  it("rolls back (throws) if the role would hold every permission, the superadmin wildcard", async () => {
    const { qi } = fake({ total: 161, held: 161 });
    await expect(migration.up(qi)).rejects.toThrow(/superadmin wildcard/);
  });

  it("runs inside one transaction", async () => {
    const { qi } = fake({});
    await migration.up(qi);
    expect(qi.sequelize.transaction).toHaveBeenCalledTimes(1);
  });
});

describe("20261002120000-seed-organisation-admin-role down()", () => {
  it("removes exactly the frozen list from the role, then the role row, and nothing else", async () => {
    const { statements, qi } = fake({});
    await migration.down(qi);
    const d = deletes(statements);
    expect(d).toHaveLength(2);
    expect(d[0].sql).toMatch(/DELETE rp FROM `roles_permissions`/);
    expect(d[0].replacements).toMatchObject({ roleid: ROLE_ID });
    expect(sha(d[0].replacements!.names as string[])).toBe(LIST_SHA);
    expect(d[1].sql).toMatch(/DELETE FROM `roles` WHERE `roleid` = :roleid AND `rolename` = :rolename/);
    expect(d[1].replacements).toEqual({ roleid: ROLE_ID, rolename: ROLE_NAME });
  });

  it("refuses, changing nothing, while an account still holds the role", async () => {
    const { statements, qi } = fake({ holders: 2 });
    await expect(migration.down(qi)).rejects.toThrow(/2 account\(s\) still hold it/);
    expect(deletes(statements)).toHaveLength(0);
  });

  it("refuses, changing nothing, while the role holds a permission this migration did not grant", async () => {
    const { statements, qi } = fake({ others: 3 });
    await expect(migration.down(qi)).rejects.toThrow(/3 permission\(s\) this migration did not grant/);
    expect(deletes(statements)).toHaveLength(0);
  });
});
