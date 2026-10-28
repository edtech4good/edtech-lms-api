import joi from "joi";
import { LANGUAGE_CODE, TRANSLATION_TABLES } from "src/constants/content-translations";
import { RequestValidator } from "../../models/RequestValidator";

/**
 * Request shapes for the translation routes. What depends on the row (which texts it has, which are graded by an
 * answer, the organisation's content language) is checked by the business code (src/business/content-translations.ts).
 */
const tablename = joi
  .string()
  .valid(...TRANSLATION_TABLES)
  .required()
  .label("Table");
const rowid = joi.string().uuid().required().label("Row ID");
const language = joi.string().pattern(LANGUAGE_CODE).required().label("Language");

/** Most texts one request can carry: a question has an option, a partner and a distractor each per answer, plus its own texts. */
export const MAX_TRANSLATED_TEXTS = 200;

export const puttranslations: RequestValidator = {
  body: joi.object().keys({
    language,
    // "<field>" or "<field>.<subkey>" -> the text. The text itself is checked against the row (length in bytes included).
    fields: joi
      .object()
      .pattern(joi.string().min(1).max(130), joi.string().allow(""))
      .min(1)
      .max(MAX_TRANSLATED_TEXTS)
      .required()
      .label("Fields"),
  }),
  params: joi.object().keys({ tablename, rowid }),
};

export const showtranslations: RequestValidator = {
  params: joi.object().keys({ tablename, rowid }),
};

export const deletetranslations: RequestValidator = {
  params: joi.object().keys({ tablename, rowid, language }),
};
