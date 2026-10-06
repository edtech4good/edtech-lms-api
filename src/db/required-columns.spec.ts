import { Sequelize } from "sequelize";
import { initModels } from "src/models/data-models/init-models";
import { curriculums } from "src/models/data-models/curriculums";
import { documents } from "src/models/data-models/documents";
import { documenttags } from "src/models/data-models/documenttags";
import { lmsusers } from "src/models/data-models/lmsusers";
import { questions } from "src/models/data-models/questions";
import { questiontags } from "src/models/data-models/questiontags";
import { schools } from "src/models/data-models/school";
import { schoolusers } from "src/models/data-models/schoolusers";
import { students } from "src/models/data-models/students";
import { subjects } from "src/models/data-models/subjects";
import {
  assertNoViolations,
  C5_COLUMNS,
  C8_COLUMNS,
  describeViolations,
  findViolations,
  LISTED_IDS,
  relaxColumns,
  REQUIRED_COLUMNS,
  requireColumns,
} from "./required-columns";
import { makeRequiredColumnsQI } from "src/test-support/required-columns-qi";

/**
 * The shared core of C5 and C8: which columns become required, what the guard
 * refuses and says, and what the tightening asks MySQL for. The migrations are
 * driven in their own specs; the real runs against MySQL are described in the
 * change description.
 */
describe("the list of required columns", () => {
  it("is exactly the nine columns C5 and C8 tighten, each with its table's primary key", () => {
    expect(C5_COLUMNS.map((c) => `${c.table}.${c.column}:${c.pk}`)).toEqual([
      "schools.organisationid:schoolid",
      "students.schoolid:studentid",
      "schoolusers.schoolid:schooluserid",
    ]);
    expect(C8_COLUMNS.map((c) => `${c.table}.${c.column}:${c.pk}`)).toEqual([
      "curriculums.organisationid:curriculumid",
      "questions.organisationid:questionid",
      "documents.organisationid:documentid",
      "questiontags.organisationid:questiontagid",
      "documenttags.organisationid:documenttagid",
      "subjects.organisationid:subjectid",
    ]);
    expect(REQUIRED_COLUMNS).toHaveLength(9);
  });

  it("leaves lmsusers.organisationid out: a platform account belongs to no organisation, by design", () => {
    expect(REQUIRED_COLUMNS.find((c) => c.table === "lmsusers")).toBeUndefined();
  });

  it("is what the models say: allowNull false on all nine, still allowNull true on lmsusers.organisationid", () => {
    initModels(new Sequelize({ dialect: "mysql" }));
    const byTable = { schools, students, schoolusers, curriculums, questions, documents, questiontags, documenttags, subjects } as unknown as Record<
      string,
      { rawAttributes: Record<string, { allowNull?: boolean }> }
    >;
    for (const c of REQUIRED_COLUMNS) {
      expect({ column: `${c.table}.${c.column}`, allowNull: byTable[c.table].rawAttributes[c.column]?.allowNull }).toEqual({
        column: `${c.table}.${c.column}`,
        allowNull: false,
      });
    }
    expect((lmsusers as unknown as { rawAttributes: Record<string, { allowNull?: boolean }> }).rawAttributes.organisationid.allowNull).toBe(true);
  });
});

describe("findViolations", () => {
  it("counts the NULL rows of each column (all of them) and lists their primary keys in key order, nothing else", async () => {
    const fake = makeRequiredColumnsQI(C5_COLUMNS, {
      "schools.organisationid": { nulls: ["s2", "s1"] },
      "students.schoolid": { nulls: [] },
      "schoolusers.schoolid": { nulls: ["u1"] },
    });
    const found = await findViolations(fake.sequelize as never, C5_COLUMNS);
    expect(found.map((v) => ({ column: `${v.table}.${v.column}`, count: v.count, ids: v.ids }))).toEqual([
      { column: "schools.organisationid", count: 2, ids: ["s1", "s2"] },
      { column: "students.schoolid", count: 0, ids: [] },
      { column: "schoolusers.schoolid", count: 1, ids: ["u1"] },
    ]);
    expect(fake.writes()).toEqual([]);
  });

  it("caps the listed ids but never the count", async () => {
    const many = Array.from({ length: LISTED_IDS + 7 }, (_, i) => `id-${String(i).padStart(3, "0")}`);
    const fake = makeRequiredColumnsQI(C8_COLUMNS, { "questions.organisationid": { nulls: many } });
    const [curriculums, questions] = await findViolations(fake.sequelize as never, C8_COLUMNS);
    expect(curriculums.count).toBe(0);
    expect(questions.count).toBe(LISTED_IDS + 7);
    expect(questions.ids).toEqual(many.slice(0, LISTED_IDS));
    const message = describeViolations("C8", [questions]);
    expect(message).toContain(`first ${LISTED_IDS} of ${LISTED_IDS + 7}`);
  });

  it("refuses an identifier that is not a plain name before it reaches SQL", async () => {
    const fake = makeRequiredColumnsQI([]);
    await expect(
      findViolations(fake.sequelize as never, [{ table: "schools`; DROP TABLE x; --", column: "organisationid", pk: "schoolid" }]),
    ).rejects.toThrow(/Unexpected identifier/);
    expect(fake.statements).toEqual([]);
  });
});

describe("assertNoViolations: the guard", () => {
  it("throws naming every offending column with its count and ids, and sends no DDL", async () => {
    const fake = makeRequiredColumnsQI(C5_COLUMNS, {
      "schools.organisationid": { nulls: ["school-a"] },
      "students.schoolid": { nulls: ["student-a", "student-b"] },
    });
    const err = await assertNoViolations(fake.queryInterface, "C5", C5_COLUMNS, fake.TX as never).catch((e) => e as Error);
    expect(err).toBeInstanceOf(Error);
    const lines = (err as Error).message.split("\n");
    expect(lines[0]).toBe("C5 refused: 2 required column(s) still hold rows with no value, so nothing was changed.");
    expect(lines.slice(1, 3)).toEqual([
      "schools.organisationid: 1 row(s) with no value (schoolid, all 1): school-a",
      "students.schoolid: 2 row(s) with no value (studentid, all 2): student-a, student-b",
    ]);
    expect(lines.join("\n")).not.toContain("schoolusers.schoolid");
    expect(fake.alters()).toEqual([]);
  });

  it("passes silently when every count is zero", async () => {
    const fake = makeRequiredColumnsQI(C8_COLUMNS);
    await expect(assertNoViolations(fake.queryInterface, "C8", C8_COLUMNS, fake.TX as never)).resolves.toBeUndefined();
  });
});

describe("requireColumns", () => {
  it("MODIFYs each nullable column to NOT NULL, keeping the type, charset and collation the database reports", async () => {
    const fake = makeRequiredColumnsQI(C5_COLUMNS, {
      "schools.organisationid": { collation: "utf8mb4_0900_ai_ci" },
      "students.schoolid": { type: "varchar(36)" },
    });
    await requireColumns(fake.queryInterface, C5_COLUMNS, fake.TX as never);
    expect(fake.alters()).toEqual([
      "ALTER TABLE `schools` MODIFY COLUMN `organisationid` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL",
      "ALTER TABLE `students` MODIFY COLUMN `schoolid` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL",
      "ALTER TABLE `schoolusers` MODIFY COLUMN `schoolid` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL",
    ]);
    expect(fake.writes()).toEqual([]);
  });

  it("skips a column that is already required: a second run sends no ALTER", async () => {
    const fake = makeRequiredColumnsQI(C8_COLUMNS);
    await requireColumns(fake.queryInterface, C8_COLUMNS, fake.TX as never);
    fake.statements.length = 0;
    await requireColumns(fake.queryInterface, C8_COLUMNS, fake.TX as never);
    expect(fake.alters()).toEqual([]);
  });

  it("finishes a run that stopped halfway: only the columns still nullable are changed", async () => {
    const fake = makeRequiredColumnsQI(C8_COLUMNS, {
      "curriculums.organisationid": { nullable: false },
      "questions.organisationid": { nullable: false },
    });
    await requireColumns(fake.queryInterface, C8_COLUMNS, fake.TX as never);
    expect(fake.alters().map((s) => /ALTER TABLE `(\w+)`/.exec(s)![1])).toEqual(["documents", "questiontags", "documenttags", "subjects"]);
  });

  it("a row that appears after the guard makes MySQL refuse that column: nothing is forced to a value", async () => {
    const fake = makeRequiredColumnsQI(C5_COLUMNS, { "students.schoolid": { nulls: ["late"] } });
    await expect(requireColumns(fake.queryInterface, C5_COLUMNS, fake.TX as never)).rejects.toThrow("Invalid use of NULL value");
    expect(fake.cols.get("students.schoolid")!.nullable).toBe(true);
    expect(fake.writes()).toEqual([]);
  });

  it("keeps a column comment, escaped, and refuses a type or collation that is not a plain name", async () => {
    const withComment = makeRequiredColumnsQI(C5_COLUMNS.slice(0, 1), { "schools.organisationid": { comment: "it's the owner" } });
    await requireColumns(withComment.queryInterface, C5_COLUMNS.slice(0, 1), withComment.TX as never);
    expect(withComment.alters()[0]).toMatch(/NOT NULL COMMENT 'it\\'s the owner'$/);

    const badType = makeRequiredColumnsQI(C5_COLUMNS.slice(0, 1), { "schools.organisationid": { type: "varchar(36); DROP TABLE x" } });
    await expect(requireColumns(badType.queryInterface, C5_COLUMNS.slice(0, 1), badType.TX as never)).rejects.toThrow(/Unexpected type/);
    const badCollation = makeRequiredColumnsQI(C5_COLUMNS.slice(0, 1), { "schools.organisationid": { collation: "x; DROP TABLE y" } });
    await expect(requireColumns(badCollation.queryInterface, C5_COLUMNS.slice(0, 1), badCollation.TX as never)).rejects.toThrow(/Unexpected identifier/);
    expect(badType.alters().concat(badCollation.alters())).toEqual([]);
  });

  it("names the column and the remedy when it does not exist at all", async () => {
    const fake = makeRequiredColumnsQI(C5_COLUMNS, { "students.schoolid": { missing: true } });
    await expect(requireColumns(fake.queryInterface, C5_COLUMNS, fake.TX as never)).rejects.toThrow(
      "students.schoolid does not exist: run the earlier migrations first.",
    );
  });
});

describe("relaxColumns: the down() mirror", () => {
  it("makes each required column nullable again, in reverse order, and writes no data", async () => {
    const fake = makeRequiredColumnsQI(C5_COLUMNS, Object.fromEntries(C5_COLUMNS.map((c) => [`${c.table}.${c.column}`, { nullable: false }])));
    await relaxColumns(fake.queryInterface, C5_COLUMNS, fake.TX as never);
    expect(fake.alters().map((s) => /ALTER TABLE `(\w+)`/.exec(s)![1])).toEqual(["schoolusers", "students", "schools"]);
    expect(fake.alters().every((s) => /NULL DEFAULT NULL$/.test(s))).toBe(true);
    expect(fake.writes()).toEqual([]);
  });

  it("skips what is already nullable and what is already gone", async () => {
    const fake = makeRequiredColumnsQI(C5_COLUMNS, { "students.schoolid": { missing: true }, "schools.organisationid": { nullable: false } });
    await relaxColumns(fake.queryInterface, C5_COLUMNS, fake.TX as never);
    expect(fake.alters().map((s) => /ALTER TABLE `(\w+)`/.exec(s)![1])).toEqual(["schools"]);
  });
});
