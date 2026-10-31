/**
 * Organisation Admin may run Sync Students and Sync Content for its own organisation (edtech-lms-ui#148, option A). The
 * migration grants exactly `sync_content` and `sync_students` to the Organisation Admin role and to no other role, creates
 * no permission row, and refuses to commit if the role would reach the superadmin wildcard. Mocked QueryInterface, as for
 * 20261027120100: this proves what the migration asks for and in which transaction. The real-database proof (the role's
 * grants before and after, a second run, down, and what the API then answers) is in the change description.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require("./migrations/20261031120100-grant-organisation-admin-sync-permissions");
import { Role } from "../models/enums";
import { Permission } from "../models/enums/permissions.enum";

const ORGANISATION_ADMIN = "unb3Fy8p";
const TX = { id: "the-transaction" };

const makeQueryInterface = (o: { total?: number; held?: number } = {}) => {
  const query = jest.fn((sql: string) => {
    if (/SELECT COUNT\(\*\) AS n FROM `permissions`/.test(sql)) return Promise.resolve([[{ n: o.total ?? 195 }]]);
    if (/COUNT\(DISTINCT rp/.test(sql)) return Promise.resolve([[{ n: o.held ?? 157 }]]);
    return Promise.resolve([[], undefined]);
  });
  return { bulkInsert: jest.fn(), sequelize: { query, transaction: jest.fn((cb: (t: unknown) => Promise<void>) => cb(TX)) } };
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const calls = (qi: ReturnType<typeof makeQueryInterface>) => qi.sequelize.query.mock.calls as unknown as Array<[string, { replacements?: any; transaction?: unknown }]>;

describe("the ids and names this migration is about", () => {
  it("the role is the Organisation Admin role, and the names are the two the sync routes ask for", () => {
    expect(Role.organisationadmin).toBe(ORGANISATION_ADMIN);
    expect([Permission.SYNC_CONTENT, Permission.SYNC_STUDENTS]).toEqual(["sync_content", "sync_students"]);
  });
});

describe("20261031120100-grant-organisation-admin-sync-permissions up()", () => {
  it("grants exactly sync_content and sync_students, to the Organisation Admin role only, in one transaction", async () => {
    const qi = makeQueryInterface();
    await migration.up(qi);
    expect(qi.sequelize.transaction).toHaveBeenCalledTimes(1);
    const grants = calls(qi).filter(([sql]) => /INSERT INTO `roles_permissions`/.test(sql));
    expect(grants).toHaveLength(1);
    const [sql, opts] = grants[0];
    expect(opts.replacements.roleid).toBe(ORGANISATION_ADMIN);
    expect([...opts.replacements.names].sort()).toEqual(["sync_content", "sync_students"]);
    expect(opts.transaction).toBe(TX);
    expect(sql).toMatch(/p\.`permissionname` IN \(:names\)/);
    // never a grant of every row, and never a second time
    expect(sql).not.toMatch(/SELECT \*/);
    expect(sql).toMatch(/NOT EXISTS/);
  });

  it("creates no permission row and no title (both permissions exist since 20260716140000)", async () => {
    const qi = makeQueryInterface();
    await migration.up(qi);
    expect(qi.bulkInsert).not.toHaveBeenCalled();
    expect(calls(qi).some(([sql]) => /INSERT INTO `permissions`|permissionstitle/.test(sql))).toBe(false);
  });

  it("touches no other role: the only role id it names is Organisation Admin's", async () => {
    const qi = makeQueryInterface();
    await migration.up(qi);
    const roles = calls(qi).map(([, o]) => o.replacements?.roleid).filter((r) => r !== undefined);
    expect(new Set(roles)).toEqual(new Set([ORGANISATION_ADMIN]));
  });

  it("refuses to commit if the role would reach the superadmin wildcard (as many distinct permissions as there are rows)", async () => {
    await expect(migration.up(makeQueryInterface({ total: 195, held: 195 }))).rejects.toThrow(/superadmin wildcard/);
    await expect(migration.up(makeQueryInterface({ total: 195, held: 194 }))).resolves.toBeUndefined();
  });
});

describe("20261031120100-grant-organisation-admin-sync-permissions down()", () => {
  it("removes exactly those two grants from Organisation Admin, in one transaction, and nothing else", async () => {
    const qi = makeQueryInterface();
    await migration.down(qi);
    expect(qi.sequelize.transaction).toHaveBeenCalledTimes(1);
    expect(calls(qi)).toHaveLength(1);
    const [sql, opts] = calls(qi)[0];
    expect(sql).toMatch(/DELETE rp FROM `roles_permissions`/);
    expect(sql).toMatch(/rp\.`roleid` = :roleid AND p\.`permissionname` IN \(:names\)/);
    expect(opts.replacements.roleid).toBe(ORGANISATION_ADMIN);
    expect([...opts.replacements.names].sort()).toEqual(["sync_content", "sync_students"]);
    expect(opts.transaction).toBe(TX);
  });
});

// Makes this file a module, so its top-level names are not shared with other
// spec files when ts-jest type-checks them in the same worker.
export {};
