/**
 * The one-shot initial publication of curricula (docs/content-publishing-design.md, decision 2), in the database named by
 * .env:
 *
 *   npm run publish:initial -- --organisation <organisationid> [--dry-run] [--as <lmsuserid>]
 *   npm run publish:initial -- --all [--dry-run] [--as <lmsuserid>]
 *
 * Publishes, for each organisation named, every curriculum that has no publication row, as it stands now (see
 * src/business/initial-publication.ts for the rules: all or nothing per organisation, one transaction each, idempotent).
 * Run it once per database, after the migrations of A4 step 1 and before the first sync that serves publications. An
 * organisation whose content names rows it does not own is REFUSED: it is reported with the tables and counts that are
 * wrong (never a row or an id), nothing is written for it, and the others carry on.
 *
 *   --dry-run   builds and checks everything and writes nothing; prints what it would publish
 *   --as <id>   the staff account recorded as the publisher (default: the platform account the migrations seed)
 *
 * Prints one line per organisation (ids only) and the database it ran against. Exit 0 when no organisation was refused,
 * 1 when any was, 2 for a usage or other error.
 */
import { dbinstance } from "src/services/dbservice";
import { initModels } from "src/models/data-models/init-models";
import { Config } from "src/config";
import { Args, initialPublisher, InitialOutcome, organisationsToPublish, parseArgs, publishInitial } from "src/business/initial-publication";

const USAGE = "usage: npm run publish:initial -- (--organisation <organisationid> | --all) [--dry-run] [--as <lmsuserid>]";

const line = (o: InitialOutcome, dryRun: boolean): string => {
  if (o.status === "refused") {
    return `${o.organisationid}: REFUSED, nothing written. ${o.problems.map((p) => p.message).join(" ")}`;
  }
  if (o.status === "nothing") return `${o.organisationid}: nothing to publish`;
  return `${o.organisationid}: ${dryRun ? "would publish" : "published"} ${o.curricula.length} curricul${o.curricula.length === 1 ? "um" : "a"}`;
};

async function main(): Promise<void> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`${e instanceof Error ? e.message : e}\n${USAGE}`);
    process.exit(2);
  }
  const sequelize = dbinstance.getdbinstance();
  (sequelize as unknown as { options: { logging: boolean } }).options.logging = false;
  initModels(sequelize);
  console.log(`database: ${Config.fortyk.api.database.name}${args.dryRun ? " (dry run)" : ""}`);

  const publisher = await initialPublisher(args.as);
  const targets = await organisationsToPublish(args.all ? { all: true } : { organisationid: args.organisationid as string });
  let refused = 0;
  let published = 0;
  for (const organisationid of targets) {
    const outcome = await publishInitial(organisationid, publisher, { dryRun: args.dryRun });
    console.log(line(outcome, args.dryRun));
    if (outcome.status === "refused") refused += 1;
    published += outcome.curricula.length;
  }
  console.log(`${targets.length} organisation${targets.length === 1 ? "" : "s"}, ${published} curricul${published === 1 ? "um" : "a"} ${args.dryRun ? "would be published" : "published"}, ${refused} refused`);
  await sequelize.close();
  process.exit(refused === 0 ? 0 : 1);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  });
}
