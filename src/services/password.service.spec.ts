import bcryptjs from "bcryptjs";
import md5 from "crypto-js/md5";
import { hashPassword, verifyPassword } from "./password.service";

/**
 * Guards edtech-lms-api#34's removal of the legacy MD5 login path. Before
 * that change, verifyPassword accepted a stored value that was a bare
 * unsalted-MD5 hex hash by comparing md5(plain) === stored directly; after
 * it, only a bcrypt-wrapped hash (starting "$2") is accepted at all, and a
 * bare MD5 hash is rejected outright, matching or not.
 */
describe("password.service", () => {
  it("hashPassword produces a bcrypt hash (bcrypt(md5(password)))", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(hash.startsWith("$2")).toBe(true);
  });

  it("verifyPassword accepts the right password against a bcrypt hash", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("verifyPassword rejects the wrong password against a bcrypt hash", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("wrong password", hash)).toBe(false);
  });

  it("verifyPassword rejects a bare MD5 hex hash even when it is the right password's MD5 (the removed legacy path)", () => {
    const plain = "correct horse battery staple";
    const bareMd5Hash = md5(plain).toString();
    expect(verifyPassword(plain, bareMd5Hash)).toBe(false);
  });

  it("verifyPassword rejects any non-bcrypt stored value, not just MD5-shaped ones", () => {
    expect(verifyPassword("anything", "not-a-hash-at-all")).toBe(false);
  });

  it("verifyPassword rejects a falsy stored hash", () => {
    expect(verifyPassword("anything", "")).toBe(false);
    expect(verifyPassword("anything", undefined as unknown as string)).toBe(false);
  });

  it("verifyPassword still uses bcrypt comparison under the hood (sanity check against bcryptjs directly)", () => {
    const md5hex = md5("hunter2").toString();
    const stored = bcryptjs.hashSync(md5hex, 10);
    expect(verifyPassword("hunter2", stored)).toBe(true);
  });
});
