/**
 * Index on `tokens.lmsuserid`. Drives up()/down() against a mocked
 * QueryInterface (what the migration ASKS MySQL for). The real-database proof
 * (index present, EXPLAIN using it, up/down/up) is in the PR description.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require("./migrations/20261001120300-add-index-on-tokens-lmsuserid");

type IndexRow = { name: string; unique?: boolean; fields: Array<{ attribute: string }> };
const idx = (name: string, ...columns: string[]): IndexRow => ({
  name,
  unique: false,
  fields: columns.map((attribute) => ({ attribute })),
});

const TX = { id: "the-transaction" };

const makeQueryInterface = (existing: IndexRow[] = []) => ({
  showIndex: jest.fn().mockResolvedValue([idx("PRIMARY", "token"), ...existing]),
  addIndex: jest.fn().mockResolvedValue(undefined),
  removeIndex: jest.fn().mockResolvedValue(undefined),
  sequelize: { transaction: jest.fn((cb: (t: unknown) => Promise<void>) => cb(TX)) },
});

describe("20261001120300 up()", () => {
  it("adds a plain index on tokens.lmsuserid, in a transaction", async () => {
    const qi = makeQueryInterface();
    await migration.up(qi);
    expect(qi.addIndex).toHaveBeenCalledTimes(1);
    expect(qi.addIndex).toHaveBeenCalledWith("tokens", ["lmsuserid"], {
      name: "tokens_lmsuserid_idx",
      transaction: TX,
    });
    expect(qi.sequelize.transaction).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the index already exists (idempotent)", async () => {
    const qi = makeQueryInterface([idx("tokens_lmsuserid_idx", "lmsuserid")]);
    await migration.up(qi);
    expect(qi.addIndex).not.toHaveBeenCalled();
  });

  it("does nothing when another index already covers exactly lmsuserid", async () => {
    const qi = makeQueryInterface([idx("by_user", "lmsuserid")]);
    await migration.up(qi);
    expect(qi.addIndex).not.toHaveBeenCalled();
  });

  it("does not mistake a composite index that merely starts or ends with lmsuserid for one that covers it", async () => {
    const qi = makeQueryInterface([idx("composite", "lmsuserid", "tokentype")]);
    await migration.up(qi);
    expect(qi.addIndex).toHaveBeenCalledTimes(1);
  });
});

describe("20261001120300 down()", () => {
  it("removes the index it added, in a transaction", async () => {
    const qi = makeQueryInterface([idx("tokens_lmsuserid_idx", "lmsuserid")]);
    await migration.down(qi);
    expect(qi.removeIndex).toHaveBeenCalledWith("tokens", "tokens_lmsuserid_idx", { transaction: TX });
  });

  it("removes nothing when the index is absent, and never an index it did not add", async () => {
    const qi = makeQueryInterface([idx("by_user", "lmsuserid")]);
    await migration.down(qi);
    expect(qi.removeIndex).not.toHaveBeenCalled();
  });
});

export {};
