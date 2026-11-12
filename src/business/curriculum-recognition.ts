import { organisations } from "src/models/data-models/organisations";

/**
 * The per-tier recognition setting of a curriculum: what a learner receives for completing a level, a grade and the
 * whole curriculum. Central is the only place it is decided; it is stored as explicit values on `curriculums`
 * (`levelrecognition`, `graderecognition`, `curriculumrecognition`) and sent to the learning servers in the content
 * payload.
 */
export type LevelRecognition = "none" | "award" | "certificate";
export type GradeRecognition = "none" | "certificate";
export type CurriculumRecognition = "none" | "certificate";

export interface Recognition {
  levelrecognition: LevelRecognition;
  graderecognition: GradeRecognition;
  curriculumrecognition: CurriculumRecognition;
}

export type RecognitionField = keyof Recognition;

export const RECOGNITION_FIELDS: readonly RecognitionField[] = ["levelrecognition", "graderecognition", "curriculumrecognition"];

/** The values each tier accepts, lower case exactly as listed. */
export const ALLOWED_RECOGNITION: Record<RecognitionField, readonly string[]> = {
  levelrecognition: ["none", "award", "certificate"],
  graderecognition: ["none", "certificate"],
  curriculumrecognition: ["none", "certificate"],
};

/** A school's curriculum: levels give an award, a grade a certificate, the whole curriculum nothing. */
export const SCHOOL_RECOGNITION: Readonly<Recognition> = Object.freeze({
  levelrecognition: "award",
  graderecognition: "certificate",
  curriculumrecognition: "none",
});

/** A company's curriculum: levels give an award, a grade nothing, the whole curriculum a certificate. */
export const COMPANY_RECOGNITION: Readonly<Recognition> = Object.freeze({
  levelrecognition: "award",
  graderecognition: "none",
  curriculumrecognition: "certificate",
});

/** The defaults of an organisation preset; `company` has its own, every other (or unknown) preset gets the school's. */
export const recognitionDefaultsFor = (preset: string | null | undefined): Recognition =>
  ({ ...(preset === "company" ? COMPANY_RECOGNITION : SCHOOL_RECOGNITION) });

/**
 * The name of the first field whose value is not allowed for its tier, or null when every field present is fine.
 * A field that is absent (undefined) is not checked; any other value that is not one of the listed lower-case
 * strings (null, a number, different case, padding) is bad.
 */
export const firstBadRecognitionField = (values: Partial<Record<RecognitionField, unknown>>): RecognitionField | null => {
  for (const field of RECOGNITION_FIELDS) {
    const value = values[field];
    if (value === undefined) continue;
    if (typeof value !== "string" || !ALLOWED_RECOGNITION[field].includes(value)) return field;
  }
  return null;
};

/** The recognition fields a request names, in the shape of the rows (the others left out). */
export const recognitionFrom = (body: Partial<Record<RecognitionField, unknown>>): Partial<Recognition> => {
  const out: Partial<Record<RecognitionField, unknown>> = {};
  for (const field of RECOGNITION_FIELDS) {
    if (body[field] !== undefined) out[field] = body[field];
  }
  return out as Partial<Recognition>;
};

/**
 * What a new curriculum is stored with: the request's values where it names them, the defaults of its organisation's
 * preset for the rest. Central stores explicit values, never null.
 */
export const recognitionForNewCurriculum = async (
  organisationid: string,
  body: Partial<Record<RecognitionField, unknown>>,
): Promise<Recognition> => {
  const org = await organisations.findOne({ where: { organisationid }, attributes: ["organisationpreset"] });
  return { ...recognitionDefaultsFor(org?.organisationpreset), ...recognitionFrom(body) };
};
