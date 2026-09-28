import { BulkUpload } from "./student.business.validator";

const schoolUserExistsMock = jest.fn();
jest.mock("src/business/schooluser.business", () => ({
  SchoolUserBusiness: jest.fn().mockImplementation(() => ({
    schoolUserExists: schoolUserExistsMock,
  })),
}));

/**
 * Duplicate usernames in a bulk upload: one field per clashing ROW (index +
 * field), so the admin can find it - and never the usernames themselves.
 */
describe("student BulkUpload duplicate usernames", () => {
  it("reports each clashing row by index, without echoing any username", async () => {
    schoolUserExistsMock.mockResolvedValue([{ schoolusername: "សុខា01" }, { schoolusername: "dara02" }]);
    const [error] = await BulkUpload({} as any, {
      students: [{ schoolusername: "fresh" }, { schoolusername: "សុខា01" }, { schoolusername: "dara02" }],
    } as any);

    const details = error!.details;
    expect(details.map((d) => d.path[0])).toEqual(["students[1].schoolusername", "students[2].schoolusername"]);
    expect(details.every((d) => d.type === "any.invalid")).toBe(true);
    const serialized = JSON.stringify(details);
    expect(serialized).not.toContain("សុខា01");
    expect(serialized).not.toContain("dara02");
  });
});
