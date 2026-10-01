import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { countries } from "src/models/data-models/countries";
import { organisationcountry } from "src/models/data-models/organisationcountry";
import { organisations } from "src/models/data-models/organisations";
import { Role } from "src/models/enums";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { dbinstance } from "src/services/dbservice";
import { OrganisationController } from "./organisation.controller";

/**
 * `brandingconfig.__proto__` must not be a way to store arbitrary content.
 *
 * `JSON.parse('{"__proto__": {...}}')` creates an OWN key called "__proto__".
 * Joi validates a copy without it, so a closed schema sees nothing wrong, and a
 * handler that spreads the raw object then stores the hidden content (a reviewer
 * stored 1 MB this way, after which the list endpoint failed for everyone).
 *
 * These specs send RAW STRING bodies. A JavaScript object literal such as
 * `{ __proto__: {...} }` sets the prototype instead of creating an own key, and
 * `.send(object)` would JSON.stringify it away - neither reproduces the bug.
 * The real controller, interceptors, guards and BUSINESS class run; only the
 * model statics (the database) are replaced, so what is asserted is what would
 * have been written.
 */
const tokenExists = jest.fn();
jest.mock("src/business", () => ({
  ...jest.requireActual("src/business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({
    tokenExists,
    // The staff-token check is one database query in production; here it answers like the token lookup.
    validateStaffAccessToken: (...args: unknown[]) => tokenExists(...args),
  })),
}));

const COUNTRY = "22222222-2222-4222-8222-222222222222";
const ORG = "11111111-1111-4111-8111-111111111111";
const TOKEN = `Bearer ${sign(
  {
    jti: "j",
    lmsuserid: "u1",
    lmsuserroles: [Role.superadmin],
    permissions: ["superadmin"],
    organisationid: null,
    isplatform: true,
  },
  Config.fortyk.api.applicationsecret,
  { expiresIn: "5m" },
)}`;

// Under the default 100 kb body limit of the test app (the real server allows more).
const BIG = "x".repeat(60000);

/** The fields every valid body needs, as JSON text to splice raw keys into. */
const CREATE_FIELDS =
  `"organisationname":"Sample","organisationcode":"samplenet","organisationshortname":"SN",` +
  `"organisationpreset":"company","countryids":["${COUNTRY}"]`;
const UPDATE_FIELDS = `"organisationname":"Sample","organisationshortname":"SN","countryids":["${COUNTRY}"]`;

const tnx = { commit: jest.fn(), rollback: jest.fn() };
let updatedRow: Record<string, unknown> | undefined;
const orgRow = () => {
  const plain = {
    organisationid: ORG,
    organisationname: "Old",
    organisationcode: "oldcode",
    organisationshortname: "OL",
    organisationpreset: "company",
    organisationstatus: true,
    uitheme: "kids",
    brandingconfig: null,
    settingsconfig: null,
    isdeleted: false,
  };
  return { ...plain, save: jest.fn().mockResolvedValue(undefined), get: jest.fn().mockReturnValue(plain) };
};

describe("hostile prototype keys in a RAW JSON body", () => {
  let app: INestApplication;

  beforeAll(async () => {
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    const moduleRef = await Test.createTestingModule({
      controllers: [OrganisationController],
      providers: [JwtAccessStrategy],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  afterAll(() => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    updatedRow = undefined;
    tokenExists.mockResolvedValue(true);
    jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(tnx as never);
    jest.spyOn(countries, "findAll").mockResolvedValue([{ countryid: COUNTRY }] as never);
    jest.spyOn(organisations, "count").mockResolvedValue(0 as never);
    jest.spyOn(organisations, "create").mockResolvedValue({} as never);
    // The row an update works on is the one read under a lock, inside the transaction.
    jest.spyOn(organisations, "findOne").mockImplementation((async (o: { lock?: unknown }) => {
      const row = orgRow();
      if (o?.lock) updatedRow = row;
      return row;
    }) as never);
    jest.spyOn(organisationcountry, "bulkCreate").mockResolvedValue([] as never);
    jest.spyOn(organisationcountry, "findAll").mockResolvedValue([] as never);
    jest.spyOn(organisationcountry, "destroy").mockResolvedValue(0 as never);
  });
  afterEach(() => jest.restoreAllMocks());

  const post = (raw: string) =>
    request(app.getHttpServer())
      .post("/organisation")
      .set("Authorization", TOKEN)
      .set("Content-Type", "application/json")
      .send(raw);
  const put = (raw: string) =>
    request(app.getHttpServer())
      .put(`/organisation/${ORG}`)
      .set("Authorization", TOKEN)
      .set("Content-Type", "application/json")
      .send(raw);

  const hostileBodies: Array<[string, string]> = [
    ["top-level __proto__", `"__proto__":{"organisationstatus":false,"settingsconfig":{"a":1},"big":"${BIG}"}`],
    ["top-level constructor", `"constructor":{"prototype":{"polluted":true}}`],
    ["top-level prototype", `"prototype":{"polluted":true}`],
    ["__proto__ inside brandingconfig", `"brandingconfig":{"tilecolour":"#112233","__proto__":{"logourl":"javascript:alert(1)","big":"${BIG}"}}`],
    ["constructor inside brandingconfig", `"brandingconfig":{"constructor":{"prototype":{"polluted":true}}}`],
    ["prototype inside brandingconfig", `"brandingconfig":{"prototype":{"polluted":true}}`],
    ["__proto__ deep inside brandingconfig", `"brandingconfig":{"logourl":"https://example.com/a.png","x":{"y":{"__proto__":{"z":1}}}}`],
    ["__proto__ inside an array element", `"countryids":["${COUNTRY}",{"__proto__":{"a":1}}]`],
  ];

  describe.each(hostileBodies)("%s", (_name, fragment) => {
    it("POST is refused with a generic 400, nothing is written, the key is not echoed", async () => {
      const res = await post(`{${CREATE_FIELDS},${fragment}}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_INPUT");
      expect(JSON.stringify(res.body)).not.toMatch(/__proto__|constructor|prototype|polluted/);
      expect(organisations.create).not.toHaveBeenCalled();
      expect(organisationcountry.bulkCreate).not.toHaveBeenCalled();
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it("PUT is refused the same way and saves nothing", async () => {
      const res = await put(`{${UPDATE_FIELDS},${fragment}}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_INPUT");
      expect(JSON.stringify(res.body)).not.toMatch(/__proto__|constructor|prototype|polluted/);
      expect(updatedRow).toBeUndefined(); // the update never even locked the row
      expect(organisationcountry.bulkCreate).not.toHaveBeenCalled();
    });
  });

  it("the attack shape really is an own key (so these specs would catch a regression)", () => {
    const parsed = JSON.parse(`{"brandingconfig":{"__proto__":{"evil":1}}}`);
    expect(Object.keys(parsed.brandingconfig)).toEqual(["__proto__"]);
  });

  it("a valid body still works, and exactly the three named branding keys are persisted", async () => {
    const res = await post(
      `{${CREATE_FIELDS},"brandingconfig":{"logourl":"https://example.com/l.png","displayname":"  Sample Co  ","tilecolour":"#a1b2c3"}}`,
    );
    expect(res.status).toBe(200);
    const created = (organisations.create as jest.Mock).mock.calls[0][0];
    expect(created.brandingconfig).toEqual({
      logourl: "https://example.com/l.png",
      displayname: "Sample Co",
      tilecolour: "#a1b2c3",
    });
    expect(Object.keys(created.brandingconfig).sort()).toEqual(["displayname", "logourl", "tilecolour"]);
    expect(created).not.toHaveProperty("settingsconfig");
    expect(created).not.toHaveProperty("organisationstatus");
  });

  it("a valid PUT persists exactly the three named branding keys too", async () => {
    const res = await put(
      `{${UPDATE_FIELDS},"brandingconfig":{"tilecolour":"#a1b2c3","displayname":"Co"}}`,
    );
    expect(res.status).toBe(200);
    const stored = (updatedRow as { brandingconfig: Record<string, string> }).brandingconfig;
    expect(stored).toEqual({ displayname: "Co", tilecolour: "#a1b2c3" });
    expect(Object.keys(stored).sort()).toEqual(["displayname", "tilecolour"]);
  });

  it("the ordinary unknown-key refusal is unchanged (a plain extra key is still a 400)", async () => {
    const res = await post(`{${CREATE_FIELDS},"brandingconfig":{"evil":1}}`);
    expect(res.status).toBe(400);
    expect(organisations.create).not.toHaveBeenCalled();
  });
});
