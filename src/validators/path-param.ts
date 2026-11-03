/**
 * The value of a path parameter, as text: the empty string when the route has no such parameter.
 *
 * A rule that leaves one row out of its "already exists" check (the row being edited) reads that row's id here,
 * from the path: a route that creates a row has no such id and leaves no row out.
 */
export const pathParam = (request: { params?: unknown }, name: string): string => {
  const value = (request.params as Record<string, unknown> | undefined)?.[name];
  return typeof value === "string" ? value : "";
};
