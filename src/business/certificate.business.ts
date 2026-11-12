import { Op, Transaction } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { Logger } from "src/config";
import { OrgContext } from "src/decorators/org.decorator";
import { ApiError, ApiFieldError } from "src/models/ApiError";
import { certificates, CertificateScopeName, CertificateSnapshot } from "src/models/data-models/certificates";
import { grades } from "src/models/data-models/grades";
import { levels } from "src/models/data-models/levels";
import { organisations } from "src/models/data-models/organisations";
import { schools } from "src/models/data-models/school";
import { standards } from "src/models/data-models/standard";
import { students } from "src/models/data-models/students";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { dbinstance, rollbackQuietly } from "src/services/dbservice";
import { normaliseShortcode, shortcodes } from "./certificate-shortcode";
import { findOwnedCurriculum } from "./content-scope";
import { heldCurricula } from "./enrolment-published";
import { andOwned, findOwned, notFoundError, scopeOf } from "./org-scope";
import { ReportProxy } from "./report-proxy";
import { andInOwnedSchools, findOwnedStudent } from "./school-scope";
import { resolveTierLabels } from "./tier-labels";

/**
 * Certificates, slice 1 (staff side and the public check). Staff issue a certificate to a learner who has passed every
 * quiz of a level, a grade or the whole curriculum, revoke it with a reason, and read it; anyone holding the code can
 * check it on the public page.
 *
 * Whether a learner has passed is worked out on the LEARNING SERVER only (`POST report/certificate-eligibility`, asked
 * through the same report proxy as the online reports): central has no results it can trust. Candidates and issue both ask
 * it, and issue asks again at the moment of issue, so a client can never make central issue to a learner the learning
 * server does not call `ready`. When it cannot be asked or answers an error, those routes answer 502 and write nothing.
 *
 * Which scopes can be certified is the curriculum's own recognition setting: a scope is certifiable only when its tier's
 * value is `certificate`. A certificate is a snapshot: what it says is written at issue and never changed.
 */

export const MAX_ISSUE = 200;
/** The learning server takes this many learners in one question. */
const ASK_SIZE = 500;
/** Tries at a new code before giving up (the space is about 10^12 codes, so a second try is already a rarity). */
const CODE_TRIES = 10;

export const LEARNING_SERVER_MESSAGE =
  "The learning server could not be asked for the learners' quiz results, so nothing was changed. Try again in a few minutes.";
export const ALREADY_REVOKED_MESSAGE = "This certificate has already been revoked.";
export const NO_CODE_MATCH_MESSAGE = "That code does not match a certificate.";

export type CandidateStatus = "issued" | "ready" | "not_yet" | "cant_check";

interface Answer {
  studentid: string;
  status: "ready" | "not_yet" | "cant_check";
  reasons: unknown[];
  quizcount: number;
  passedcount: number;
}

export interface ScopeBody {
  curriculumid: string;
  scope: CertificateScopeName;
  scopeid: string;
}

interface ResolvedScope extends ScopeBody {
  organisationid: string;
  curriculumname: string;
  scopename: string;
}

const lower = (v: unknown): string => String(v ?? "").toLowerCase();

const invalid = (field: string, message: string): ApiError => {
  const fields: ApiFieldError[] = [{ field, message }];
  return new ApiError(ErrorCode.INVALID_INPUT, `${field}: ${message}`, { fields });
};

/** The organisation a staff request acts in. A platform user who is not acting as one has none: 400. */
const actingOrganisation = (org: OrgContext): string => {
  const scope = scopeOf(org);
  if (scope.kind === "platform") {
    throw new ApiError(
      ErrorCode.INVALID_INPUT,
      "Choose an organisation to act in before you work with certificates. Use the organisation switcher, then try again.",
    );
  }
  return scope.organisationid;
};

const nameOf = (s: { studentfirstname?: string | null; studentlastname?: string | null }): string =>
  [s.studentfirstname, s.studentlastname].filter((p) => typeof p === "string" && p.trim() !== "").join(" ").trim();

/** A certificate as staff read it: the whole row, the snapshot and the revoke fields (the reason included). */
export const certificateView = (row: certificates) => ({
  certificateid: row.certificateid,
  shortcode: row.shortcode,
  organisationid: row.organisationid,
  studentid: row.studentid,
  curriculumid: row.curriculumid,
  scope: row.scope,
  scopeid: row.scopeid,
  standardid: row.standardid ?? null,
  issuedat: row.issuedat,
  issuedby: row.issuedby,
  revokedat: row.revokedat ?? null,
  revokedby: row.revokedby ?? null,
  revokereason: row.revokereason ?? null,
  snapshot: row.snapshot,
});

export class CertificateBusiness {
  constructor(private readonly org: OrgContext) {}

  /**
   * The organisation's curriculum, the scope named, and its name: 404 for a curriculum that is not the caller's (as an absent
   * one), 400 on `scope` when the curriculum does not give certificates for that tier, 400 on `scopeid` when it is not part of
   * the curriculum.
   */
  private async resolveScope(body: ScopeBody): Promise<ResolvedScope> {
    const organisationid = actingOrganisation(this.org);
    const curriculum = await findOwnedCurriculum(this.org, body.curriculumid, { where: { isdeleted: false } });
    const setting = (curriculum as unknown as Record<string, unknown>)[`${body.scope}recognition`];
    if (setting !== "certificate") {
      throw invalid("scope", "This curriculum does not give certificates for that tier.");
    }
    const partOfCurriculum = () => invalid("scopeid", "That is not part of this curriculum.");
    let scopename: string;
    let scopeid: string; // the id as the database holds it, not as the request spelled it
    if (body.scope === "curriculum") {
      if (lower(body.scopeid) !== lower(curriculum.curriculumid)) throw partOfCurriculum();
      scopename = curriculum.curriculumname;
      scopeid = curriculum.curriculumid;
    } else if (body.scope === "grade") {
      const grade = await grades.findOne({ where: { gradeid: body.scopeid, curriculumid: curriculum.curriculumid, isdeleted: false }, attributes: ["gradeid", "gradename"] });
      if (!grade) throw partOfCurriculum();
      scopename = grade.gradename;
      scopeid = grade.gradeid;
    } else {
      const gradeRows = await grades.findAll({ where: { curriculumid: curriculum.curriculumid, isdeleted: false }, attributes: ["gradeid"] });
      const level = gradeRows.length
        ? await levels.findOne({
            where: { levelid: body.scopeid, gradeid: { [Op.in]: gradeRows.map((g) => g.gradeid) }, isdeleted: false },
            attributes: ["levelid", "levelname"],
          })
        : null;
      if (!level) throw partOfCurriculum();
      scopename = level.levelname;
      scopeid = level.levelid;
    }
    return { organisationid, curriculumid: curriculum.curriculumid, curriculumname: curriculum.curriculumname, scope: body.scope, scopeid, scopename };
  }

  /** The learning server's answer for these learners, keyed by lower-cased learner id. Any failure is a 502 and nothing else changes. */
  private async ask(scope: ResolvedScope, studentids: string[]): Promise<Map<string, Answer>> {
    const answers = new Map<string, Answer>();
    for (let i = 0; i < studentids.length; i += ASK_SIZE) {
      const chunk = studentids.slice(i, i + ASK_SIZE);
      let data: unknown;
      try {
        const response = await new ReportProxy(this.org).certificateEligibility({
          curriculumid: scope.curriculumid,
          scope: scope.scope,
          scopeid: scope.scopeid,
          studentids: chunk,
        });
        data = response?.data?.data;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        // only the class of the failure and the upstream status: never the request (it holds the server key)
        const upstream = (error as { response?: { status?: number } })?.response?.status;
        Logger.warn(`certificate eligibility: the learning server was not asked successfully (${(error as Error)?.name ?? "error"}, status ${upstream ?? "none"})`);
        // it refused the question itself: the curriculum (or this part of it) is not there yet
        throw upstream === 400 || upstream === 404 ? notOnLearningServer() : badGateway();
      }
      if (!Array.isArray(data)) {
        Logger.warn("certificate eligibility: the learning server's answer had no list");
        throw badGateway();
      }
      for (const entry of data as Answer[]) {
        if (entry && typeof entry.studentid === "string") answers.set(lower(entry.studentid), entry);
      }
    }
    return answers;
  }

  /** The learners in the caller's schools enrolled in the curriculum (and in the class, when one is named), live ones only. */
  private async enrolled(scope: ResolvedScope, studentids?: string[], standardid?: string) {
    const where: Record<string, unknown> = { isdeleted: false };
    if (standardid !== undefined) where.standard = standardid;
    if (studentids) where.studentid = { [Op.in]: studentids };
    const rows = await students.findAll({
      where: await andInOwnedSchools(where, this.org),
      attributes: ["studentid", "studentfirstname", "studentlastname", "standard", "schoolid", "curriculumid", "curriculumids", "is_teacher_acc"],
    });
    // a teacher account is stored as a student row, but it is not a learner
    return rows.filter((s) => !s.is_teacher_acc && heldCurricula(s).includes(scope.curriculumid));
  }

  /** The unrevoked certificate each of these learners holds for the scope, by lower-cased learner id. */
  private async held(scope: ResolvedScope, studentids: string[]): Promise<Map<string, certificates>> {
    const held = new Map<string, certificates>();
    if (studentids.length === 0) return held;
    const rows = await certificates.findAll({
      where: { studentid: { [Op.in]: studentids }, scope: scope.scope, scopeid: scope.scopeid, revokedat: null },
    });
    for (const row of rows) held.set(lower(row.studentid), row);
    return held;
  }

  async candidates(body: ScopeBody & { standardid?: string }) {
    const scope = await this.resolveScope(body);
    const learners = await this.enrolled(scope, undefined, body.standardid);
    const held = await this.held(scope, learners.map((s) => s.studentid));
    const toAsk = learners.filter((s) => !held.has(lower(s.studentid))).map((s) => s.studentid);
    const answers = toAsk.length > 0 ? await this.ask(scope, toAsk) : new Map<string, Answer>();
    const classNames = await this.classNames(learners.map((s) => s.standard));
    const rows = learners.map((s) => {
      const certificate = held.get(lower(s.studentid));
      const answer = answers.get(lower(s.studentid));
      const status: CandidateStatus = certificate ? "issued" : (answer?.status ?? "cant_check");
      return {
        student: {
          studentid: s.studentid,
          name: nameOf(s),
          standardid: s.standard ?? null,
          classname: s.standard ? (classNames.get(lower(s.standard)) ?? null) : null,
        },
        status,
        reasons: certificate ? [] : (answer ? answer.reasons : unknownToLearningServer()),
        quizcount: answer?.quizcount ?? 0,
        passedcount: answer?.passedcount ?? 0,
        certificate: certificate ? { certificateid: certificate.certificateid, shortcode: certificate.shortcode, issuedat: certificate.issuedat } : null,
      };
    });
    return rows.sort((a, b) => a.student.name.localeCompare(b.student.name) || a.student.studentid.localeCompare(b.student.studentid));
  }

  private async classNames(standardids: Array<string | null | undefined>): Promise<Map<string, string>> {
    const ids = [...new Set(standardids.filter((id): id is string => typeof id === "string" && id !== ""))];
    if (ids.length === 0) return new Map();
    const rows = await standards.findAll({ where: { standardid: { [Op.in]: ids } }, attributes: ["standardid", "standardname"] });
    return new Map(rows.map((r) => [lower(r.standardid), r.standardname]));
  }

  async issue(body: ScopeBody & { studentids: string[] }, issuedby: string) {
    const scope = await this.resolveScope(body);
    const requested = [...new Map(body.studentids.map((id) => [lower(id), id])).values()];

    // Everything read through the pool is read BEFORE the transaction opens (a read through the pool while a transaction is
    // open can starve it); the transaction itself reads only through its own connection.
    const known = new Map((await this.enrolled(scope, requested)).map((s) => [lower(s.studentid), s]));
    const refused = new Map<string, { studentid: string; status: string; reasons: unknown[] }>();
    const refuse = (studentid: string, status: string, reasons: unknown[] = []) => refused.set(lower(studentid), { studentid, status, reasons });

    // a learner who is not one of the caller's, or not enrolled, is refused exactly as one that does not exist
    for (const id of requested) if (!known.has(lower(id))) refuse(id, "not_found");
    const holders = await this.held(scope, [...known.values()].map((s) => s.studentid));
    for (const s of known.values()) if (holders.has(lower(s.studentid))) refuse(s.studentid, "issued");

    const toAsk = [...known.values()].filter((s) => !refused.has(lower(s.studentid)));
    const answers = toAsk.length > 0 ? await this.ask(scope, toAsk.map((s) => s.studentid)) : new Map<string, Answer>();
    const ready: Array<{ student: (typeof toAsk)[number]; answer: Answer }> = [];
    for (const s of toAsk) {
      const answer = answers.get(lower(s.studentid));
      if (answer?.status === "ready") ready.push({ student: s, answer });
      else refuse(s.studentid, answer?.status ?? "cant_check", answer ? answer.reasons : unknownToLearningServer());
    }

    let issued: certificates[] = [];
    if (ready.length > 0) {
      const base = await this.snapshotBase(scope, ready.map((r) => r.student));
      const ids = ready.map((r) => r.student.studentid).sort();
      for (let attempt = 0; attempt < 2; attempt += 1) {
        issued = [];
        // READ COMMITTED: under the default REPEATABLE READ a locking read that matches no row takes gap locks, and two
        // issues for different learners then deadlock on their inserts. Each statement here sees what is committed now.
        const transaction = await dbinstance.getdbinstance().transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED });
        try {
          // One unrevoked certificate per learner per scope. Two issues at once for the same learner must not both succeed:
          // the learner's row is locked FOR UPDATE (every issue takes its learners in the same order, so none can wait on
          // another in a circle), then the unrevoked certificates are read. That read is a plain one: under READ COMMITTED it
          // sees whatever the first issue committed, and the learner's row lock already serialises issues for one learner,
          // so it needs no lock of its own (a locking read would add nothing but gap-lock risk). The second issue therefore
          // finds the first one's certificate and refuses the learner.
          await students.findAll({ where: { studentid: { [Op.in]: ids } }, attributes: ["studentid"], order: [["studentid", "ASC"]], lock: transaction.LOCK.UPDATE, transaction });
          const existing = await certificates.findAll({
            where: { studentid: { [Op.in]: ids }, scope: scope.scope, scopeid: scope.scopeid, revokedat: null },
            attributes: ["studentid"],
            transaction,
          });
          const taken = new Set(existing.map((c) => lower(c.studentid)));
          for (const { student, answer } of ready) {
            if (taken.has(lower(student.studentid))) {
              refuse(student.studentid, "issued");
              continue;
            }
            issued.push(
              await certificates.create(
                {
                  certificateid: uuidv4(),
                  shortcode: await freshShortcode(transaction),
                  organisationid: scope.organisationid,
                  studentid: student.studentid,
                  curriculumid: scope.curriculumid,
                  scope: scope.scope,
                  scopeid: scope.scopeid,
                  standardid: student.standard ?? null,
                  issuedat: new Date(),
                  issuedby,
                  snapshot: base(student, answer.quizcount),
                },
                { transaction },
              ),
            );
          }
          await transaction.commit();
          break;
        } catch (error) {
          await rollbackQuietly(transaction);
          if (isCodeClash(error)) {
            // two codes met at the unique index: the whole transaction is run once more, with new codes
            if (attempt === 0) continue;
            throw new ApiError(ErrorCode.ALREADY_EXISTS, "A unique certificate code could not be made. Try again.");
          }
          throw error;
        }
      }
    }
    return {
      issued: issued.map(certificateView),
      refused: requested.filter((id) => refused.has(lower(id))).map((id) => refused.get(lower(id))!),
    };
  }

  /** Builds the snapshot of one learner's certificate from rows read now; the quiz count is the learning server's. */
  private async snapshotBase(scope: ResolvedScope, learners: Array<{ studentid: string; studentfirstname?: string | null; studentlastname?: string | null; standard?: string | null; schoolid: string }>) {
    const schoolRows = await schools.findAll({
      where: { schoolid: { [Op.in]: [...new Set(learners.map((l) => l.schoolid))] } },
      attributes: ["schoolid", "schoolname", "brandingconfig"],
    });
    const schoolOf = new Map(schoolRows.map((s) => [lower(s.schoolid), s]));
    const classNames = await this.classNames(learners.map((l) => l.standard));
    const organisation = await organisations.findOne({ where: { organisationid: scope.organisationid }, attributes: ["organisationid", "organisationname"] });
    return (learner: (typeof learners)[number], quizcount: number): CertificateSnapshot => {
      const school = schoolOf.get(lower(learner.schoolid));
      return {
        learnername: nameOf(learner),
        curriculumname: scope.curriculumname,
        scopename: scope.scopename,
        // the singular English label of the scope's tier, as this learner's school names it
        tierlabel: resolveTierLabels(school?.brandingconfig).labelsresolved[scope.scope].en.one,
        classname: learner.standard ? (classNames.get(lower(learner.standard)) ?? null) : null,
        organisationname: organisation?.organisationname ?? "",
        schoolname: school?.schoolname ?? "",
        quizcount,
      };
    };
  }

  async revoke(certificateid: string, reason: string, revokedby: string) {
    actingOrganisation(this.org);
    const text = typeof reason === "string" ? reason.trim() : "";
    if (text.length < 1 || text.length > 500) {
      throw invalid("reason", "Give a reason of 1 to 500 characters.");
    }
    const transaction = await dbinstance.getdbinstance().transaction();
    try {
      // the row is locked, so two revokes at once cannot both succeed
      const row = await findOwned(certificates, certificateid, this.org, { transaction, lock: transaction.LOCK.UPDATE });
      if (row.revokedat) {
        throw new ApiError(ErrorCode.ALREADY_EXISTS, ALREADY_REVOKED_MESSAGE);
      }
      await row.update({ revokedat: new Date(), revokedby, revokereason: text }, { transaction });
      await transaction.commit();
      return certificateView(row);
    } catch (error) {
      await rollbackQuietly(transaction);
      throw error;
    }
  }

  async get(certificateid: string) {
    return certificateView(await findOwned(certificates, certificateid, this.org));
  }

  async forStudent(studentid: string) {
    await findOwnedStudent(this.org, { studentid });
    const rows = await certificates.findAll({ where: andOwned({ studentid }, this.org), order: [["issuedat", "DESC"]] });
    return rows.map(certificateView);
  }
}

export const NOT_ON_LEARNING_SERVER_MESSAGE = "This curriculum (or this part of it) is not on the learning server yet. Publish it, then try again.";
const notOnLearningServer = () =>
  new ApiError(ErrorCode.BAD_GATEWAY, NOT_ON_LEARNING_SERVER_MESSAGE, { status: 502, hint: "Nothing was changed." });

/** Did an insert meet the unique index on the code? */
const isCodeClash = (error: unknown): boolean => {
  const e = error as { name?: string; fields?: unknown; parent?: { sqlMessage?: string } };
  return e?.name === "SequelizeUniqueConstraintError" && (JSON.stringify(e.fields ?? "").includes("shortcode") || /certificates_shortcode_unique/.test(String(e.parent?.sqlMessage ?? "")));
};

const badGateway = () =>
  new ApiError(ErrorCode.BAD_GATEWAY, LEARNING_SERVER_MESSAGE, { status: 502, hint: "Nothing was changed. If it keeps happening, contact support with the reference." });

/** A learner the learning server does not hold (not synced to it yet): its answer has no entry, and we cannot check. */
const unknownToLearningServer = (): unknown[] => [{ reason: "not_on_learning_server" }];

/** A code no other certificate has, chosen inside the issue transaction. The unique index on `shortcode` is the backstop. */
const freshShortcode = async (transaction: Transaction): Promise<string> => {
  for (let attempt = 0; attempt < CODE_TRIES; attempt += 1) {
    const code = shortcodes.next();
    const taken = await certificates.findOne({ where: { shortcode: code }, attributes: ["certificateid"], transaction });
    if (!taken) return code;
  }
  throw new ApiError(ErrorCode.INTERNAL);
};

/**
 * The public check (`GET /certificates/verify/:shortcode`): no sign-in, so it answers with the snapshot only. A code that
 * is not shaped like one and a code that matches no certificate are the same 404. A revoked certificate says only that it
 * is revoked and when: no names, no reason.
 */
export const verifyCertificate = async (rawCode: unknown) => {
  const code = normaliseShortcode(rawCode);
  const row = code
    ? await certificates.findOne({
        where: { shortcode: code },
        attributes: ["shortcode", "scope", "issuedat", "revokedat", "snapshot"],
      })
    : null;
  if (!row) {
    throw notFoundError(NO_CODE_MATCH_MESSAGE);
  }
  if (row.revokedat) {
    return { status: "revoked" as const, revokedat: row.revokedat, shortcode: row.shortcode };
  }
  const snapshot = row.snapshot;
  return {
    status: "valid" as const,
    learnername: snapshot.learnername,
    scope: row.scope,
    tierlabel: snapshot.tierlabel,
    scopename: snapshot.scopename,
    curriculumname: snapshot.curriculumname,
    classname: snapshot.classname ?? null,
    organisationname: snapshot.organisationname,
    issuedat: row.issuedat,
    shortcode: row.shortcode,
  };
};
