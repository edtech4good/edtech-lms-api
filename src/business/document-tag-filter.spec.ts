import { Op, Sequelize } from "sequelize";
import { documentFilterWhere, tagPattern } from "./document.business";
import { buildWhere } from "src/services/util.service";
import { rowMatches } from "src/test-support/fakewhere";

/** The SQL a filter list is turned into, as MySQL would be sent it (no connection is made). */
const sql = (where: object): string => {
  const generator = new Sequelize("mysql://u:p@127.0.0.1:1/x", { logging: false }).getQueryInterface().queryGenerator as unknown as {
    whereItemsQuery: (where: object) => string;
  };
  return generator.whereItemsQuery(where);
};
const tagSql = (value: string) => sql({ [Op.and]: documentFilterWhere([{ key: "documenttags", value }]).and });
const matches = (tags: unknown, value: string) => rowMatches({ documenttags: tags }, { [Op.and]: documentFilterWhere([{ key: "documenttags", value }]).and });

describe("the document list's documenttags filter", () => {
  it("asks the JSON column for a text containing the tag, not a LIKE on the JSON text", () => {
    expect(tagSql("demo")).toBe("(JSON_SEARCH(`documenttags`, 'one', '%demo%', '!') IS NOT NULL)");
    expect(tagSql("demo, dem")).toBe(
      "(JSON_SEARCH(`documenttags`, 'one', '%demo%', '!') IS NOT NULL AND JSON_SEARCH(`documenttags`, 'one', '%dem%', '!') IS NOT NULL)",
    );
    expect(tagSql("demo")).not.toMatch(/LIKE/);
  });

  it("takes the filter out of the shared substring filter", () => {
    const { and, others } = documentFilterWhere([{ key: "documenttags", value: "demo" }, { key: "documentlicence", value: "CC0" }]);
    expect(and).toHaveLength(1);
    expect(others).toEqual([{ key: "documentlicence", value: "CC0" }]);
  });

  it("leaves every other key on the shared substring behaviour", () => {
    expect(sql(buildWhere({ filter: [{ key: "documentlicence", value: "CC0" }] }, {}))).toBe("((`documentlicence` LIKE '%CC0%'))");
  });

  it("writes %, _ and the escape character literally into the pattern", () => {
    expect(tagPattern("a%b_c!d")).toBe("%a!%b!_c!!d%");
    expect(tagSql("a%b_c!d")).toBe("(JSON_SEARCH(`documenttags`, 'one', '%a!%b!_c!!d%', '!') IS NOT NULL)");
  });

  it("keeps a quote, a backslash and an injection attempt inside the SQL string", () => {
    expect(tagSql(`x' OR 1=1 --`)).toBe("(JSON_SEARCH(`documenttags`, 'one', '%x\\' OR 1=1 --%', '!') IS NOT NULL)");
    expect(tagSql('a"b\\c')).toBe("(JSON_SEARCH(`documenttags`, 'one', '%a\\\"b\\\\c%', '!') IS NOT NULL)");
  });

  it("finds a document by a tag, by part of one, and not by one it lacks", () => {
    expect(matches(["demo"], "demo")).toBe(true);
    expect(matches(["demo"], "dem")).toBe(true);
    expect(matches(["demo"], "emo")).toBe(true);
    expect(matches(["demo"], "xyz")).toBe(false);
    expect(matches([], "demo")).toBe(false);
    expect(matches(null, "demo")).toBe(false);
  });

  it("takes %, _, ! and a quote literally, and finds a Khmer tag", () => {
    expect(matches(["50%_off!"], "50%")).toBe(true);
    expect(matches(["500xoff"], "50%")).toBe(false);
    expect(matches(["500xoff"], "0_o")).toBe(false);
    expect(matches(["say \"hi\""], '"hi"')).toBe(true);
    expect(matches(["say hi"], '"hi"')).toBe(false);
    expect(matches(["ភ្នំពេញ"], "ភ្នំ")).toBe(true);
    expect(matches(["ភ្នំពេញ"], "កម្ពុជា")).toBe(false);
  });
});
