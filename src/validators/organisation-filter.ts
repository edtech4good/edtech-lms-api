import joi from "joi";

/** The filter key every owned list accepts: the rows of one organisation. */
export const ORGANISATION_FILTER_KEY = "organisationid";

/**
 * The value of a list's filter entry. For `organisationid` it is exactly one organisation id (a uuid): a blank, an
 * array, an object or a number is refused (400), never read as "no filter", which would show a platform caller every
 * row. Any other key keeps the rule the list already had (`otherwise`).
 */
export const filterValue = (otherwise: joi.Schema): joi.Schema =>
  joi.when("key", {
    is: ORGANISATION_FILTER_KEY,
    then: joi.string().uuid().required().messages({
      "string.guid": "An organisation filter is one organisation id.",
      "string.base": "An organisation filter is one organisation id.",
      "string.empty": "An organisation filter is one organisation id.",
    }),
    otherwise,
  });
