# EdTech LMS API

This is the central API for an offline-first learning management system built for classrooms in Cambodia. It runs in the cloud and holds the source of truth: schools, users, curriculum, quiz content and the student logs that come back from classrooms. It is a NestJS app on MySQL, with Sequelize for the data layer, JWT for auth, S3 for media and SMTP for email.

## How it fits with the other repos

The system is seven repos under [github.com/edtech4good](https://github.com/edtech4good). Three matter from here:

- [edtech-lms-ui](https://github.com/edtech4good/edtech-lms-ui), the Angular web app for admins, teachers and students. It talks to this API.
- [edtech-lms-rpi-api](https://github.com/edtech4good/edtech-lms-rpi-api), the classroom API. It runs on a Raspberry Pi, or any Linux box, on the school's own network. Content goes from here to there and student logs come back.
- [edtech-expo](https://github.com/edtech4good/edtech-expo), the student app for phones, tablets and web. It reads lessons from the classroom API and reaches this one for content sync and school login.

Content moves in two directions:

1. Cloud to classroom. `GET /sync/content` builds a curriculum zip. A client can download it and `PUT` it to the classroom API at `/import/master`, or this server can push it itself with `POST /sync/cloud`, which sends the zip to `{RPI_CLOUD}/import/master` using `SERVER_SYNC_KEY`.
2. Classroom to cloud. The classroom API serves `GET /export/log`. A client downloads that zip and sends it here with `PUT /log/import` as a multipart upload in the `importfile` field.

Teachers and school accounts log in here with `POST /auth/school/login`. Students log in against the classroom API. Each user gets one access token at a time, so logging in from a second place, including with `curl`, ends the first session.

## What you need

- Node 20. The deploy image is `node:20-alpine`. Node 20 reached end of life in April 2026, so expect this to move to Node 22.
- MySQL 8.0
- An S3 bucket for media, or an S3-compatible endpoint
- An SMTP account if you want email to actually send. The app starts without one.

## Running it locally

```bash
npm install
cp env.example .env
npm run db:migrate
npm run start:dev
```

The API listens on port 3000. Swagger is at http://localhost:3000/docs.

Configuration is read in `src/config.ts`. Every setting has a flat environment variable, and the whole block can also arrive as one JSON value in `FORTYKAPICONFIG`, which is how the deployed containers get it. The flat variables are easier for local work:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_NAME=edtech_lms
DB_USER=your-db-user
DB_PASSWORD=your-db-password

APPLICATION_SECRET=your-jwt-secret

AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_S3_BUCKET=your-s3-bucket-name
AWS_ENDPOINT=https://s3.amazonaws.com

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-email-password
SMTP_FROM=your-email@example.com

# Only needed if this server pushes content to a classroom API itself
RPI_CLOUD=https://classroom-api.example.com
SERVER_SYNC_KEY=a-token-the-classroom-api-also-knows
```

`env.example` has the full list. Treat `SERVER_SYNC_KEY`, `RPI_SECRET` and `APPLICATION_SECRET` as secrets.

## Seeding a database you can log in to

The migrations create a superadmin whose password you don't know, and no content. Three scripts fix that. Each refuses to run without an explicit opt-in flag, so a migrate-and-seed habit can't touch production by accident.

```bash
# Set a known password on the seeded superadmin
ALLOW_LOCAL_DEV_SEED=true npm run seed:local

# Synthetic demo content: one country down to quiz questions, plus students and their progress
ALLOW_DEMO_SEED=true npm run seed:demo

# A real client curriculum, loaded under a corporate-themed school
ALLOW_DEMO_SEED=true npm run seed:dcrs
```

The demo and client seeds use fixed IDs that match the same-named seeds in edtech-lms-rpi-api. Seed both databases and they look the way they would after a real sync.

## Scripts

- `npm run start:dev` runs Nest in watch mode.
- `npm run build` then `npm start` (or `npm run start:prod`, same thing) is the production path. The build lands in `build/` and both run `build/server.js`.
- `npm run db:migrate` runs the Sequelize migrations.
- `npm run lint` runs ESLint with autofix. `npm run format` runs Prettier.

There is no unit test suite in this repo. The end-to-end tests that exercise this API live in [edtech-lms-ui](https://github.com/edtech4good/edtech-lms-ui) under `e2e/` and run with Playwright against a local stack.

## Layout

```
src/
├── business/       # Business logic
├── config/         # Config validation
├── db/             # Sequelize models and migrations
├── decorators/
├── filters/        # Exception filters
├── guards/         # Auth guards
├── interceptors/
├── middlewares/
├── models/         # Types and interfaces
├── modules/        # Feature modules (controllers live here)
├── pipes/
├── services/
└── validators/
scripts/            # Seed scripts
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). One thing it does not say: this repo and edtech-lms-rpi-api share a lot of code by copy rather than by package. If you fix something here, check whether the classroom API has the same bug. It usually does.

## License and support

MIT, see [LICENSE](LICENSE). Questions and bugs go to [GitHub Issues](https://github.com/edtech4good/edtech-lms-api/issues).
