import { dbinstance } from "src/services/dbservice";
import { OrgContext } from "src/decorators/org.decorator";
import { ContentFake } from "src/test-support/content-fake";
import { putTranslations } from "./content-translations";

/**
 * The write of `PUT /translations/:tablename/:rowid` when two requests save the same text at once. The first time a text
 * is translated there is no row to lock, so two requests that both read "no translation yet" must not both insert: the
 * unique key (table, row, field, subkey, language) would refuse the second. The fake enforces that key the way MySQL
 * does (`create` throws on a duplicate), so a write that reads first and inserts after fails here as it fails there.
 * The routes' other behaviour is proved over HTTP in modules/content-scope.leak.spec.ts.
 */
const db = new ContentFake();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const org: OrgContext = { organisationid: X, isplatform: false, permissions: ["superadmin"] };
const [A, GA, VA, L1] = [id(100), id(101), id(102), id(103)];

const transaction = { commit: jest.fn(), rollback: jest.fn(), LOCK: { SHARE: "SHARE", UPDATE: "UPDATE" } };

beforeEach(() => {
  jest.restoreAllMocks();
  db.install();
  transaction.commit.mockClear();
  transaction.rollback.mockClear();
  jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(transaction as never);
  db.add("organisations", { organisationid: X, contentlanguage: "en" });
  db.add("curriculums", { curriculumid: A, curriculumname: "Reading", organisationid: X, curriculumstatus: true });
  db.add("grades", { gradeid: GA, curriculumid: A, gradename: "Grade A", gradeorder: 1, gradestatus: true });
  db.add("levels", { levelid: VA, gradeid: GA, levelname: "Level A", levelorder: 1, levelstatus: true });
  db.add("lessons", { lessonid: L1, levelid: VA, lessonname: "Lesson one", lessondescription: "About one", lessonorder: 1, lessonstatus: true, total_points: 1, passing_points: 0 });
});

const put = (fields: Record<string, string>, language = "km") => putTranslations(org, "lessons", L1, { language, fields });

describe("putTranslations: two saves at once", () => {
  it("two first-time saves of the same text both answer, and leave one row", async () => {
    const [one, two] = await Promise.all([put({ lessonname: "first km" }), put({ lessonname: "second km" })]);
    expect(db.tables.contenttranslations).toHaveLength(1);
    expect(one.translations).toHaveLength(1);
    expect(two.translations).toHaveLength(1);
    // both answers name the one row, and the text is one of the two that were sent
    expect(two.translations[0].translationid).toBe(one.translations[0].translationid);
    expect(["first km", "second km"]).toContain(db.tables.contenttranslations[0].text);
    expect(transaction.rollback).not.toHaveBeenCalled();
  });

  it("two first-time saves of overlapping sets of texts leave one row per text", async () => {
    await Promise.all([put({ lessonname: "a km", lessondescription: "b km" }), put({ lessondescription: "b2 km", lessonname: "a2 km" })]);
    expect(db.tables.contenttranslations.map((t) => t.field).sort()).toEqual(["lessondescription", "lessonname"]);
  });

  it("six at once leave one row", async () => {
    const answers = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => put({ lessonname: `km ${n}` })));
    expect(answers).toHaveLength(6);
    expect(db.tables.contenttranslations).toHaveLength(1);
  });

  it("a save of a text that already has a translation keeps its id, its owner and its key", async () => {
    await put({ lessonname: "first km" });
    const first = { ...db.tables.contenttranslations[0] };
    await put({ lessonname: "second km" });
    expect(db.tables.contenttranslations).toEqual([{ ...first, text: "second km", lastupdated: expect.any(Date) }]);
    expect(db.created).toHaveLength(1);
  });

  it("the language in another case is the same row (the key is case-insensitive in MySQL)", async () => {
    const [one, two] = await Promise.all([put({ lessonname: "x" }, "km"), put({ lessonname: "y" }, "KM")]);
    expect(db.tables.contenttranslations).toHaveLength(1);
    expect(one.translations[0].translationid).toBe(two.translations[0].translationid);
  });

  it("a refused save writes nothing and opens no transaction", async () => {
    await expect(put({ lessonname: "x" }, "en")).rejects.toMatchObject({ status: 400 });
    expect(db.tables.contenttranslations).toEqual([]);
  });
});
