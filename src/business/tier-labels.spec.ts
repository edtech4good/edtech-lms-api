import { LABEL_PRESETS, LABEL_PRESET_NAMES, MAX_LABEL_LENGTH, TIERS } from "src/constants/tier-labels";
import { ownLabelOf, presetNameOf, resolveTierLabels, withResolvedLabels } from "./tier-labels";

/**
 * What a school's tier labels resolve to: the platform default, then the school's preset, then the school's own label,
 * tier by tier. (The route that sets them, and the reads that return them, are proved over HTTP in
 * modules/people-scope.leak.spec.ts.) The presets are English only: no Khmer is written here.
 */
const SCHOOL = {
  curriculum: { en: { one: "Curriculum", other: "Curricula" } },
  grade: { en: { one: "Grade", other: "Grades" } },
  level: { en: { one: "Level", other: "Levels" } },
  lesson: { en: { one: "Lesson", other: "Lessons" } },
};
const COMPANY = {
  curriculum: { en: { one: "Programme", other: "Programmes" } },
  grade: { en: { one: "Track", other: "Tracks" } },
  level: { en: { one: "Module", other: "Modules" } },
  lesson: { en: { one: "Lesson", other: "Lessons" } },
};

describe("the label presets", () => {
  it("are the School and Company wordings, selectable by name, for exactly the four tiers", () => {
    expect([...LABEL_PRESET_NAMES]).toEqual(["school", "company"]);
    expect([...TIERS]).toEqual(["curriculum", "grade", "level", "lesson"]);
    expect(LABEL_PRESETS).toEqual({ school: SCHOOL, company: COMPANY });
  });
  it("carry no Khmer text: a preset is English only", () => {
    expect(JSON.stringify(LABEL_PRESETS)).not.toMatch(/[ក-៿᧠-᧿]/);
    for (const preset of Object.values(LABEL_PRESETS)) for (const tier of TIERS) expect(preset[tier].km).toBeUndefined();
  });
});

describe("resolving a school's labels", () => {
  it.each([[null], [undefined], [{}], ["text"], [[]], [{ labels: "x" }], [{ labelPreset: "nonsense" }]])(
    "a school with nothing usable stored (%j) gets the platform default, which is the School preset",
    (stored) => {
      expect(resolveTierLabels(stored)).toEqual({ labelsresolved: SCHOOL, hideSingleItemTiers: false });
    },
  );
  it("a preset chosen by name replaces the default for every tier", () => {
    expect(resolveTierLabels({ labelPreset: "company" }).labelsresolved).toEqual(COMPANY);
    expect(resolveTierLabels({ labelPreset: "school" }).labelsresolved).toEqual(SCHOOL);
  });
  it("the school's own label wins over the preset for that tier only, and keeps the Khmer text it was given", () => {
    const own = { en: { one: "Stage", other: "Stages" }, km: "text typed by the school" };
    const resolved = resolveTierLabels({ labelPreset: "company", labels: { level: own } }).labelsresolved;
    expect(resolved).toEqual({ ...COMPANY, level: own });
    // and with no preset it is laid over the platform default
    expect(resolveTierLabels({ labels: { grade: { en: { one: "Strand", other: "Strands" } } } }).labelsresolved).toEqual({
      ...SCHOOL,
      grade: { en: { one: "Strand", other: "Strands" } },
    });
  });
  it("a tier is the school's own whole or not at all: a half label or a damaged one falls back to the preset", () => {
    const damaged = {
      curriculum: { en: { one: "Course" } },
      grade: { en: { one: "Strand", other: "" } },
      level: { en: "Stage" },
      lesson: { en: { one: "Part", other: "x".repeat(MAX_LABEL_LENGTH + 1) } },
    };
    expect(resolveTierLabels({ labelPreset: "company", labels: damaged }).labelsresolved).toEqual(COMPANY);
    expect(ownLabelOf({ en: { one: "  Stage ", other: " Stages " }, km: "  " })).toEqual({ en: { one: "Stage", other: "Stages" } });
  });
  it("a label for a tier that does not exist is ignored", () => {
    const resolved = resolveTierLabels({ labels: { cohort: { en: { one: "Cohort", other: "Cohorts" } } } }).labelsresolved;
    expect(Object.keys(resolved)).toEqual(["curriculum", "grade", "level", "lesson"]);
    expect(resolved).toEqual(SCHOOL);
  });
  it("the hide switch is true only when it is stored as true", () => {
    expect(resolveTierLabels({ hideSingleItemTiers: true }).hideSingleItemTiers).toBe(true);
    for (const other of [false, "true", 1, null, undefined]) expect(resolveTierLabels({ hideSingleItemTiers: other }).hideSingleItemTiers).toBe(false);
  });
  it("a result is a copy: changing it changes neither the preset nor the stored labels", () => {
    const stored = { labels: { level: { en: { one: "Stage", other: "Stages" } } } };
    const resolved = resolveTierLabels(stored).labelsresolved;
    resolved.grade.en.one = "Changed";
    resolved.level.en.one = "Changed";
    expect(LABEL_PRESETS.school.grade.en.one).toBe("Grade");
    expect(stored.labels.level.en.one).toBe("Stage");
    expect(resolveTierLabels({}).labelsresolved.grade.en.one).toBe("Grade");
  });
  it("names the preset a school has, or the default's name", () => {
    expect(presetNameOf({ labelPreset: "company" })).toBe("company");
    expect(presetNameOf({ labelPreset: "x" })).toBe("school");
    expect(presetNameOf(null)).toBe("school");
  });
  it("puts the resolved labels beside the school's own fields without changing any of them", () => {
    const school = { schoolid: "s", schoolname: "A", brandingconfig: { labelPreset: "company" } };
    expect(withResolvedLabels(school)).toEqual({ ...school, labelsresolved: COMPANY, hideSingleItemTiers: false });
  });
});
