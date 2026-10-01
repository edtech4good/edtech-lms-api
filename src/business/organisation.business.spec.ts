import { Op, Transaction } from "sequelize";
import { OrganisationBusiness } from "src/business/organisation.business";
import { countries } from "src/models/data-models/countries";
import { organisationcountry } from "src/models/data-models/organisationcountry";
import { organisations } from "src/models/data-models/organisations";
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { Logger } from "src/config";
import { dbinstance } from "src/services/dbservice";

/**
 * The organisation business rules, with the database replaced: the
 * transaction and the model statics are mocked, so what is under test is the
 * control flow - one transaction for the organisation AND its links, rollback
 * on any failure, the fields an update may touch, the soft delete, and the
 * exact `where` of each uniqueness check. The real-database proof (a failing
 * link insert leaves no organisation row; names and codes round-trip) is in
 * the PR description.
 */
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const user = { lmsuserid: "staff-1" } as never;

type Tnx = {
  commit: jest.Mock;
  rollback: jest.Mock;
  committed: boolean;
  rolledBack: boolean;
};

let tnx: Tnx;
const order: string[] = [];

const orgRow = (over: Record<string, unknown> = {}) => {
  const plain = {
    organisationid: "org-1",
    organisationname: "Old Name",
    organisationcode: "oldcode",
    organisationshortname: "ON",
    organisationpreset: "company",
    organisationstatus: true,
    uitheme: "kids",
    brandingconfig: null,
    settingsconfig: null,
    isdeleted: false,
    ...over,
  };
  return {
    ...plain,
    updated_by: undefined as string | undefined,
    save: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockReturnValue(plain),
  };
};

const link = (id: string, countryid: string, organisationid = "org-1") => ({
  organisationcountryid: id,
  organisationid,
  countryid,
  country: { countryid, countryname: `Country ${countryid.slice(0, 1)}` },
});

beforeEach(() => {
  order.length = 0;
  tnx = {
    commit: jest.fn(async () => {
      order.push("commit");
      tnx.committed = true;
    }),
    rollback: jest.fn(async () => {
      order.push("rollback");
      tnx.rolledBack = true;
    }),
    committed: false,
    rolledBack: false,
  };
  jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(tnx as never);
  // Every id asked for is a live country unless a test says otherwise.
  jest
    .spyOn(countries, "findAll")
    .mockImplementation((async (o: { where: { countryid: { [k: symbol]: string[] } } }) =>
      o.where.countryid[Op.in].map((countryid) => ({ countryid }))) as never);
  jest.spyOn(organisations, "create").mockImplementation((async () => {
    order.push("org");
    return {};
  }) as never);
  jest.spyOn(organisationcountry, "bulkCreate").mockImplementation((async () => {
    order.push("links");
    return [];
  }) as never);
  jest.spyOn(organisationcountry, "destroy").mockResolvedValue(1 as never);
  jest.spyOn(organisationcountry, "findAll").mockResolvedValue([] as never);
  jest.spyOn(organisations, "findOne").mockResolvedValue(orgRow() as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const newOrg = {
  organisationname: "Sample Network",
  organisationcode: "samplenet",
  organisationshortname: "SN",
  organisationpreset: "schoolnetwork",
};

describe("OrganisationBusiness.createorganisation", () => {
  it("writes the organisation and ALL its country links in one transaction, then commits", async () => {
    const result = await new OrganisationBusiness().createorganisation(newOrg, [A, B], user);

    expect(order).toEqual(["org", "links", "commit"]);
    const createCall = (organisations.create as jest.Mock).mock.calls[0];
    expect(createCall[1]).toEqual({ transaction: tnx });
    expect(createCall[0]).toMatchObject({
      organisationname: "Sample Network",
      organisationcode: "samplenet",
      organisationshortname: "SN",
      organisationpreset: "schoolnetwork",
      isdeleted: false,
      created_by: "staff-1",
    });
    expect(createCall[0].organisationid).toMatch(/^[0-9a-f-]{36}$/);

    const [rows, opts] = (organisationcountry.bulkCreate as jest.Mock).mock.calls[0];
    expect(opts).toEqual({ transaction: tnx });
    expect(rows.map((r: { countryid: string }) => r.countryid)).toEqual([A, B]);
    for (const r of rows) expect(r.organisationid).toBe(createCall[0].organisationid);
    expect(result.organisationcode).toBe("oldcode"); // what getorganisationbyid re-read
    expect(tnx.rollback).not.toHaveBeenCalled();
  });

  it("leaves NO organisation row when writing the links fails: rolls back, never commits, rethrows", async () => {
    (organisationcountry.bulkCreate as jest.Mock).mockImplementation(async () => {
      order.push("links");
      throw new Error("links failed");
    });

    await expect(
      new OrganisationBusiness().createorganisation(newOrg, [A], user),
    ).rejects.toThrow("links failed");

    // The organisation insert ran, and in the same transaction that was then
    // rolled back - so it cannot persist.
    expect(order).toEqual(["org", "links", "rollback"]);
    expect((organisations.create as jest.Mock).mock.calls[0][1].transaction).toBe(tnx);
    expect(tnx.commit).not.toHaveBeenCalled();
  });

  it("writes no links when the organisation insert itself fails (e.g. a duplicate code)", async () => {
    (organisations.create as jest.Mock).mockRejectedValue(new Error("duplicate"));
    await expect(
      new OrganisationBusiness().createorganisation(newOrg, [A], user),
    ).rejects.toThrow("duplicate");
    expect(organisationcountry.bulkCreate).not.toHaveBeenCalled();
    expect(tnx.rolledBack).toBe(true);
    expect(tnx.commit).not.toHaveBeenCalled();
  });

  it("rejects with the commit's error, after one rollback attempt, when the commit fails", async () => {
    tnx.commit.mockRejectedValue(new Error("commit failed"));
    tnx.rollback.mockRejectedValue(new Error("already finished"));
    jest.spyOn(Logger, "error").mockImplementation(() => Logger);
    await expect(
      new OrganisationBusiness().createorganisation(newOrg, [A], user),
    ).rejects.toThrow("commit failed");
    expect(tnx.rollback).toHaveBeenCalledTimes(1);
  });

  it("refuses a country that is not live, before writing anything, as INVALID_INPUT on countryids", async () => {
    (countries.findAll as jest.Mock).mockResolvedValue([{ countryid: A }]); // B missing
    const error = await new OrganisationBusiness()
      .createorganisation(newOrg, [A, B], user)
      .catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe(ErrorCode.INVALID_INPUT);
    expect(error.fields).toEqual([expect.objectContaining({ field: "countryids" })]);
    expect(organisations.create).not.toHaveBeenCalled();
    expect(organisationcountry.bulkCreate).not.toHaveBeenCalled();
    expect(tnx.rolledBack).toBe(true);
  });

  it("checks the countries under a shared lock inside the transaction, soft-deleted ones excluded", async () => {
    await new OrganisationBusiness().createorganisation(newOrg, [A], user);
    const opts = (countries.findAll as jest.Mock).mock.calls[0][0];
    expect(opts.transaction).toBe(tnx);
    expect(opts.lock).toBe(Transaction.LOCK.SHARE);
    expect(opts.where.isdeleted).toBe(false);
    expect(opts.where.countryid[Op.in]).toEqual([A]);
  });

  it("refuses a repeated country id and an empty list even when the request-level rule was skipped", async () => {
    for (const ids of [[A, A], []]) {
      const error = await new OrganisationBusiness()
        .createorganisation(newOrg, ids, user)
        .catch((e) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe(ErrorCode.INVALID_INPUT);
    }
    expect(organisations.create).not.toHaveBeenCalled();
  });

  it("leaves uitheme and brandingconfig to the column defaults when not given, and passes them when given", async () => {
    await new OrganisationBusiness().createorganisation(newOrg, [A], user);
    const first = (organisations.create as jest.Mock).mock.calls[0][0];
    expect(first).not.toHaveProperty("uitheme");
    expect(first).not.toHaveProperty("brandingconfig");
    expect(first).not.toHaveProperty("settingsconfig");

    await new OrganisationBusiness().createorganisation(
      { ...newOrg, uitheme: "corporate", brandingconfig: { tilecolour: "#112233" } },
      [A],
      user,
    );
    const second = (organisations.create as jest.Mock).mock.calls[1][0];
    expect(second.uitheme).toBe("corporate");
    expect(second.brandingconfig).toEqual({ tilecolour: "#112233" });
  });
});

describe("OrganisationBusiness.updateorganisation", () => {
  const changes = { organisationname: "New Name", organisationshortname: "NN" };

  it("locks the row, refuses a missing or deleted organisation as NOT_FOUND, and rolls back", async () => {
    (organisations.findOne as jest.Mock).mockResolvedValue(null);
    const error = await new OrganisationBusiness()
      .updateorganisation("org-1", changes, [A], user)
      .catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe(ErrorCode.NOT_FOUND);
    const opts = (organisations.findOne as jest.Mock).mock.calls[0][0];
    expect(opts.where).toEqual({ organisationid: "org-1", isdeleted: false });
    expect(opts.lock).toBe(Transaction.LOCK.UPDATE);
    expect(opts.transaction).toBe(tnx);
    expect(tnx.rolledBack).toBe(true);
    expect(tnx.commit).not.toHaveBeenCalled();
  });

  it("saves only the editable fields - never the code, the preset or settingsconfig", async () => {
    const row = orgRow();
    (organisations.findOne as jest.Mock).mockResolvedValue(row);

    await new OrganisationBusiness().updateorganisation(
      "org-1",
      {
        ...changes,
        // A caller that smuggles forbidden fields in must not get them persisted.
        ...({
          organisationcode: "hijacked",
          organisationpreset: "schoolnetwork",
          settingsconfig: { x: 1 },
          isdeleted: true,
        } as object),
      },
      [A],
      user,
    );

    const { fields, transaction } = row.save.mock.calls[0][0];
    expect(transaction).toBe(tnx);
    expect([...fields].sort()).toEqual(
      ["organisationname", "organisationshortname", "updated_at", "updated_by"].sort(),
    );
    for (const forbidden of ["organisationcode", "organisationpreset", "settingsconfig", "isdeleted"]) {
      expect(fields).not.toContain(forbidden);
    }
    expect(row.organisationcode).toBe("oldcode");
    expect(row.organisationpreset).toBe("company");
    expect(row.organisationname).toBe("New Name");
  });

  it("adds uitheme, brandingconfig and status to the saved fields only when they were given", async () => {
    const row = orgRow();
    (organisations.findOne as jest.Mock).mockResolvedValue(row);
    await new OrganisationBusiness().updateorganisation(
      "org-1",
      { ...changes, uitheme: "corporate", brandingconfig: null, organisationstatus: false },
      [A],
      user,
    );
    const { fields } = row.save.mock.calls[0][0];
    expect(fields).toEqual(expect.arrayContaining(["uitheme", "brandingconfig", "organisationstatus"]));
    expect(row.brandingconfig).toBeNull();
    expect(row.organisationstatus).toBe(false);
    expect(row.updated_by).toBe("staff-1");
  });

  it("replaces the country set: removes the links no longer wanted, adds the new ones, leaves the rest", async () => {
    (organisationcountry.findAll as jest.Mock)
      .mockResolvedValueOnce([link("l-a", A), link("l-b", B)]) // current links
      .mockResolvedValue([link("l-b", B), link("l-c", C)]); // re-read after commit

    await new OrganisationBusiness().updateorganisation("org-1", changes, [B, C], user);

    expect(organisationcountry.destroy).toHaveBeenCalledTimes(1);
    expect((organisationcountry.destroy as jest.Mock).mock.calls[0][0]).toEqual({
      where: { organisationcountryid: { [Op.in]: ["l-a"] } },
      transaction: tnx,
    });
    const [rows, opts] = (organisationcountry.bulkCreate as jest.Mock).mock.calls[0];
    expect(rows.map((r: { countryid: string }) => r.countryid)).toEqual([C]);
    expect(opts).toEqual({ transaction: tnx });
    expect(tnx.committed).toBe(true);
  });

  it("touches no links when the set is unchanged", async () => {
    (organisationcountry.findAll as jest.Mock).mockResolvedValue([link("l-a", A), link("l-b", B)]);
    await new OrganisationBusiness().updateorganisation("org-1", changes, [B, A], user);
    expect(organisationcountry.destroy).not.toHaveBeenCalled();
    expect(organisationcountry.bulkCreate).not.toHaveBeenCalled();
    expect(tnx.committed).toBe(true);
  });

  it("rolls everything back, never commits, when adding a link fails (the field changes go with it)", async () => {
    const row = orgRow();
    (organisations.findOne as jest.Mock).mockResolvedValue(row);
    (organisationcountry.findAll as jest.Mock).mockResolvedValue([]);
    (organisationcountry.bulkCreate as jest.Mock).mockRejectedValue(new Error("links failed"));

    await expect(
      new OrganisationBusiness().updateorganisation("org-1", changes, [A], user),
    ).rejects.toThrow("links failed");

    // The save used the transaction, and the transaction was rolled back.
    expect(row.save.mock.calls[0][0].transaction).toBe(tnx);
    expect(tnx.rolledBack).toBe(true);
    expect(tnx.commit).not.toHaveBeenCalled();
  });

  it("refuses an unusable country before saving anything", async () => {
    const row = orgRow();
    (organisations.findOne as jest.Mock).mockResolvedValue(row);
    (countries.findAll as jest.Mock).mockResolvedValue([]);
    const error = await new OrganisationBusiness()
      .updateorganisation("org-1", changes, [A], user)
      .catch((e) => e);
    expect(error.code).toBe(ErrorCode.INVALID_INPUT);
    expect(row.save).not.toHaveBeenCalled();
    expect(tnx.rolledBack).toBe(true);
  });
});

describe("OrganisationBusiness.deleteorganisation", () => {
  it("soft-deletes with one conditional UPDATE: isdeleted, deleted_at, deleted_by - never a DELETE", async () => {
    const update = jest.spyOn(organisations, "update").mockResolvedValue([1] as never);
    const destroy = jest.spyOn(organisations, "destroy");

    await expect(new OrganisationBusiness().deleteorganisation("org-1", user)).resolves.toBe(true);

    const [values, opts] = update.mock.calls[0] as [Record<string, unknown>, { where: object }];
    expect(values).toMatchObject({ isdeleted: true, deleted_by: "staff-1" });
    expect(values.deleted_at).toBeInstanceOf(Date);
    expect(opts.where).toEqual({ organisationid: "org-1", isdeleted: false });
    expect(destroy).not.toHaveBeenCalled();
  });

  it("answers NOT_FOUND when nothing was deleted: missing, or already deleted", async () => {
    jest.spyOn(organisations, "update").mockResolvedValue([0] as never);
    const error = await new OrganisationBusiness()
      .deleteorganisation("org-1", user)
      .catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe(ErrorCode.NOT_FOUND);
  });
});

describe("OrganisationBusiness uniqueness checks", () => {
  it("the NAME check looks only at live organisations, so a deleted organisation's name can be reused", async () => {
    const count = jest.spyOn(organisations, "count").mockResolvedValue(1 as never);
    await expect(
      new OrganisationBusiness().isexistsorganisationname("Sample Network"),
    ).resolves.toBe(true);
    expect(count.mock.calls[0][0]).toEqual({
      where: { organisationname: "Sample Network", isdeleted: false },
    });
  });

  it("the NAME check on update excludes the organisation itself", async () => {
    const count = jest.spyOn(organisations, "count").mockResolvedValue(0 as never);
    await expect(
      new OrganisationBusiness().isexistsorganisationname("Sample Network", "org-1"),
    ).resolves.toBe(false);
    expect(count.mock.calls[0][0]).toEqual({
      where: {
        organisationname: "Sample Network",
        isdeleted: false,
        organisationid: { [Op.ne]: "org-1" },
      },
    });
  });

  it("the CODE check looks at ALL organisations, deleted ones included: a code is never reissued", async () => {
    const count = jest.spyOn(organisations, "count").mockResolvedValue(1 as never);
    await expect(new OrganisationBusiness().isexistsorganisationcode("samplenet")).resolves.toBe(true);
    const where = (count.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where).toEqual({ organisationcode: "samplenet" });
    expect(where).not.toHaveProperty("isdeleted");
  });

  it("findunusablecountries returns the ids that are missing or deleted, and asks only for live ones", async () => {
    (countries.findAll as jest.Mock).mockResolvedValue([{ countryid: A }]);
    await expect(new OrganisationBusiness().findunusablecountries([A, B, C])).resolves.toEqual([B, C]);
    expect((countries.findAll as jest.Mock).mock.calls[0][0].where.isdeleted).toBe(false);
    (countries.findAll as jest.Mock).mockClear();
    await expect(new OrganisationBusiness().findunusablecountries([])).resolves.toEqual([]);
    expect(countries.findAll).not.toHaveBeenCalled();
  });
});

describe("OrganisationBusiness reads", () => {
  it("getorganisationbyid is NOT_FOUND for a missing or deleted organisation, and asks for live rows only", async () => {
    (organisations.findOne as jest.Mock).mockResolvedValue(null);
    const error = await new OrganisationBusiness().getorganisationbyid("org-1").catch((e) => e);
    expect(error.code).toBe(ErrorCode.NOT_FOUND);
    expect((organisations.findOne as jest.Mock).mock.calls[0][0].where).toEqual({
      organisationid: "org-1",
      isdeleted: false,
    });
  });

  it("includes only LIVE linked countries (an inner join on a country that is not deleted)", async () => {
    (organisationcountry.findAll as jest.Mock).mockResolvedValue([link("l-a", A)]);
    const org = await new OrganisationBusiness().getorganisationbyid("org-1");
    const include = (organisationcountry.findAll as jest.Mock).mock.calls[0][0].include[0];
    expect(include).toMatchObject({ as: "country", required: true, where: { isdeleted: false } });
    expect(org.countries).toEqual([{ countryid: A, countryname: "Country a" }]);
  });

  it("getorganisationall pages like the other lists (1-based, default 20) and never lists deleted organisations", async () => {
    const findAndCountAll = jest
      .spyOn(organisations, "findAndCountAll")
      .mockResolvedValue({ rows: [orgRow()], count: 41 } as never);

    const page = await new OrganisationBusiness().getorganisationall({ pageindex: 3, pagesize: 10 });
    expect(findAndCountAll.mock.calls[0][0]).toMatchObject({ limit: 10, offset: 20, where: { isdeleted: false } });
    expect(page).toMatchObject({ count: 41, pageindex: 3, pagesize: 10 });
    expect(page.rows[0].countries).toEqual([]);

    await new OrganisationBusiness().getorganisationall({});
    expect(findAndCountAll.mock.calls[1][0]).toMatchObject({ limit: 20, offset: 0 });
    await new OrganisationBusiness().getorganisationall({ pageindex: 0, pagesize: 5 });
    expect(findAndCountAll.mock.calls[2][0]).toMatchObject({ limit: 5, offset: 0 });
  });

  it("getorganisationall escapes LIKE wildcards in the name filter so '%' and '_' match themselves", async () => {
    const findAndCountAll = jest
      .spyOn(organisations, "findAndCountAll")
      .mockResolvedValue({ rows: [], count: 0 } as never);
    await new OrganisationBusiness().getorganisationall({ organisationname: " 50%_off\\ " });
    const where = findAndCountAll.mock.calls[0][0]!.where as Record<string | symbol, unknown>;
    expect(where.organisationname).toEqual({ [Op.like]: "%50\\%\\_off\\\\%" });
    expect(where.isdeleted).toBe(false);
  });
});
