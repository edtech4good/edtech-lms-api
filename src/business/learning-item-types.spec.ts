import {
  DEFAULT_LEARNING_ITEM_TYPE,
  LEARNING_ITEM_TYPES,
  LearningItemRule,
  learningItemErrors,
  learningItemTypeNames,
  MAX_LEARNING_ITEM_BODY_BYTES,
} from "./learning-item-types";

const DOC = "00000000-0000-4000-8000-000000000001";
const video = (over: object = {}) => ({ type: "video", documentid: DOC, body: null, documents: undefined, ...over });

describe("learning item types: phase 0 knows video and nothing else", () => {
  it("the set is exactly video, and video is the default", () => {
    expect(learningItemTypeNames()).toEqual(["video"]);
    expect(DEFAULT_LEARNING_ITEM_TYPE).toBe("video");
  });

  it("a video item with a document, no body and no extra documents has nothing wrong with it", () => {
    expect(learningItemErrors(video())).toEqual([]);
    expect(learningItemErrors(video({ body: undefined, documents: [] }))).toEqual([]);
  });

  it.each(["document", "audio", "gallery", "cards", "package", "link", "Video", "", "constructor", "__proto__", "toString"])(
    "the type %j is not supported",
    (type) => {
      expect(learningItemErrors(video({ type }))).toEqual([{ field: "lessonlearningtype", message: "That learning item type isn't supported." }]);
    },
  );

  it("a video item needs its document: null and absent are both refused", () => {
    for (const documentid of [null, undefined]) {
      expect(learningItemErrors(video({ documentid }))).toEqual([{ field: "documentid", message: "A video item needs a document." }]);
    }
  });

  it("a video item has no body: any body, even an empty object, is refused", () => {
    for (const body of [{}, { v: 1 }, [], "x", 0, false]) {
      expect(learningItemErrors(video({ body }))).toEqual([{ field: "lessonlearningbody", message: "A video item has no body." }]);
    }
  });

  it("a video item takes no extra documents", () => {
    expect(learningItemErrors(video({ documents: [{ documentid: DOC }] }))).toEqual([{ field: "documents", message: "A video item takes no extra documents." }]);
  });

  it("reports every broken rule at once", () => {
    expect(learningItemErrors(video({ documentid: null, body: { v: 1 }, documents: [{}] })).map((e) => e.field)).toEqual(["documentid", "lessonlearningbody", "documents"]);
  });
});

describe("learning item rules for the types a later phase adds (the table is the extension point)", () => {
  const rules: Record<string, LearningItemRule> = {
    ...LEARNING_ITEM_TYPES,
    gallery: { documentid: "none", body: "object", documents: "allowed" },
  };
  const gallery = (over: object = {}) => ({ type: "gallery", documentid: null, body: { v: 1 }, documents: [{ documentid: DOC }], ...over });

  it("a type whose rule says no primary document refuses one, and accepts none", () => {
    expect(learningItemErrors(gallery(), rules)).toEqual([]);
    expect(learningItemErrors(gallery({ documentid: DOC }), rules)).toEqual([{ field: "documentid", message: "A gallery item has no document of its own." }]);
  });

  it("an object body must carry an integer version v of at least 1", () => {
    for (const body of [{}, { v: "1" }, { v: 0 }, { v: 1.5 }, [], "x"]) {
      expect(learningItemErrors(gallery({ body }), rules).map((e) => e.field)).toEqual(["lessonlearningbody"]);
    }
    expect(learningItemErrors(gallery({ body: null }), rules)).toEqual([]);
  });

  it("a body is at most 64 KiB serialised, counted in bytes (Khmer is three bytes a character)", () => {
    const fits = { v: 1, text: "ក".repeat(Math.floor((MAX_LEARNING_ITEM_BODY_BYTES - 20) / 3)) };
    const tooBig = { v: 1, text: "ក".repeat(Math.ceil(MAX_LEARNING_ITEM_BODY_BYTES / 3)) };
    expect(learningItemErrors(gallery({ body: fits }), rules)).toEqual([]);
    expect(learningItemErrors(gallery({ body: tooBig }), rules)).toEqual([{ field: "lessonlearningbody", message: "That body is too large (64 KiB at most)." }]);
  });

  it("extra documents are accepted where the rule allows them", () => {
    expect(learningItemErrors(gallery({ documents: [{ documentid: DOC }, { documentid: DOC }] }), rules)).toEqual([]);
  });
});
