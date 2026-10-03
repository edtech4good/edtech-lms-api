import { baselinequestion } from "src/models/data-models/baselinequestion";
import { countries } from "src/models/data-models/countries";
import { curriculumbaseline } from "src/models/data-models/curriculumbaseline";
import { curriculumcountry } from "src/models/data-models/curriculumcountry";
import { curriculums } from "src/models/data-models/curriculums";
import { documents } from "src/models/data-models/documents";
import { documenttags } from "src/models/data-models/documenttags";
import { feedbacks } from "src/models/data-models/feedback";
import { grades } from "src/models/data-models/grades";
import { lessonlearnings } from "src/models/data-models/lessonlearnings";
import { lessonplans } from "src/models/data-models/lessonplan";
import { lessonpracticequestions } from "src/models/data-models/lessonpracticequestions";
import { lessonpractices } from "src/models/data-models/lessonpractices";
import { lessonquizquestions } from "src/models/data-models/lessonquizquestions";
import { lessonquizzes } from "src/models/data-models/lessonquizzes";
import { lessons } from "src/models/data-models/lessons";
import { levelquizquestions } from "src/models/data-models/levelquizquestions";
import { levels } from "src/models/data-models/levels";
import { questions } from "src/models/data-models/questions";
import { questiontags } from "src/models/data-models/questiontags";
import { schools } from "src/models/data-models/school";
import { subjects } from "src/models/data-models/subjects";
import { rowMatches, withPrimaryKey } from "./fakewhere";

/**
 * Test support: an in-memory copy of the content tables, behind the models the
 * content routes use. Specs drive real controllers, validators and business
 * classes over HTTP; only the models are replaced. `findOne`, `findAll`,
 * `findAndCountAll`, `count`, `create` and `bulkCreate` apply the `where` they are
 * given, so an ownership rule that reads a row by id really reads it.
 * Every `create` is recorded in `created` (table, then the attributes) so a spec
 * can assert what was written, and `nothingCreated()` after a refusal.
 * A found row is a copy: setting a field on it changes nothing until `save()` (or
 * the instance `update()`) writes it back, as with the real model, and `save` and
 * `update` write only the fields they are given when a `fields` option names them.
 * The static `update(values, { where })` writes into the rows it matches.
 * `snapshot()` is every table as it stands, to compare before and after a refusal
 * that must have written nothing (an update writes no `created` entry).
 * The columns in `IGNORE_CASE` are compared without regard to case, as MySQL's
 * default collation does.
 */
type Row = Record<string, unknown>;

const MODELS = {
  curriculums: [curriculums, "curriculumid"],
  questions: [questions, "questionid"],
  documents: [documents, "documentid"],
  questiontags: [questiontags, "questiontagid"],
  documenttags: [documenttags, "documenttagid"],
  subjects: [subjects, "subjectid"],
  grades: [grades, "gradeid"],
  levels: [levels, "levelid"],
  lessons: [lessons, "lessonid"],
  lessonlearnings: [lessonlearnings, "lessonlearningid"],
  lessonplans: [lessonplans, "lessonplanid"],
  lessonpractices: [lessonpractices, "lessonpracticeid"],
  lessonquizzes: [lessonquizzes, "lessonquizid"],
  lessonpracticequestions: [lessonpracticequestions, "lessonpracticequestionid"],
  lessonquizquestions: [lessonquizquestions, "lessonquizquestionid"],
  levelquizquestions: [levelquizquestions, "levelquizquestionid"],
  baselinequestion: [baselinequestion, "baselinequestionid"],
  curriculumbaseline: [curriculumbaseline, "curriculumbaselineid"],
  curriculumcountry: [curriculumcountry, "curriculumcountryid"],
  feedbacks: [feedbacks, "feedbackid"],
  schools: [schools, "schoolid"],
  countries: [countries, "countryid"],
} as const;

export type ContentTable = keyof typeof MODELS;

const IGNORE_CASE = ["questiontagname", "documenttagname"];
// what the wrapper adds to a row: never copied back into it
const INSTANCE_ONLY = new Set(["get", "setDataValue", "save", "reload", "update", "toJSON", "getGrade"]);

export class ContentFake {
  tables: Record<string, Row[]> = {};
  created: Array<{ table: ContentTable; row: Row }> = [];

  reset() {
    this.tables = Object.fromEntries(Object.keys(MODELS).map((t) => [t, []]));
    this.created = [];
  }

  add(table: ContentTable, row: Row) {
    this.tables[table].push({ isdeleted: false, ...row });
  }

  snapshot(): Record<string, Row[]> {
    return JSON.parse(JSON.stringify(this.tables));
  }

  nothingCreated() {
    expect(this.created).toEqual([]);
  }

  createdIn(table: ContentTable) {
    return this.created.filter((c) => c.table === table).map((c) => c.row);
  }

  private wrap(table: ContentTable, row: Row) {
    const write = (instance: Row, fields?: ReadonlyArray<string>) => {
      for (const key of fields ?? Object.keys(instance)) {
        if (!INSTANCE_ONLY.has(key) && key in instance) row[key] = instance[key];
      }
    };
    const instance: Row = {
      ...row,
      // what the instance holds now (the stored row with this instance's changes), as Sequelize's `get()` does
      get: () => Object.fromEntries([...Object.entries(row), ...Object.entries(instance).filter(([k]) => !INSTANCE_ONLY.has(k))]),
      // sets the value on the instance only: nothing reaches the row until `save()`
      setDataValue: (k: string, v: unknown) => {
        instance[k] = v;
      },
      save: async (o?: { fields?: ReadonlyArray<string> }) => {
        write(instance, o?.fields);
        return instance;
      },
      reload: async () => {
        Object.assign(instance, row);
        return instance;
      },
      update: async (values: Row, o?: { fields?: ReadonlyArray<string> }) => {
        Object.assign(instance, values);
        write(instance, o?.fields ?? Object.keys(values));
        return instance;
      },
      toJSON: () => row,
    };
    // the association accessor a level's points recompute reads its grade through
    if (table === "levels") {
      instance.getGrade = async () => {
        const grade = this.tables.grades.find((g) => g.gradeid === row.gradeid);
        return grade ? this.wrap("grades", grade) : null;
      };
    }
    return instance;
  }

  install() {
    this.reset();
    for (const [name, [model, key]] of Object.entries(MODELS) as Array<[ContentTable, readonly [object, string]]>) {
      withPrimaryKey(model, key);
      const m = model as unknown as Record<string, unknown>;
      const rows = () => this.tables[name];
      const match = (where: unknown) => rows().filter((r) => rowMatches(r, where, IGNORE_CASE));
      jest.spyOn(m, "findOne" as never).mockImplementation((async (o?: { where?: unknown }) => {
        const found = match(o?.where)[0];
        return found ? this.wrap(name, found) : null;
      }) as never);
      jest.spyOn(m, "findAll" as never).mockImplementation((async (o?: { where?: unknown }) => match(o?.where).map((r) => this.wrap(name, r))) as never);
      jest.spyOn(m, "findAndCountAll" as never).mockImplementation((async (o?: { where?: unknown }) => {
        const found = match(o?.where);
        return { rows: found.map((r) => this.wrap(name, r)), count: found.length };
      }) as never);
      jest.spyOn(m, "count" as never).mockImplementation((async (o?: { where?: unknown }) => match(o?.where).length) as never);
      jest.spyOn(m, "create" as never).mockImplementation((async (attrs: Row) => {
        const row = { ...attrs };
        this.created.push({ table: name, row });
        rows().push(row);
        return this.wrap(name, row);
      }) as never);
      jest.spyOn(m, "destroy" as never).mockImplementation((async (o?: { where?: unknown }) => {
        const gone = match(o?.where);
        this.tables[name] = rows().filter((r) => !gone.includes(r));
        return gone.length;
      }) as never);
      jest.spyOn(m, "update" as never).mockImplementation((async (values: Row, o?: { where?: unknown; fields?: ReadonlyArray<string> }) => {
        const found = match(o?.where);
        for (const row of found) for (const key of o?.fields ?? Object.keys(values)) row[key] = values[key];
        return [found.length];
      }) as never);
      jest.spyOn(m, "bulkCreate" as never).mockImplementation((async (list: Row[]) => {
        for (const attrs of list) {
          const row = { ...attrs };
          this.created.push({ table: name, row });
          rows().push(row);
        }
        return list;
      }) as never);
    }
  }
}
