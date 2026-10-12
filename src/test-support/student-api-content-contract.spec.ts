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
    { documentid: id(5), organisationid: ORG, documenttypeid: 2 },
    { documentid: id(6), organisationid: ORG, documenttypeid: 6 },
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

describe("the student API's media-library rules, as central's contract port applies them (ML-1 messages, word for word)", () => {
  const doc = (over: Row) => (b: Record<string, Row[]>) => { Object.assign(b.documents[1], over); };
  const KNOWN = "CC0-1.0, CC-BY-4.0, CC-BY-3.0, CC-BY-2.0, CC-BY-SA-4.0, CC-BY-SA-3.0, CC-BY-SA-2.0, CC-BY-NC-4.0, CC-BY-NC-3.0, CC-BY-NC-2.0, CC-BY-NC-SA-4.0, CC-BY-NC-SA-3.0, CC-BY-NC-SA-2.0, CC-BY-ND-4.0, CC-BY-ND-3.0, CC-BY-ND-2.0, CC-BY-NC-ND-4.0, CC-BY-NC-ND-3.0, CC-BY-NC-ND-2.0, LicenseRef-all-rights-reserved, unspecified";

  it("a video item's document must be a VIDEO document: any other type, or none, is refused; a document outside the payload is a missing reference instead", () => {
    for (const documenttypeid of [1, 5, 6, 8, 9, 10, 0, "2", null]) {
      expect(changed((b) => { b.documents[0].documenttypeid = documenttypeid as never; })).toEqual([
        "lessonlearnings: 1 row of type video points at a document that is not a video (its documenttypeid must be 2).",
      ]);
    }
    expect(changed((b) => { delete b.documents[0].documenttypeid; })).toEqual([
      "lessonlearnings: 1 row of type video points at a document that is not a video (its documenttypeid must be 2).",
    ]);
    expect(changed((b) => {
      b.lessonlearnings.push({ lessonlearningid: id(10), lessonid: id(4), documentid: id(6), lessonlearningtype: "video", lessonlearningbody: null });
    })).toEqual(["lessonlearnings: 1 row of type video points at a document that is not a video (its documenttypeid must be 2)."]);
    expect(changed((b) => {
      for (const n of [11, 12]) b.lessonlearnings.push({ lessonlearningid: id(n), lessonid: id(4), documentid: id(6), lessonlearningtype: "video", lessonlearningbody: null });
    })).toEqual(["lessonlearnings: 2 rows of type video point at a document that is not a video (its documenttypeid must be 2)."]);
    // a link row's document may be of any type (only the primary document of a video item is typed)
    expect(changed((b) => { b.documents[1].documenttypeid = 5; })).toEqual([]);
  });

  it("a document without the three columns passes (an export from before the media library)", () => {
    expect(contentProblems(payload())).toEqual([]);
  });

  it("a document with all three columns, well formed, passes", () => {
    expect(changed(doc({
      documenttitle: "ភ្នំពេញ", documentlicence: "CC-BY-NC-ND-2.0",
      documentattribution: { v: 1, author: "ក", sourceurl: "https://example.org/a", adaptedfrom: "Un titre" },
    }))).toEqual([]);
    expect(changed(doc({ documenttitle: null, documentlicence: "unspecified", documentattribution: null }))).toEqual([]);
  });

  it("a title must be a string of at most 255 characters without control characters (a blank one is no title)", () => {
    const message = "documents: 1 row has a documenttitle that is not a string of at most 255 characters without control characters.";
    for (const documenttitle of [5, {}, [], "ក".repeat(256), "a\u0000b", "a\nb"]) {
      expect(changed(doc({ documenttitle }))).toEqual([message]);
    }
    expect(changed(doc({ documenttitle: "ក".repeat(255) }))).toEqual([]);
    expect(changed(doc({ documenttitle: "   " }))).toEqual([]);
  });

  it("a licence must be one of the 21 ids; null is never accepted", () => {
    expect(changed(doc({ documentlicence: "GPL-3.0" }))).toEqual([`documents: 1 row has a documentlicence this server does not know (it knows: ${KNOWN}).`]);
    expect(changed(doc({ documentlicence: "cc0-1.0" }))).toEqual([`documents: 1 row has a documentlicence this server does not know (it knows: ${KNOWN}).`]);
    expect(changed(doc({ documentlicence: null }))).toEqual(["documents: 1 row has a null documentlicence, which is never empty (leave the key out for the default)."]);
  });

  it("an attribution must be null or an object of version 1 with only the three keys, each within its length", () => {
    const message = "documents: 1 row has a documentattribution that is not null or an object of version 1 with only author, sourceurl and adaptedfrom, each within its length (the sourceurl an http or https address, the whole at most 4096 bytes).";
    for (const documentattribution of [
      "text", [], { author: "no version" }, { v: 2 }, { v: 1, licence: "x" }, { v: 1, author: 5 }, { v: 1, author: "a".repeat(256) },
      { v: 1, sourceurl: "javascript:alert(1)" }, { v: 1, sourceurl: "not a url" }, { v: 1, sourceurl: "http:foo" }, { v: 1, sourceurl: "https:example.org" },
      { v: 1, sourceurl: "http:/example.org" }, { v: 1, sourceurl: "http://" }, { v: 1, sourceurl: "https:///" }, { v: 1, adaptedfrom: "a".repeat(1025) },
    ]) {
      expect(changed(doc({ documentattribution }))).toEqual([message]);
    }
  });

  it("two bad documents are counted in one line each", () => {
    expect(changed((b) => { b.documents[0].documentlicence = "x"; b.documents[1].documentlicence = "y"; })).toEqual([
      `documents: 2 rows have a documentlicence this server does not know (it knows: ${KNOWN}).`,
    ]);
  });
});
