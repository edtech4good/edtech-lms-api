import { lmsusers } from "../models/data-models/init-models";
import { UserBusiness } from "./user.business";

// RolePermissionBusiness.getallroles is an instance arrow-function property
// (not on the prototype), and getlmsuserbyid constructs its own instance
// internally, so the class is mocked rather than an instance spied on.
jest.mock("./role-permission.business", () => ({
  RolePermissionBusiness: jest.fn().mockImplementation(() => ({
    getallroles: jest.fn().mockResolvedValue([]),
  })),
}));

/**
 * Guards edtech-lms-api#51: POST /user (the list) and GET /user/:id must
 * never return lmsuserpasswordhash. The fix excludes the column at query
 * time (`attributes: { exclude: ["lmsuserpasswordhash"] }`), rather than
 * stripping it after the fact, so these tests assert the query itself asks
 * Sequelize to leave the column out — no MySQL involved, `findOne` and
 * `findAndCountAll` are mocked at the model boundary.
 */
describe("UserBusiness read paths exclude lmsuserpasswordhash (#51)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("getlmsuserbyid excludes lmsuserpasswordhash from the query attributes", async () => {
    const findOneSpy = jest
      .spyOn(lmsusers, "findOne")
      .mockResolvedValue({ lmsuserid: "u1", roles: [] } as any);

    await new UserBusiness().getlmsuserbyid("u1");

    expect(findOneSpy).toHaveBeenCalledTimes(1);
    const callArgs = findOneSpy.mock.calls[0][0] as any;
    expect(callArgs.attributes).toEqual(
      expect.objectContaining({ exclude: expect.arrayContaining(["lmsuserpasswordhash"]) })
    );
  });

  it("getusersall excludes lmsuserpasswordhash from the query attributes and counts DISTINCT users", async () => {
    const findAndCountAllSpy = jest
      .spyOn(lmsusers, "findAndCountAll")
      .mockResolvedValue({ rows: [], count: 0 } as any);

    await new UserBusiness().getusersall({ pageindex: 1, pagesize: 20 } as any);

    expect(findAndCountAllSpy).toHaveBeenCalledTimes(1);
    const callArgs = findAndCountAllSpy.mock.calls[0][0] as any;
    expect(callArgs.attributes).toEqual(
      expect.objectContaining({ exclude: expect.arrayContaining(["lmsuserpasswordhash"]) })
    );
    // The other half of #51: a user with N roles was previously counted N
    // times because the roles join was not de-duplicated.
    expect(callArgs.distinct).toBe(true);
  });
});
