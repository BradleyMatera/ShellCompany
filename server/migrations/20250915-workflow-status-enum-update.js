const { DataTypes } = require('sequelize');

module.exports = {
  async up({ context: { queryInterface, Sequelize } }) {
    console.log('Updating workflow status enum to include new ASK lifecycle states...');

    // First, add the new status values to the enum
    // Note: Different databases handle enum updates differently
    // This approach works for both SQLite and PostgreSQL

    try {
      // For SQLite, we need to recreate the table with new enum values
      // For PostgreSQL, we can alter the type
      const dialect = queryInterface.sequelize.getDialect();

      if (dialect === 'sqlite') {
        // SQLite doesn't support altering enums directly, but since we're using DataTypes.ENUM
        // in a way that's stored as VARCHAR with CHECK constraints in Sequelize,
        // we can add the new statuses by updating the check constraint
        console.log('Updating SQLite workflow status enum...');

        // Create a backup table
        await queryInterface.sequelize.query(`
          CREATE TABLE workflows_backup AS SELECT * FROM workflows;
        `);

        // Drop the original table
        await queryInterface.dropTable('workflows');

        // Recreate with new status enum
        await queryInterface.createTable('workflows', {
          id: {
            type: DataTypes.STRING,
            primaryKey: true,
            allowNull: false
          },
          directive: {
            type: DataTypes.TEXT,
            allowNull: false
          },
          status: {
            type: DataTypes.ENUM(
              'planned',
              'awaiting_clarification',
              'in_progress',
              'executing',
              'waiting_for_ceo_approval',
              'completed',
              'failed',
              'paused',
              'rejected'
            ),
            defaultValue: 'planned',
            allowNull: false
          },
          start_time: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
          },
          end_time: {
            type: DataTypes.DATE,
            allowNull: true
          },
          total_duration: {
            type: DataTypes.INTEGER,
            allowNull: true
          },
          tasks: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: []
          },
          estimates: {
            type: DataTypes.JSON,
            allowNull: true
          },
          progress: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: {
              completed: 0,
              failed: 0,
              total: 0,
              percentage: 0
            }
          },
          artifacts: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: []
          },
          metadata: {
            type: DataTypes.JSON,
            allowNull: true
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
          },
          updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
          }
        });

        // Restore data from backup
        await queryInterface.sequelize.query(`
          INSERT INTO workflows SELECT * FROM workflows_backup;
        `);

        // Drop backup table
        await queryInterface.sequelize.query(`
          DROP TABLE workflows_backup;
        `);

        // Add indexes
        await queryInterface.addIndex('workflows', ['status']);
        await queryInterface.addIndex('workflows', ['start_time']);

      } else if (dialect === 'postgres') {
        console.log('Updating PostgreSQL workflow status enum...');

        // For PostgreSQL, we can alter the enum type
        await queryInterface.sequelize.query(`
          ALTER TYPE "enum_workflows_status" ADD VALUE 'awaiting_clarification';
          ALTER TYPE "enum_workflows_status" ADD VALUE 'in_progress';
          ALTER TYPE "enum_workflows_status" ADD VALUE 'executing';
          ALTER TYPE "enum_workflows_status" ADD VALUE 'waiting_for_ceo_approval';
          ALTER TYPE "enum_workflows_status" ADD VALUE 'rejected';
        `);
      }

      console.log('✅ Workflow status enum updated successfully');

    } catch (error) {
      console.error('❌ Error updating workflow status enum:', error);
      throw error;
    }
  },

  async down({ context: { queryInterface, Sequelize } }) {
    console.log('Reverting workflow status enum update...');

    try {
      const dialect = queryInterface.sequelize.getDialect();

      if (dialect === 'sqlite') {
        // For SQLite, recreate table with original enum values
        await queryInterface.sequelize.query(`
          CREATE TABLE workflows_backup AS SELECT * FROM workflows;
        `);

        await queryInterface.dropTable('workflows');

        await queryInterface.createTable('workflows', {
          id: {
            type: DataTypes.STRING,
            primaryKey: true,
            allowNull: false
          },
          directive: {
            type: DataTypes.TEXT,
            allowNull: false
          },
          status: {
            type: DataTypes.ENUM('planned', 'running', 'completed', 'failed', 'paused'),
            defaultValue: 'planned',
            allowNull: false
          },
          start_time: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
          },
          end_time: {
            type: DataTypes.DATE,
            allowNull: true
          },
          total_duration: {
            type: DataTypes.INTEGER,
            allowNull: true
          },
          tasks: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: []
          },
          estimates: {
            type: DataTypes.JSON,
            allowNull: true
          },
          progress: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: {
              completed: 0,
              failed: 0,
              total: 0,
              percentage: 0
            }
          },
          artifacts: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: []
          },
          metadata: {
            type: DataTypes.JSON,
            allowNull: true
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
          },
          updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
          }
        });

        // Restore data, mapping new statuses back to old ones
        await queryInterface.sequelize.query(`
          INSERT INTO workflows
          SELECT
            id, directive,
            CASE
              WHEN status IN ('awaiting_clarification', 'in_progress', 'executing') THEN 'running'
              WHEN status = 'waiting_for_ceo_approval' THEN 'completed'
              WHEN status = 'rejected' THEN 'failed'
              ELSE status
            END as status,
            start_time, end_time, total_duration, tasks, estimates, progress, artifacts, metadata, createdAt, updatedAt
          FROM workflows_backup;
        `);

        await queryInterface.sequelize.query(`DROP TABLE workflows_backup;`);

        await queryInterface.addIndex('workflows', ['status']);
        await queryInterface.addIndex('workflows', ['start_time']);

      } else if (dialect === 'postgres') {
        // For PostgreSQL, this is more complex as we can't remove enum values easily
        console.log('Warning: PostgreSQL enum values cannot be easily removed. Manual intervention may be required.');
      }

      console.log('✅ Workflow status enum reverted');

    } catch (error) {
      console.error('❌ Error reverting workflow status enum:', error);
      throw error;
    }
  }
};