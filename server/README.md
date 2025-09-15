# Server tests

This folder contains server-side integration tests.

Run the reconcile integration test locally with:

```bash
cd server
npm run test:reconcile
```

The test will initialize the orchestrator and attempt to persist any pending artifacts via the reconciler.

## Migrations & Production Guidance

Important: avoid running `sequelize.sync({ alter: true })` in production. While convenient during development, `alter` can perform destructive DDL (DROP/ALTER) that fails when foreign key constraints exist and can cause unpredictable downtime.

Recommended practice:

- Use explicit migrations (Sequelize CLI / Umzug / another migration tool) to apply schema changes in a controlled way.
- Run migrations as part of your deployment pipeline (CI/CD) instead of at application startup.
- Keep a database backup before applying schema changes for quick rollback.

Quick recovery if you see `SQLITE_CONSTRAINT: FOREIGN KEY constraint failed` during startup:

1. Stop the application/process.
2. Inspect the full error in the server logs to identify which table/operation failed.
3. If this is a local dev DB you can reset by removing `server/shellcompany.db` and re-running the app (data will be lost).
	- Example: `rm server/shellcompany.db && cd server && npm run dev`
4. For production, **do not** delete the DB. Instead: restore from backup, run the relevant migration manually, or run a non-destructive migration that adds required FK-compatible changes.

If you want, I can add a small Umzug migration scaffold and a CI job to safely run migrations; tell me which migration tool you prefer and I will wire it up.
