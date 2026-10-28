import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";

export type PublicationStatus = "published" | "withdrawn";

/**
 * One publish of one curriculum (docs/content-publishing-design.md, option A): the content of that curriculum as it was
 * the moment an editor published it, kept so that learners are served the published copy and not the draft.
 *
 *  - `payload` is the curriculum's payload (src/business/curriculum-publication.ts: its tables, plus the questions and
 *    documents it draws on). NULL means PRUNED: the payload of a publication older than the latest two of its
 *    curriculum is dropped by the publish that supersedes it (decision 9), and the row stays as history with its
 *    `summary`. A NULL payload is never served and never compared against; a reader that needs a payload takes the
 *    latest rows and treats a NULL one as absent.
 *  - `summary` is never NULL and is never pruned: the counts, the per-row hashes (table, then id, then sha256 of the
 *    row's key-sorted JSON), the names of lessons and questions, and what changed since the publication before it.
 *  - `payloadhash` is the sha256 over the hashes: equal hashes mean equal content, whatever order the rows came in.
 *  - `status`: `published`, or `withdrawn` when the curriculum was retired. The row that counts for a curriculum is
 *    its LATEST (`publishedat`, which is strictly increasing per curriculum): the curriculum is live when that row is
 *    `published`. Retiring withdraws every published row of the curriculum, so no older row stays `published` under a
 *    withdrawn latest one.
 *  - `publishedat` has millisecond precision so that the order of two publishes is never a tie.
 */
export interface curriculumpublicationsAttributes {
  publicationid: string;
  curriculumid: string;
  organisationid: string;
  publishedat: Date;
  publishedby: string;
  status: PublicationStatus;
  payload: object | null;
  summary: object;
  payloadhash: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type curriculumpublicationsPk = "publicationid";
export type curriculumpublicationsId = curriculumpublications[curriculumpublicationsPk];
export type curriculumpublicationsCreationAttributes = Optional<
  curriculumpublicationsAttributes,
  curriculumpublicationsPk | "status" | "payload" | "createdAt" | "updatedAt"
>;

export class curriculumpublications
  extends Model<curriculumpublicationsAttributes, curriculumpublicationsCreationAttributes>
  implements curriculumpublicationsAttributes
{
  publicationid!: string;
  curriculumid!: string;
  organisationid!: string;
  publishedat!: Date;
  publishedby!: string;
  status!: PublicationStatus;
  payload!: object | null;
  summary!: object;
  payloadhash!: string;
  createdAt!: Date;
  updatedAt!: Date;

  static initModel(sequelize: Sequelize.Sequelize): typeof curriculumpublications {
    curriculumpublications.init(
      {
        publicationid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          primaryKey: true,
        },
        curriculumid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          references: { model: "curriculums", key: "curriculumid" },
        },
        organisationid: {
          type: DataTypes.STRING(36),
          allowNull: false,
          references: { model: "organisations", key: "organisationid" },
        },
        publishedat: {
          type: DataTypes.DATE(3),
          allowNull: false,
        },
        publishedby: {
          type: DataTypes.STRING(36),
          allowNull: false,
          references: { model: "lmsusers", key: "lmsuserid" },
        },
        status: {
          type: DataTypes.ENUM("published", "withdrawn"),
          allowNull: false,
          defaultValue: "published",
        },
        payload: {
          type: DataTypes.JSON,
          allowNull: true,
        },
        summary: {
          type: DataTypes.JSON,
          allowNull: false,
        },
        payloadhash: {
          type: DataTypes.CHAR(64),
          allowNull: false,
        },
      },
      {
        sequelize,
        tableName: "curriculumpublications",
        charset: "utf8mb4",
        collate: "utf8mb4_unicode_ci",
        timestamps: true,
        indexes: [
          {
            name: "PRIMARY",
            unique: true,
            using: "BTREE",
            fields: [{ name: "publicationid" }],
          },
          {
            name: "curriculumpublications_curriculum_publishedat",
            using: "BTREE",
            fields: [{ name: "curriculumid" }, { name: "publishedat" }],
          },
          {
            name: "curriculumpublications_organisationid",
            using: "BTREE",
            fields: [{ name: "organisationid" }],
          },
          {
            name: "curriculumpublications_publishedby",
            using: "BTREE",
            fields: [{ name: "publishedby" }],
          },
        ],
      },
    );
    return curriculumpublications;
  }
}
