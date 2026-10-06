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
import { organisationcountry } from "src/models/data-models/organisationcountry";
import { organisations } from "src/models/data-models/organisations";
import { schoolcontributedata } from "src/models/data-models/schoolcontributedata";
import { questions } from "src/models/data-models/questions";
import { questiontags } from "src/models/data-models/questiontags";
import { schools } from "src/models/data-models/school";
import { schoolusers } from "src/models/data-models/schoolusers";
import { rpiuseraccess } from "src/models/data-models/rpiuseraccess";
import { standards } from "src/models/data-models/standard";
import { studentactives } from "src/models/data-models/studentactives";
import { studentappusages } from "src/models/data-models/studentappusage";
import { studentlearningprogress } from "src/models/data-models/studentlearningprogress";
import { studentpoints } from "src/models/data-models/studentpoints";
import { studentprogressquestions } from "src/models/data-models/studentprogressquestions";
import { logfiles } from "src/models/data-models/logfiles";
import { studentgradesprogress } from "src/models/data-models/studentgradesprogress";
import { studentlessonsprogress } from "src/models/data-models/studentlessonprogress";
import { studentlevelsprogress } from "src/models/data-models/studentlevelsprogress";
import { studentprogress } from "src/models/data-models/studentprogress";
import { students } from "src/models/data-models/students";
import { subjects } from "src/models/data-models/subjects";
import { syncs } from "src/models/data-models/syncrecord";
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
 * The static `update(values, { where })` writes into the rows it matches (a field named in `fields` that `values` does not hold is
 * skipped, as Sequelize skips it). `bulkCreate` with `updateOnDuplicate` updates the stored row that has the same primary key
 * (the listed fields only) instead of adding one.
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
  students: [students, "studentid"],
  schoolusers: [schoolusers, "schooluserid"],
  standards: [standards, "standardid"],
  schoolcontributedata: [schoolcontributedata, "schoolcontributeid"],
  organisationcountry: [organisationcountry, "organisationcountryid"],
  organisations: [organisations, "organisationid"],
  // what the reports read
  studentprogress: [studentprogress, "studentprogressid"],
  studentlessonsprogress: [studentlessonsprogress, "studentlessonprogressid"],
  studentlevelsprogress: [studentlevelsprogress, "studentlevelprogressid"],
  studentgradesprogress: [studentgradesprogress, "studentgradeprogressid"],
  rpiuseraccess: [rpiuseraccess, "rpiuseraccessid"],
  studentappusages: [studentappusages, "studentappusageid"],
  syncs: [syncs, "syncid"],
  // what a teacher's log upload writes
  studentactives: [studentactives, "studentactiveid"],
  studentlearningprogress: [studentlearningprogress, "studentlearningprogressid"],
  studentpoints: [studentpoints, "studentpointid"],
  studentprogressquestions: [studentprogressquestions, "studentprogressquestionid"],
  logfiles: [logfiles, "logfileid"],
} as const;

/**
 * The joins a route's `include` can ask for: for each table, the alias, the table
 * it reaches, the column here and the column there. (The first alias that reaches a
 * table is the one an include without `as` means.)
 */
type Assoc = { table: keyof typeof MODELS; local: string; remote: string; many?: boolean };
const ASSOCS: Record<string, Record<string, Assoc>> = {
  students: {
    schooluser: { table: "schoolusers", local: "schooluserid", remote: "schooluserid" },
    school: { table: "schools", local: "schoolid", remote: "schoolid" },
    class: { table: "standards", local: "standard", remote: "standardid" },
    curriculum: { table: "curriculums", local: "curriculumid", remote: "curriculumid" },
    // the progress the reports list a learner's rows through (Sequelize names a hasMany by the plural of the model)
    studentlessonsprogresses: { table: "studentlessonsprogress", local: "studentid", remote: "studentid", many: true },
    studentlevelsprogresses: { table: "studentlevelsprogress", local: "studentid", remote: "studentid", many: true },
    studentgradesprogresses: { table: "studentgradesprogress", local: "studentid", remote: "studentid", many: true },
    studentprogresses: { table: "studentprogress", local: "studentid", remote: "studentid", many: true },
  },
  studentprogress: {
    lessonquiz: { table: "lessonquizzes", local: "studentprogressreferenceid", remote: "lessonquizid" },
    level: { table: "levels", local: "studentprogressreferenceid", remote: "levelid" },
  },
  syncs: { schooluser: { table: "schoolusers", local: "created_by", remote: "schooluserid" } },
  curriculums: { grades: { table: "grades", local: "curriculumid", remote: "curriculumid", many: true } },
  standards: { school: { table: "schools", local: "schoolid", remote: "schoolid" } },
  schoolcontributedata: { school: { table: "schools", local: "schoolid", remote: "schoolid" } },
  schools: { countries: { table: "countries", local: "countryid", remote: "countryid" } },
    schoolusers: {
    student: { table: "students", local: "schooluserid", remote: "schooluserid" },
    students: { table: "students", local: "schooluserid", remote: "schooluserid", many: true },
    school: { table: "schools", local: "schoolid", remote: "schoolid" },
  },
  // the content tree: what a route reads a row's parent and its document or question through
  grades: {
    curriculum: { table: "curriculums", local: "curriculumid", remote: "curriculumid" },
    levels: { table: "levels", local: "gradeid", remote: "gradeid", many: true },
    studentgradesprogresses: { table: "studentgradesprogress", local: "gradeid", remote: "gradeid", many: true },
  },
  levels: {
    grade: { table: "grades", local: "gradeid", remote: "gradeid" },
    lessons: { table: "lessons", local: "levelid", remote: "levelid", many: true },
    studentlevelsprogresses: { table: "studentlevelsprogress", local: "levelid", remote: "levelid", many: true },
  },
  lessons: {
    level: { table: "levels", local: "levelid", remote: "levelid" },
    studentlessonsprogresses: { table: "studentlessonsprogress", local: "lessonid", remote: "lessonid", many: true },
  },
  lessonlearnings: {
    document: { table: "documents", local: "documentid", remote: "documentid" },
    lesson: { table: "lessons", local: "lessonid", remote: "lessonid" },
  },
  lessonplans: {
    document: { table: "documents", local: "documentid", remote: "documentid" },
    lesson: { table: "lessons", local: "lessonid", remote: "lessonid" },
  },
  lessonpractices: { lesson: { table: "lessons", local: "lessonid", remote: "lessonid" } },
  lessonquizzes: { lesson: { table: "lessons", local: "lessonid", remote: "lessonid" } },
  lessonpracticequestions: {
    lessonpractice: { table: "lessonpractices", local: "lessonpracticeid", remote: "lessonpracticeid" },
    question: { table: "questions", local: "questionid", remote: "questionid" },
  },
  lessonquizquestions: {
    lessonquiz: { table: "lessonquizzes", local: "lessonquizid", remote: "lessonquizid" },
    question: { table: "questions", local: "questionid", remote: "questionid" },
  },
  levelquizquestions: {
    level: { table: "levels", local: "levelid", remote: "levelid" },
    question: { table: "questions", local: "questionid", remote: "questionid" },
    lesson: { table: "lessons", local: "lessonid", remote: "lessonid" },
  },
  baselinequestion: {
    curriculumbaseline: { table: "curriculumbaseline", local: "curriculumbaselineid", remote: "curriculumbaselineid" },
    question: { table: "questions", local: "questionid", remote: "questionid" },
  },
  feedbacks: {
    schooluser: { table: "schoolusers", local: "created_by", remote: "schooluserid" },
    curriculum: { table: "curriculums", local: "curriculumid", remote: "curriculumid" },
  },
};

interface IncludeSpec {
  model: object;
  as?: string;
  required?: boolean;
  where?: unknown;
  attributes?: unknown;
  include?: IncludeSpec[];
}
interface FindOptions {
  where?: unknown;
  include?: IncludeSpec[];
  attributes?: unknown;
  group?: string;
  limit?: number;
  offset?: number;
  raw?: boolean;
}

/** `attributes` as Sequelize reads it: a list of columns, or `{ exclude }`; anything fancier (an aggregate) leaves the row whole. */
const project = (row: Row, attributes: unknown): Row => {
  if (Array.isArray(attributes) && attributes.every((a) => typeof a === "string")) {
    return Object.fromEntries(Object.entries(row).filter(([k]) => (attributes as string[]).includes(k)));
  }
  const exclude = (attributes as { exclude?: string[] } | undefined)?.exclude;
  if (exclude) {
    return Object.fromEntries(Object.entries(row).filter(([k]) => !exclude.includes(k)));
  }
  return { ...row };
};

export type ContentTable = keyof typeof MODELS;

const IGNORE_CASE = ["questiontagname", "documenttagname"];
// what the wrapper adds to a row: never copied back into it
const INSTANCE_ONLY = new Set(["get", "getDataValue", "setDataValue", "save", "reload", "update", "destroy", "toJSON", "getGrade"]);

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

  /** The rows of `table` matching `o.where`, with the `include`s joined (an inner join for a required include), as instances. */
  private find(table: ContentTable, o: FindOptions) {
    const tableOf = new Map<object, ContentTable>(
      (Object.entries(MODELS) as Array<[ContentTable, readonly [object, string]]>).map(([n, [model]]) => [model, n]),
    );
    const out: Array<[Row, Row]> = [];
    // The rows `table`'s `row` joins to through `includes` (an inner join for a required include), each nested include
    // joined in turn; `null` when a required include finds nothing.
    const join = (from: ContentTable, row: Row, includes: IncludeSpec[] | undefined): Row | null => {
      const joined: Row = { ...row };
      for (const inc of includes ?? []) {
        const target = tableOf.get(inc.model);
        const entry = Object.entries(ASSOCS[from] ?? {}).find(([alias, a]) => (inc.as ? alias === inc.as : a.table === target));
        if (!entry || !target) throw new Error(`content-fake: no join from ${from} to ${String(target)}`);
        const [alias, assoc] = entry;
        const matches: Row[] = [];
        for (const r of this.tables[assoc.table]) {
          if ((r[assoc.remote] ?? null) !== (row[assoc.local] ?? null) || !rowMatches(r, inc.where)) continue;
          const nested = join(assoc.table, r, inc.include);
          if (nested === null) continue;
          // what the include selects, with the rows it joined in turn held under their aliases
          const nestedAliases = Object.keys(nested).filter((k) => !(k in r));
          const shown: Row = { ...project(nested, inc.attributes), ...Object.fromEntries(nestedAliases.map((a) => [a, nested[a]])) };
          // a `where` on `$alias.column$` reads the column whether or not the include selects it (as the database does)
          Object.defineProperty(shown, "__row", { value: r });
          matches.push(shown);
        }
        const required = inc.required ?? inc.where !== undefined;
        if (required && matches.length === 0) return null;
        joined[alias] = assoc.many ? matches : matches[0] ?? null;
      }
      return joined;
    };
    for (const row of this.tables[table]) {
      const joined = join(table, row, o.include);
      if (joined !== null && rowMatches(joined, o.where, IGNORE_CASE)) {
        out.push([row, joined]);
      }
    }
    return out.map(([row, joined]) => {
      // the included rows are held on the instance under their alias, as Sequelize does
      const aliases = Object.keys(joined).filter((k) => !(k in row));
      return this.wrap(table, row, project(row, o.attributes), Object.fromEntries(aliases.map((a) => [a, joined[a]])));
    });
  }

  private wrap(table: ContentTable, row: Row, shown: Row = { ...row }, included: Row = {}) {
    const write = (instance: Row, fields?: ReadonlyArray<string>) => {
      for (const key of fields ?? Object.keys(instance)) {
        if (!INSTANCE_ONLY.has(key) && key in instance) row[key] = instance[key];
      }
    };
    // what `setDataValue` put on the instance: it is part of the instance's JSON, as Sequelize's is
    const assigned: Row = {};
    const instance: Row = {
      ...shown,
      ...included,
      // what the instance holds now (the stored row with this instance's changes), as Sequelize's `get()` does
      get: () => Object.fromEntries([...Object.entries(shown), ...Object.entries(instance).filter(([k]) => !INSTANCE_ONLY.has(k))]),
      // sets the value on the instance only: nothing reaches the row until `save()`
      setDataValue: (k: string, v: unknown) => {
        instance[k] = v;
        assigned[k] = v;
      },
      getDataValue: (k: string) => instance[k],
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
            // removes the row, as the real instance's `destroy()` deletes it
      destroy: async () => {
        this.tables[table] = this.tables[table].filter((r) => r !== row);
      },
      toJSON: () => (Object.keys(assigned).length === 0 ? row : { ...row, ...assigned }),
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
      // a route's own `hasOne`/`belongsTo` calls (made on every request) have nothing to attach to here
      for (const associate of ["hasOne", "belongsTo", "hasMany"]) {
        jest.spyOn(m, associate as never).mockImplementation((() => undefined) as never);
      }
      const find = (o: FindOptions = {}) => this.find(name, o);
      jest.spyOn(m, "findOne" as never).mockImplementation((async (o?: FindOptions) => find(o)[0] ?? null) as never);
      jest.spyOn(m, "findAll" as never).mockImplementation((async (o?: FindOptions) => {
        let found = find(o);
        // `attributes: [[fn("sum", col(c)), alias]]` is one row holding the total (null when there is nothing to add up)
        const total = (Array.isArray(o?.attributes) ? (o!.attributes as unknown[]) : []).find(
          (a): a is [{ fn: string; args: Array<{ col: string }> }, string] => Array.isArray(a) && (a[0] as { fn?: string })?.fn === "sum",
        );
        if (total && !o?.group) {
          const column = total[0].args[0].col;
          return [{ [total[1]]: found.length === 0 ? null : found.reduce((sum, r) => sum + Number(r[column] ?? 0), 0) }];
        }
        if (o?.group) {
          const seen = new Set<unknown>();
          found = found.filter((r) => (seen.has(r[o.group as string]) ? false : seen.add(r[o.group as string])));
        }
        return o?.limit === undefined ? found : found.slice(o.offset ?? 0, (o.offset ?? 0) + o.limit);
      }) as never);
      jest.spyOn(m, "findAndCountAll" as never).mockImplementation((async (o?: FindOptions) => {
        const found = find(o);
        const page = o?.limit === undefined ? found : found.slice(o.offset ?? 0, (o.offset ?? 0) + o.limit);
        return { rows: page, count: found.length };
      }) as never);
      jest.spyOn(m, "count" as never).mockImplementation((async (o?: FindOptions) => (o?.include ? find(o).length : match(o?.where).length)) as never);
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
        for (const row of found) for (const key of o?.fields ?? Object.keys(values)) if (key in values) row[key] = values[key];
        return [found.length];
      }) as never);
      jest.spyOn(m, "bulkCreate" as never).mockImplementation((async (list: Row[], o?: { updateOnDuplicate?: ReadonlyArray<string> }) => {
        for (const attrs of list) {
          const row = { ...attrs };
          this.created.push({ table: name, row });
          // with `updateOnDuplicate`, a row that has the key of a stored row sets the listed fields of that row and nothing else, as MySQL does
          const stored = o?.updateOnDuplicate ? rows().find((r) => String(r[key]).toLowerCase() === String(row[key]).toLowerCase()) : undefined;
          if (stored) {
            for (const field of o!.updateOnDuplicate!) if (field in row) stored[field] = row[field];
          } else {
            rows().push(row);
          }
        }
        return list;
      }) as never);
    }
  }
}
