import axios from "axios";
import { Config } from "src/config";
import { batchesOf, checkurl, MAX_PUSH_ROWS, MAX_REPLACE_STUDENTS, pushCertificates, CertificatePushRow } from "./certificate-push";

jest.mock("axios", () => ({ __esModule: true, default: { put: jest.fn() } }));

const row = (n: number, student: string): CertificatePushRow => ({
  certificateid: `cert-${n}`, shortcode: "7Q2M-9KXA", studentid: student, curriculumid: "cur", scope: "level", scopeid: "lvl",
  issuedat: new Date("2026-11-01T00:00:00Z"), revokedat: null,
  snapshot: { learnername: "A", curriculumname: "C", scopename: "S", tierlabel: "Level", classname: null, organisationname: "O", schoolname: "Sc", quizcount: 1 }, checkurl: null,
});

describe("checkurl", () => {
  const saved = process.env.CERTIFICATE_CHECK_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.CERTIFICATE_CHECK_URL;
    else process.env.CERTIFICATE_CHECK_URL = saved;
  });
  it("is the base, a slash and the code; trailing slashes and spaces are dropped", () => {
    process.env.CERTIFICATE_CHECK_URL = "https://admin.example.test/v";
    expect(checkurl("7Q2M-9KXA")).toBe("https://admin.example.test/v/7Q2M-9KXA");
    process.env.CERTIFICATE_CHECK_URL = " https://admin.example.test/v/ ";
    expect(checkurl("7Q2M-9KXA")).toBe("https://admin.example.test/v/7Q2M-9KXA");
  });
  it("is null when the variable is unset or blank", () => {
    delete process.env.CERTIFICATE_CHECK_URL;
    expect(checkurl("7Q2M-9KXA")).toBeNull();
    process.env.CERTIFICATE_CHECK_URL = "  ";
    expect(checkurl("7Q2M-9KXA")).toBeNull();
  });
});

describe("batchesOf", () => {
  it("cuts plain rows into runs of 2000 and sends nothing for none", () => {
    expect(batchesOf([])).toEqual([]);
    const rows = Array.from({ length: 4500 }, (_, i) => row(i, `s${i}`));
    expect(batchesOf(rows).map((b) => b.rows.length)).toEqual([2000, 2000, 500]);
    expect(batchesOf(rows).every((b) => b.replaceForStudents === undefined)).toBe(true);
  });

  it("with replace, never splits a learner's rows and names every learner, those with no rows too", () => {
    const rows: CertificatePushRow[] = [];
    const students = Array.from({ length: 30 }, (_, i) => `s${i}`);
    let n = 0;
    for (const s of students.slice(0, 25)) for (let k = 0; k < 150; k += 1) rows.push(row(n++, s)); // 25 learners x 150 rows = 3750 rows; 5 have none
    const batches = batchesOf(rows, students);
    expect(batches.every((b) => b.rows.length <= MAX_PUSH_ROWS)).toBe(true);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flatMap((b) => b.replaceForStudents!).sort()).toEqual([...students].sort());
    expect(batches.flatMap((b) => b.rows)).toHaveLength(rows.length);
    for (const b of batches) {
      const named = new Set(b.replaceForStudents);
      for (const r of b.rows) expect(named.has(r.studentid)).toBe(true); // a row travels with its learner's replace entry
      for (const s of named) expect(b.rows.filter((r) => r.studentid === s).length === 0 || b.rows.filter((r) => r.studentid === s).length === 150).toBe(true);
    }
  });

  it("with replace, caps the learners per request", () => {
    const students = Array.from({ length: MAX_REPLACE_STUDENTS + 1 }, (_, i) => `s${i}`);
    expect(batchesOf([], students).map((b) => b.replaceForStudents!.length)).toEqual([MAX_REPLACE_STUDENTS, 1]);
  });
});

describe("pushCertificates", () => {
  const saved = Config.fortyk.api.rpi.cloud;
  beforeEach(() => {
    Config.fortyk.api.rpi.cloud = "http://learning.example.test";
    (axios.put as jest.Mock).mockReset().mockResolvedValue({ status: 200, data: { error: false, data: { upserted: 3, deleted: 1 } } });
  });
  afterEach(() => {
    Config.fortyk.api.rpi.cloud = saved;
  });
  it("sums the counts over the requests and stops at the first failure", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => row(i, `s${i}`));
    await expect(pushCertificates("org-1", rows)).resolves.toEqual({ upserted: 6, deleted: 2 });
    expect(axios.put).toHaveBeenCalledTimes(2);
    (axios.put as jest.Mock).mockReset().mockRejectedValue(new Error("down"));
    await expect(pushCertificates("org-1", rows)).rejects.toThrow("down");
    expect(axios.put).toHaveBeenCalledTimes(1);
  });
});
