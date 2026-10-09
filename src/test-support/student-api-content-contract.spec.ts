import { contentProblems, TABLE_KEYS } from "./student-api-content-contract";

/**
 * The contract port against the learning-item rules of the student API's own validator (its `organisation-content.validator.ts`
 * and `constants/learning-items.ts`): each rule is one case, and each case first shows the payload without the fault passes (so a
 * rule that cannot fail would show). The student API's own specs prove its validator; this proves central's copy of it.
 */
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Row = Record<string, unknown>;

const payload = (): Record<string, unknown> => {
  const body: Record<string, unknown> = {
    format: 3,
    organisationid: ORG,
    organisationcode: "xorg",
    scope: "organisation",
    organisations: [
      { organisationid: ORG, organisationname: "អង្គការ ក", organisationcode: "xorg", organisationstatus: true, uitheme: "kids", brandingconfig: null, settingsconfig: null, isdeleted: false },
    ],
  };
  for (const key of TABLE_KEYS) body[key] = [];
  body.curriculums = [{ curriculumid: id(1), organisationid: ORG }];
  body.grades = [{ gradeid: id(2), curriculumid: id(1) }];
  body.levels = [{ levelid: id(3), gradeid: id(2) }];
  body.lessons = [{ lessonid: id(4), levelid: id(3) }];
  body.documents = [
    { documentid: id(5), organisationid: ORG },
    { documentid: id(6), organisationid: ORG },
  ];
  body.lessonlearnings = [{ lessonlearningid: id(7), lessonid: id(4), documentid: id(5), lessonlearningtype: "video", lessonlearningbody: null }];
  body.lessonlearningdocuments = [
    { lessonlearningdocumentid: id(8), lessonlearningid: id(7), documentid: id(6), lessonlearningdocumentrole: "rendition", lessonlearningdocumentorder: 0 },
  ];
  return body;
};
const changed = (change: (b: Record<string, Row[]>) => void) => {
  const body = JSON.parse(JSON.stringify(payload()));
  change(body);
  return contentProblems(body);
};

describe("the student API's learning-item rules, as central's contract port applies them", () => {
  it("the baseline payload (one video item with one link row) passes, so each case below fails for its own fault", () => {
    expect(contentProblems(payload())).toEqual([]);
  });

  it("the key lessonlearningdocuments is required, an empty list is fine, and it must be an array", () => {
    expect(changed((b) => { delete b.lessonlearningdocuments; })).toEqual(["lessonlearningdocuments must be an array"]);
    expect(changed((b) => { (b as Record<string, unknown>).lessonlearningdocuments = {}; })).toEqual(["lessonlearningdocuments must be an array"]);
    expect(changed((b) => { b.lessonlearningdocuments = []; })).toEqual([]);
  });

  it("a learning must have a type that is a string; an unknown type is refused", () => {
    expect(changed((b) => { delete b.lessonlearnings[0].lessonlearningtype; })).toEqual(["lessonlearnings: 1 with no lessonlearningtype (a string)"]);
    expect(changed((b) => { b.lessonlearnings[0].lessonlearningtype = ""; })).toEqual(["lessonlearnings: 1 with no lessonlearningtype (a string)"]);
    expect(changed((b) => { b.lessonlearnings[0].lessonlearningtype = null; })).toEqual(["lessonlearnings: 1 with no lessonlearningtype (a string)"]);
    expect(changed((b) => { b.lessonlearnings[0].lessonlearningtype = "gallery"; })).toEqual([
      "lessonlearnings: 1 with a lessonlearningtype this server does not know (it knows: video)",
    ]);
    expect(changed((b) => { b.lessonlearnings[0].lessonlearningtype = "Video"; })).toHaveLength(1);
  });

  it("a video has a null body (an absent one is fine) and a primary document", () => {
    expect(changed((b) => { b.lessonlearnings[0].lessonlearningbody = { v: 1 }; })).toEqual([
      "lessonlearnings: 1 of type video with a lessonlearningbody, which must be null for a video",
    ]);
    expect(changed((b) => { delete b.lessonlearnings[0].lessonlearningbody; })).toEqual([]);
    for (const none of [null, undefined, ""]) {
      expect(changed((b) => { b.lessonlearnings[0].documentid = none; })).toEqual(["lessonlearnings: 1 with no documentid, and the type of the item needs one"]);
    }
  });

  it("a link row names a document of the payload and an item of the payload (the rule for any reference)", () => {
    expect(changed((b) => { b.lessonlearningdocuments[0].documentid = id(99); })).toEqual([
      "lessonlearningdocuments: 1 point at a documents row (documentid) that is not in the payload",
    ]);
    expect(changed((b) => { b.lessonlearningdocuments[0].documentid = null; })).toHaveLength(1);
    expect(changed((b) => { b.lessonlearningdocuments[0].lessonlearningid = id(99); })).toEqual([
      "lessonlearningdocuments: 1 hang from a lessonlearnings row (lessonlearningid) that is not in the payload",
    ]);
  });

  it("a link row's role is rendition or asset", () => {
    expect(changed((b) => { b.lessonlearningdocuments[0].lessonlearningdocumentrole = "asset"; })).toEqual([]);
    for (const role of ["poster", "", null, 1, undefined]) {
      expect(changed((b) => { b.lessonlearningdocuments[0].lessonlearningdocumentrole = role; })).toEqual([
        "lessonlearningdocuments: 1 with a lessonlearningdocumentrole that is not one of rendition, asset",
      ]);
    }
  });

  it("a link row's order is a whole number; a missing one is the database's default, an explicit null is refused", () => {
    for (const order of [0, 3, -1]) expect(changed((b) => { b.lessonlearningdocuments[0].lessonlearningdocumentorder = order; })).toEqual([]);
    expect(changed((b) => { delete b.lessonlearningdocuments[0].lessonlearningdocumentorder; })).toEqual([]);
    for (const order of [null, 1.5, "1", NaN, true]) {
      expect(changed((b) => { b.lessonlearningdocuments[0].lessonlearningdocumentorder = order; })).toEqual([
        "lessonlearningdocuments: 1 with a lessonlearningdocumentorder that is not a whole number",
      ]);
    }
  });

  it("a (learning, document) pair appears once, whatever the case of the ids", () => {
    expect(changed((b) => { b.lessonlearningdocuments.push({ ...b.lessonlearningdocuments[0], lessonlearningdocumentid: id(9) }); })).toEqual([
      "lessonlearningdocuments: 1 repeat a lessonlearningid and documentid pair",
    ]);
    expect(
      changed((b) => {
        b.lessonlearningdocuments.push({ ...b.lessonlearningdocuments[0], lessonlearningdocumentid: id(9), documentid: String(b.lessonlearningdocuments[0].documentid).toUpperCase() });
      }),
    ).toEqual(["lessonlearningdocuments: 1 repeat a lessonlearningid and documentid pair"]);
    // the same document on another item is not a repeat
    expect(
      changed((b) => {
        b.lessonlearnings.push({ lessonlearningid: id(10), lessonid: id(4), documentid: id(5), lessonlearningtype: "video", lessonlearningbody: null });
        b.lessonlearningdocuments.push({ ...b.lessonlearningdocuments[0], lessonlearningdocumentid: id(9), lessonlearningid: id(10) });
      }),
    ).toEqual([]);
  });

  it("link rows on a video item are ACCEPTED (the student API's video rule is about the body and the primary document only)", () => {
    const body = payload();
    expect((body.lessonlearnings as Row[])[0].lessonlearningtype).toBe("video");
    expect((body.lessonlearningdocuments as Row[]).length).toBeGreaterThan(0);
    expect(contentProblems(body)).toEqual([]);
  });

  it("a link row has an id of its own, once, and no owner of its own", () => {
    expect(changed((b) => { delete b.lessonlearningdocuments[0].lessonlearningdocumentid; })).toEqual(["lessonlearningdocuments: 1 with no valid lessonlearningdocumentid"]);
    expect(changed((b) => { b.lessonlearningdocuments.push({ ...b.lessonlearningdocuments[0], documentid: id(5) }); })).toEqual(["lessonlearningdocuments: 1 repeat an id"]);
    expect(changed((b) => { b.lessonlearningdocuments[0].organisationid = id(77); })).toEqual(["lessonlearningdocuments: 1 belong to another organisation than the header's"]);
  });
});
