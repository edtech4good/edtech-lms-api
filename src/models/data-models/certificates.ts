import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";

export type CertificateScopeName = "level" | "grade" | "curriculum";

/**
 * What a certificate says, written when it is issued and never changed afterwards: later changes to the content, to a
 * learner's name or to a school's labels do not alter an issued certificate. `classname` is null when the learner had
 * no class at issue.
 */
export interface CertificateSnapshot {
  learnername: string;
  curriculumname: string;
  scopename: string;
  tierlabel: string;
  classname: string | null;
  organisationname: string;
  schoolname: string;
  quizcount: number;
}

/**
 * A certificate staff issued to one learner for one level, grade or whole curriculum. It is revoked, never deleted.
 * `shortcode` ("XXXX-XXXX") is what the public check page takes. At most one UNREVOKED certificate exists for a
 * (learner, scope, scopeid); the issue code enforces that inside its transaction. `revokereason` is for staff only.
 * No foreign keys: a certificate outlives the content it names.
 */
export interface certificatesAttributes {
  certificateid: string;
  shortcode: string;
  organisationid: string;
  studentid: string;
  curriculumid: string;
  scope: CertificateScopeName;
  scopeid: string;
  standardid?: string | null;
  issuedat: Date;
  issuedby: string;
  revokedat?: Date | null;
  revokedby?: string | null;
  revokereason?: string | null;
  snapshot: CertificateSnapshot;
  created_at?: Date;
  updated_at?: Date;
}

export type certificatesPk = "certificateid";
export type certificatesId = certificates[certificatesPk];
export type certificatesCreationAttributes = Optional<
  certificatesAttributes,
  "standardid" | "revokedat" | "revokedby" | "revokereason" | "created_at" | "updated_at"
>;

export class certificates
  extends Model<certificatesAttributes, certificatesCreationAttributes>
  implements certificatesAttributes
{
  certificateid!: string;
  shortcode!: string;
  organisationid!: string;
  studentid!: string;
  curriculumid!: string;
  scope!: CertificateScopeName;
  scopeid!: string;
  standardid!: string | null;
  issuedat!: Date;
  issuedby!: string;
  revokedat!: Date | null;
  revokedby!: string | null;
  revokereason!: string | null;
  snapshot!: CertificateSnapshot;
  created_at!: Date;
  updated_at!: Date;

  static initModel(sequelize: Sequelize.Sequelize): typeof certificates {
    certificates.init(
      {
        certificateid: { type: DataTypes.STRING(36), allowNull: false, primaryKey: true },
        shortcode: { type: DataTypes.CHAR(9), allowNull: false },
        organisationid: { type: DataTypes.STRING(36), allowNull: false },
        studentid: { type: DataTypes.STRING(36), allowNull: false },
        curriculumid: { type: DataTypes.STRING(36), allowNull: false },
        scope: { type: DataTypes.STRING(16), allowNull: false },
        scopeid: { type: DataTypes.STRING(36), allowNull: false },
        standardid: { type: DataTypes.STRING(36), allowNull: true },
        issuedat: { type: DataTypes.DATE(3), allowNull: false },
        issuedby: { type: DataTypes.STRING(36), allowNull: false },
        revokedat: { type: DataTypes.DATE(3), allowNull: true },
        revokedby: { type: DataTypes.STRING(36), allowNull: true },
        revokereason: { type: DataTypes.TEXT, allowNull: true },
        snapshot: { type: DataTypes.JSON, allowNull: false },
      },
      {
        sequelize,
        tableName: "certificates",
        charset: "utf8mb4",
        collate: "utf8mb4_unicode_ci",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        indexes: [
          { name: "PRIMARY", unique: true, using: "BTREE", fields: [{ name: "certificateid" }] },
          { name: "certificates_shortcode_unique", unique: true, using: "BTREE", fields: [{ name: "shortcode" }] },
          { name: "certificates_studentid", using: "BTREE", fields: [{ name: "studentid" }] },
          {
            name: "certificates_org_curriculum_scope",
            using: "BTREE",
            fields: [{ name: "organisationid" }, { name: "curriculumid" }, { name: "scope" }, { name: "scopeid" }],
          },
        ],
      },
    );
    return certificates;
  }
}
