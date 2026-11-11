import { Logger } from "src/config";
import { learningServerAnswer, learningServerLogFields } from "./cloud-push";
import { pushOrganisationSet } from "./publish-push";

/**
 * The fields a learning server names when it refuses a roster push because the school or a class is not there yet. The
 * curriculum fields are not here: the organisation's set carries only published curricula, so sending it cannot supply one.
 */
export const HEALABLE_FIELDS = ["schoolid", "schoolname", "standard"];

/** Did the learning server refuse (400) naming a school or class it does not hold yet? Only the field names are read. */
export const lacksSchoolOrClass = (error: unknown): boolean => {
  const answer = learningServerAnswer(error);
  return answer?.status === 400 && answer.fields.some((f) => HEALABLE_FIELDS.includes(f));
};

/**
 * Runs `send` (a push of one account, or of a school's roster). When the learning server refuses it for a school or class it
 * does not hold yet, sends the organisation's set once (the same push a school or class write makes) and runs `send` once more.
 * Never more than that: a second refusal is thrown as it came, for the caller to put into its own words.
 *
 * When the set itself cannot be sent, `send` is not run again and the first refusal is thrown: the thing is still missing, and
 * what went wrong with the set is in the log. Both tries are logged, with the fields the learning server named and never its
 * text. Without an organisation there is nothing to send, so the first refusal is thrown at once.
 */
export const sendHealing = async <T>(organisationid: string | null | undefined, send: () => Promise<T>): Promise<T> => {
  try {
    return await send();
  } catch (first) {
    if (!organisationid || !lacksSchoolOrClass(first)) throw first;
    Logger.info("the learning server lacks the school or class: sending the organisation's set, then the push again", {
      learnerserverfields: learningServerAnswer(first)?.fields,
    });
    const settled = await pushOrganisationSet(organisationid);
    if (!settled.ok) {
      Logger.error("the set sent to heal a missing school or class failed", {
        originalerrorclass: (settled.error as { constructor?: { name?: string } } | null)?.constructor?.name,
        ...learningServerLogFields(settled.error),
      });
      throw first;
    }
    try {
      const answer = await send();
      Logger.info("the push went through after the organisation's set was sent");
      return answer;
    } catch (second) {
      Logger.info("the push was refused again after the organisation's set was sent", {
        ...learningServerLogFields(second),
      });
      throw second;
    }
  }
};
