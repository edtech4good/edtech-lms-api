import { QuestionBusiness, assertUniqueDistractorIds, withOptionIds } from "./question.business";
import { questions } from "src/models/data-models/questions";

/**
 * Option identity (bilingual content, design note section 1, "Option identity"). A translation of an option's text is
 * keyed by the option's id, so the id has to survive an edit: a question that is saved again with the ids it already
 * has keeps them, a new option gets one, and two options with one id are refused.
 */
const OPT_A = "11111111-1111-4111-8111-111111111111-opt-1";
const OPT_B = "22222222-2222-4222-8222-222222222222-opt-2";
const user = { lmsuserid: "u1" } as never;

const option = (extra: Record<string, unknown>) => ({ questionoptiontext: "text", questionoptioniscorrect: false, questionoptionsequence: 1, ...extra });

describe("withOptionIds", () => {
  it("keeps the ids the options carry, in their order", () => {
    const out = withOptionIds([option({ questionoptionid: OPT_A }), option({ questionoptionid: OPT_B })]);
    expect(out.map((o) => o.questionoptionid)).toEqual([OPT_A, OPT_B]);
  });

  it("gives a new id to an option that has none (missing, empty or blank), and a different one each time", () => {
    const out = withOptionIds([option({}), option({ questionoptionid: "" }), option({ questionoptionid: "  " }), option({ questionoptionid: OPT_A })]);
    expect(out[3].questionoptionid).toBe(OPT_A);
    const fresh = out.slice(0, 3).map((o) => o.questionoptionid);
    for (const id of fresh) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(new Set(fresh).size).toBe(3);
  });

  it("gives a matching partner its option's id, kept or new, without changing the request's own object", () => {
    const associate = { questionoptionid: "stale", questionassociatetext: "partner" };
    const out = withOptionIds([option({ questionoptionid: OPT_A, questionassociate: associate }), option({ questionassociate: { questionoptionid: "", questionassociatetext: "b" } })]);
    expect(out[0].questionassociate).toEqual({ questionoptionid: OPT_A, questionassociatetext: "partner" });
    expect(out[1].questionassociate?.questionoptionid).toBe(out[1].questionoptionid);
    expect(associate.questionoptionid).toBe("stale");
  });

  it("refuses two options with the same id (400, naming the field)", () => {
    expect.assertions(3);
    try {
      withOptionIds([option({ questionoptionid: OPT_A }), option({ questionoptionid: OPT_A })]);
    } catch (e) {
      const error = e as { getStatus: () => number; fields: unknown };
      expect(error.getStatus()).toBe(400);
      expect(error.fields).toEqual([{ field: "questionoptions", message: "Each option of a question needs its own id." }]);
      expect((e as Error).message).toBe("Two options of this question have the same id.");
    }
  });

  it("does not treat a kept id and a freshly generated one as a duplicate", () => {
    expect(() => withOptionIds([option({ questionoptionid: OPT_A }), option({})])).not.toThrow();
  });
});

describe("assertUniqueDistractorIds", () => {
  it("accepts distinct ids, none, and a question without distractors", () => {
    expect(() => assertUniqueDistractorIds([{ questiondistractorid: "d1" }, { questiondistractorid: "d2" }])).not.toThrow();
    expect(() => assertUniqueDistractorIds([{ questiondistractorid: "" }, { questiondistractorid: "" }])).not.toThrow();
    expect(() => assertUniqueDistractorIds(undefined)).not.toThrow();
    expect(() => assertUniqueDistractorIds(null)).not.toThrow();
  });
  it("refuses two distractors with the same id (400)", () => {
    expect(() => assertUniqueDistractorIds([{ questiondistractorid: "d1" }, { questiondistractorid: "d1" }])).toThrow("Two distractors of this question have the same id.");
  });
});

describe("saving a question", () => {
  afterEach(() => jest.restoreAllMocks());

  const body = (extra: Record<string, unknown> = {}) =>
    ({
      questionid: "q1",
      questionidentifier: "an identifier",
      templatetypeid: 3,
      questiontext: "text",
      questiondistractors: [{ questiondistractorid: "d1", questiondistractortext: "wrong" }],
      questionoptions: [option({ questionoptionid: OPT_A }), option({ questionoptionid: OPT_B, questionassociate: { questionoptionid: "x", questionassociatetext: "p" } })],
      ...extra,
    }) as never;

  it("an update that carries the ids keeps them (options, partners and distractors)", async () => {
    const saved = { save: jest.fn(async function (this: unknown) { return this; }) } as Record<string, unknown>;
    jest.spyOn(questions, "findOne").mockResolvedValue(saved as never);
    await new QuestionBusiness().updatequestion(body(), user);
    const options = saved.questionoptions as Array<{ questionoptionid: string; questionassociate?: { questionoptionid: string } }>;
    expect(options.map((o) => o.questionoptionid)).toEqual([OPT_A, OPT_B]);
    expect(options[1].questionassociate?.questionoptionid).toBe(OPT_B);
    expect(saved.questiondistractors).toEqual([{ questiondistractorid: "d1", questiondistractortext: "wrong" }]);
  });

  it("an update that adds an option gives the new one an id and leaves the others' ids alone", async () => {
    const saved = { save: jest.fn(async function (this: unknown) { return this; }) } as Record<string, unknown>;
    jest.spyOn(questions, "findOne").mockResolvedValue(saved as never);
    await new QuestionBusiness().updatequestion(body({ questionoptions: [option({ questionoptionid: OPT_A }), option({})] }), user);
    const ids = (saved.questionoptions as Array<{ questionoptionid: string }>).map((o) => o.questionoptionid);
    expect(ids[0]).toBe(OPT_A);
    expect(ids[1]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[1]).not.toBe(OPT_A);
  });

  it("an update with a duplicate option id is refused and saves nothing", async () => {
    const save = jest.fn();
    jest.spyOn(questions, "findOne").mockResolvedValue({ save } as never);
    await expect(
      new QuestionBusiness().updatequestion(body({ questionoptions: [option({ questionoptionid: OPT_A }), option({ questionoptionid: OPT_A })] }), user),
    ).rejects.toThrow("Two options of this question have the same id.");
    expect(save).not.toHaveBeenCalled();
  });

  it("a create keeps the ids it is given too, and generates the rest", async () => {
    const create = jest.spyOn(questions, "create").mockResolvedValue({} as never);
    await new QuestionBusiness().createquestion(body({ questionoptions: [option({ questionoptionid: OPT_A }), option({})] }), user);
    const created = create.mock.calls[0][0] as unknown as { questionoptions: Array<{ questionoptionid: string }> };
    expect(created.questionoptions[0].questionoptionid).toBe(OPT_A);
    expect(created.questionoptions[1].questionoptionid).not.toBe(OPT_A);
    expect(created.questionoptions[1].questionoptionid).toMatch(/^[0-9a-f-]{36}$/);
  });
});
