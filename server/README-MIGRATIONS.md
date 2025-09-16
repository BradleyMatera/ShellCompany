# Migrations

This project uses Umzug for migrations. Migrations are stored in `server/migrations` and executed via the migration runner.

# Migrations

This project uses Umzug for schema migrations. Migration files live in `server/migrations` and are applied by `server/migration-runner.js`.

## Quick local steps

1. Install server dependencies (and optionally generate a lockfile):

# Migrations

This project uses Umzug for schema migrations. Migration files live in `server/migrations` and are applied by `server/migration-runner.js`.

## Quick local steps

1. Install server dependencies (and optionally generate a lockfile):

```bash
cd server
npm install
# Server migrations

This project uses Umzug for schema migrations. Migration files live in `server/migrations` and are applied by `server/migration-runner.js`.

## Quick local steps

1. Install server dependencies (and optionally generate a lockfile):

```bash
cd server
npm install
# Server migrations

This project uses Umzug for schema migrations. Migration files live in `server/migrations` and are applied by `server/migration-runner.js`.

## Quick local steps

1. Install server dependencies (and optionally generate a lockfile):

```bash
cd server
npm install
```

1. Run migrations locally:

```bash
npm run migrate
```

## Production runbook

- The production start script `server/scripts/start-production.js` runs migrations before forking worker processes. If migrations cannot be applied the process exits with a non-zero status to fail the deployment fast and avoid serving traffic on an inconsistent schema.

Recommended flow before deploying to production:

1. Run migrations in staging and validate behavior.
1. Create a DB backup or snapshot immediately before running production migrations.
1. Deploy the new release which will apply migrations during startup.

## Readiness and health

- The API exposes a readiness endpoint at `GET /api/ready`. It returns HTTP 200 when the database is reachable and there are no pending migrations. If the DB is unreachable or migrations are pending it returns HTTP 503.

## CI expectations

- CI should run `cd server && npm ci && npm run migrate` before executing server tests. Committing `server/package-lock.json` helps ensure reproducible CI runs.

## Rollback guidance

1. Prefer non-destructive, reversible migrations whenever possible.
1. If a destructive migration is necessary, take a DB backup before applying it.
1. If a migration causes problems in production, restore the DB from backup and redeploy the previous application version.

## Notes

- The runtime `sequelize.sync({ alter: true })` has been removed for production to prevent accidental schema drift.
- Migration files are written to be idempotent in non-production for easier local iteration; production behavior is strict.

