# Working in this repository

The central API of an open-source learning platform (NestJS, Sequelize, MySQL,
TypeScript). It serves the admin and the organisation-level data; a separate
student API serves learners and classroom servers. **This repository is
public.** Read this file before changing anything.

## What may never be committed here

- Credentials, keys, tokens, hostnames of real deployments, or `.env` contents.
- The name of any customer, school, organisation or person, including in test
  fixtures, seed data, comments and commit messages. Fixtures use invented
  names (Khmer invented names are welcome; see "Khmer text").
- A description of how a check could be got around. Comments and tests state
  the requirement ("the handler checks the row named in the path"), never the
  mechanism that would defeat it. Security findings go to the private tracker,
  not to this repo.

## Organisations: the boundary this code enforces

Several organisations share one server and one database. Every row that
belongs to a tenant carries `organisationid` (directly, or through its school
or its curriculum). The boundary is enforced in code, route by route:

- `src/business/org-scope.ts` — `scopeOf(org)`: `platform` (a platform user not
  acting), `organisation`, or a 403 for no scope. `src/business/school-scope.ts`
  and `content-scope.ts` — `findOwned*`, `andScope`, `andInOwnedSchools`.
- **A row of another organisation answers exactly as a missing row does**
  (same status and body). Lists leave it out. A write to it writes nothing.
- **A row with no owner yet is visible to the platform only.**
- Every route declares an `@OrgPolicy` (`public | self | owned | platform |
  server | global`). `npm run routes:policy -- --write` regenerates
  `docs/route-policy-inventory.md` and `src/route-policy/pending-enforcement.snapshot.txt`;
  `src/route-policy/route-inventory.spec.ts` pins the counts and fails on an
  undeclared route. An `owned` route counts as enforced only when it names a
  spec (`enforcedBy`) with a running test titled `METHOD /path`.
- Payloads sent to the student API are kept byte-identical to what it expects
  (`src/business/student-api-payload.ts`, `content-api-payloads.spec.ts`).
  Server-to-server calls to it carry `X-Organisation-Id` (an id, or `platform`).
- A request body or query value never stands in for the organisation or for a
  path id: handlers check the row named in the path with the caller's scope.

## Tests and verification

- `npx jest --maxWorkers=2` (never the default worker count). `npx tsc --noEmit
  -p tsconfig.build.json`. `npm run build`.
- **Prove a new assertion can fail**: break the thing it watches and show the
  test goes red, then restore. A test that cannot fail is not a test.
- Compare whole response bodies (minus `reference`/`logid`/`stack`), never a
  substring; assert id sets, not counts; never `toBeGreaterThanOrEqual(400)`;
  never mock the scope helper under test.
- A route that changes behaviour for the admin UI, the learner app or the
  student API must say so in the PR.
- Deploy notes belong in the PR: migrations to run, flags to set, who must sign
  in again.
- Central never runs `sequelize.sync()`, so an index a model declares
  (`indexes:`) exists only if a migration creates it, with the same name and
  columns (`20261008140000-model-indexes`). `npm run db:check-indexes` compares
  the compiled models with a migrated database and must report nothing MISSING.
  A declared unique index also needs a duplicate guard before it is added.

## Khmer text

The product is taught in Khmer. ASCII test data cannot fail a check that only
Khmer can fail. Names are compared with trim + NFC + lower-case
(`src/business/school-identity.ts`), never by database collation, which treats
some Khmer marks as equal. Use at least one Khmer fixture in any spec about
names, and keep its marks exactly.

## Sessions

One token per user: signing in anywhere evicts the previous session. Tests
that sign in must use their own fixture accounts, never shared demo logins.

## Git

Branch from `origin/main`; `main` is protected (PR + CI). Squash merge; never
delete a branch that is the base of another PR. Commit messages say what
changed for a reader, in one line.
