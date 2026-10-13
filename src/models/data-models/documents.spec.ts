import { Sequelize } from "sequelize";
import { documents } from "./documents";

/**
 * The export sends whole `documents` rows (`getdocumentsWithOwner` selects every attribute of the model), so a column
 * the model does not declare never reaches a classroom server. The media-library columns are declared as the
 * migration creates them (src/db/migrations/20261012120000-document-title-licence-attribution.ts).
 */
describe("the documents model declares the media-library columns", () => {
  // initialised against a connection that is never opened
  documents.initModel(new Sequelize("mysql://nobody:none@127.0.0.1:1/none", { logging: false }));
  const attributes = documents.getAttributes() as Record<string, { type: unknown; allowNull?: boolean; defaultValue?: unknown }>;

  it("documenttitle: VARCHAR(255), may be NULL", () => {
    expect(Object.keys(attributes)).toContain("documenttitle");
    expect(String(attributes.documenttitle!.type)).toBe("VARCHAR(255)");
    expect(attributes.documenttitle!.allowNull).toBe(true);
  });

  it("documentlicence: VARCHAR(64), NOT NULL, default 'unspecified'", () => {
    expect(String(attributes.documentlicence!.type)).toBe("VARCHAR(64)");
    expect(attributes.documentlicence!.allowNull).toBe(false);
    expect(attributes.documentlicence!.defaultValue).toBe("unspecified");
  });

  it("documentattribution: JSON, may be NULL", () => {
    expect(String(attributes.documentattribution!.type)).toBe("JSON");
    expect(attributes.documentattribution!.allowNull).toBe(true);
  });

  it("documentname keeps its type and is still the key (TEXT, NOT NULL)", () => {
    expect(String(attributes.documentname!.type)).toBe("TEXT");
    expect(attributes.documentname!.allowNull).toBe(false);
  });
});
