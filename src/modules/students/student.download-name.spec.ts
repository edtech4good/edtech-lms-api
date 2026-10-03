import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { Role } from "src/models/enums";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { StudentController } from "./student.controller";

/**
 * GET /student/download-students names its file after the school
 * (students-<school>.csv). A school with a Khmer name used to answer 500: Node
 * refuses a non-ASCII header value. Driven over real HTTP through the real
 * strategy, guard, controller and CSV writer; replaced are the learner query
 * and the token lookup.
 */
const tokenExists = jest.fn();
jest.mock("src/business/token.business", () => ({
  ...jest.requireActual("src/business/token.business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({
    tokenExists,
    validateStaffAccessToken: (...args: unknown[]) => tokenExists(...args),
  })),
}));

// The route resolves the school named in the query to its id (and stored name) first.
jest.mock("src/business/school-identity", () => ({
  ...jest.requireActual("src/business/school-identity"),
  resolveSchoolRef: jest.fn(async (ref: { schoolname?: string }) =>
    ref.schoolname ? { schoolid: "school-1", schoolname: ref.schoolname } : undefined,
  ),
}));

const getAllStudentsForEdit = jest.fn();
jest.mock("src/business/student.business", () => ({
  ...jest.requireActual("src/business/student.business"),
  StudentBusiness: jest.fn().mockImplementation(() => ({ getAllStudentsForEdit })),
}));

const bearer = (claims: Record<string, unknown>) =>
  `Bearer ${sign({ jti: "test-jti", ...claims }, Config.fortyk.api.applicationsecret, { expiresIn: "5m" })}`;
const platform = bearer({ lmsuserid: "p0", lmsuserroles: [Role.superadmin], permissions: ["superadmin"], organisationid: null, isplatform: true });

const KHMER_SCHOOL = "សាលាបឋមសិក្សា ភ្នំពេញ";
const KHMER_LEARNER = "សុខា";

describe("GET /student/download-students: the file name of a school with a Khmer name", () => {
  let app: INestApplication;

  beforeAll(async () => {
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    const moduleRef = await Test.createTestingModule({ controllers: [StudentController], providers: [JwtAccessStrategy] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  afterAll(async () => app.close());

  beforeEach(() => {
    tokenExists.mockResolvedValue(true);
    getAllStudentsForEdit.mockResolvedValue([{ studentfirstname: KHMER_LEARNER, studentlastname: "Sample", schoolname: KHMER_SCHOOL }]);
  });

  const download = (schoolname: string) => request(app.getHttpServer()).get("/student/download-students").query({ schoolname }).set("Authorization", platform);

  it("answers 200 with both forms of the file name, and the learner's Khmer name comes back in the body", async () => {
    const res = await download(KHMER_SCHOOL).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks).toString("utf8")));
    });
    expect(res.status).toBe(200);
    const header = res.headers["content-disposition"];
    expect(header).toMatch(/^attachment; filename="students-[\x20-\x7e]*\.csv"; filename\*=UTF-8''students-%E1%9E/);
    const encoded = /filename\*=UTF-8''(.*)$/.exec(header)?.[1] as string;
    expect(decodeURIComponent(encoded)).toBe(`students-${KHMER_SCHOOL}.csv`);
    expect(res.body).toContain(KHMER_LEARNER);
    // the business layer is handed the resolved school ID, not the name
    expect(getAllStudentsForEdit).toHaveBeenCalledWith("", "school-1", "");
  });

  it("a school with an ASCII name still gets the plain header it always had", async () => {
    const res = await download("Riverside School");
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toBe('attachment; filename="students-Riverside School.csv"');
  });
});
