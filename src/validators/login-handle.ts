/**
 * A learner's or teacher's username (`schoolusers.schoolusername`) is a login handle, not a name: 2 to 16 English
 * letters or digits. The account forms already require this (`alphanum()` in the student and teacher create rules);
 * every other path that creates an account applies the same rule here.
 *
 * Khmer is kept out on purpose: the column's collation treats some Khmer marks as equal, so two different Khmer
 * handles could collide on its unique index, and a 16-unit cap holds only a few Khmer letters (docs: khmer-text.md).
 */
export const LOGIN_HANDLE = /^[A-Za-z0-9]{2,16}$/;

export const LOGIN_HANDLE_MESSAGE = "A username must be 2 to 16 English letters or numbers.";

export const isLoginHandle = (value: unknown): boolean => typeof value === "string" && LOGIN_HANDLE.test(value);

/** One field error per row whose `key` is not a login handle, named `<prefix>[<row>].<key>`. */
export const loginHandleFieldErrors = (
  rows: ReadonlyArray<Record<string, unknown>>,
  key: string,
  prefix = "rows",
): Array<{ field: string; message: string }> =>
  rows
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => !isLoginHandle(row[key]))
    .map(({ i }) => ({ field: `${prefix}[${i}].${key}`, message: LOGIN_HANDLE_MESSAGE }));
