const { Umzug, SequelizeStorage } = require('umzug');
const path = require('path');
const { sequelize, Sequelize } = require('./models');

async function runMigrations() {
  const umzug = new Umzug({
    migrations: { glob: path.join(__dirname, 'migrations', '*.js') },
    // Provide both queryInterface and Sequelize constructor in context so
    // migrations have access to DataTypes, literal, and other Sequelize
    // utilities if they prefer. Migrations can destructure either `context`
    // or expect `context.queryInterface` and `context.Sequelize`.
    context: {
      queryInterface: sequelize.getQueryInterface(),
      Sequelize
    },
    storage: new SequelizeStorage({ sequelize }),
    logger: console
  });

  const pending = await umzug.pending();
  if (pending.length === 0) {
    console.log('No pending migrations');
    return;
  }

  console.log(`Running ${pending.length} migrations`);
  await umzug.up();
  console.log('Migrations complete');
}

if (require.main === module) {
  runMigrations().catch(err => {
    console.error('Migration failed:', err && err.stack || err);
    process.exit(1);
  });
}

module.exports = { runMigrations };
