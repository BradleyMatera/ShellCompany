const crypto = require('crypto');
const { EnvVar, Connection, Audit } = require('../models');

class SecretsVault {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16;  // 128 bits
    this.tagLength = 16; // 128 bits
    this.saltLength = 32; // 256 bits

    // Master key derivation settings
    this.iterations = 100000; // PBKDF2 iterations
    this.keyRotationInterval = 90 * 24 * 60 * 60 * 1000; // 90 days in ms

    // In production, this would be stored in AWS KMS, HashiCorp Vault, etc.
    this.masterKey = process.env.VAULT_MASTER_KEY || this.generateKey();

    // Key cache for performance
    this.derivedKeys = new Map();
  }

  generateKey() {
    return crypto.randomBytes(this.keyLength).toString('hex');
  }

  generateSalt() {
    return crypto.randomBytes(this.saltLength);
  }

  // Key derivation using PBKDF2
  deriveKey(masterKey, salt, purpose = 'encryption') {
    const cacheKey = `${salt.toString('hex')}-${purpose}`;

    if (this.derivedKeys.has(cacheKey)) {
      return this.derivedKeys.get(cacheKey);
    }

    const derivedKey = crypto.pbkdf2Sync(
      Buffer.from(masterKey, 'hex'),
      salt,
      this.iterations,
      this.keyLength,
      'sha256'
    );

    // Cache the derived key (in production, implement proper cache eviction)
    this.derivedKeys.set(cacheKey, derivedKey);

    return derivedKey;
  }

  // Encrypt data using AES-256-GCM
  encrypt(plaintext, context = {}) {
    try {
      const salt = this.generateSalt();
      const iv = crypto.randomBytes(this.ivLength);
      const key = this.deriveKey(this.masterKey, salt);

      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(JSON.stringify(context))); // Additional authenticated data

      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const tag = cipher.getAuthTag();

      // Combine salt + iv + tag + encrypted data
      const result = Buffer.concat([
        salt,
        iv,
        tag,
        Buffer.from(encrypted, 'hex')
      ]).toString('base64');

      return result;
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  // Decrypt data using AES-256-GCM
  decrypt(encryptedData, context = {}) {
    try {
      const data = Buffer.from(encryptedData, 'base64');

      // Extract components
      const salt = data.slice(0, this.saltLength);
      const iv = data.slice(this.saltLength, this.saltLength + this.ivLength);
      const tag = data.slice(this.saltLength + this.ivLength, this.saltLength + this.ivLength + this.tagLength);
      const encrypted = data.slice(this.saltLength + this.ivLength + this.tagLength);

      const key = this.deriveKey(this.masterKey, salt);

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      decipher.setAAD(Buffer.from(JSON.stringify(context)));

      let decrypted = decipher.update(encrypted, null, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  // Store encrypted environment variable
  async storeSecret(userId, projectId, environmentId, key, value, metadata = {}) {
    try {
      const context = {
        userId,
        projectId,
        environmentId,
        key,
        timestamp: Date.now()
      };

      const encryptedValue = this.encrypt(value, context);

      const envVar = await EnvVar.create({
        user_id: userId,
        project_id: projectId,
        environment_id: environmentId,
        key: key,
        value_encrypted: encryptedValue,
        encryption_version: '1',
        created_at: new Date(),
        updated_at: new Date(),
        metadata: {
          ...metadata,
          encryption_algorithm: this.algorithm,
          context_hash: crypto.createHash('sha256').update(JSON.stringify(context)).digest('hex')
        }
      });

      await Audit.create({
        actor_id: userId,
        action: 'STORE_SECRET',
        target: 'env_var',
        target_id: envVar.id.toString(),
        metadata: {
          project_id: projectId,
          environment_id: environmentId,
          key: key,
          has_metadata: Object.keys(metadata).length > 0
        },
        ip_address: '127.0.0.1'
      });

      return {
        id: envVar.id,
        key: envVar.key,
        encrypted: true,
        created_at: envVar.created_at,
        metadata: envVar.metadata
      };
    } catch (error) {
      throw new Error(`Failed to store secret: ${error.message}`);
    }
  }

  // Retrieve and decrypt environment variable
  async getSecret(userId, envVarId, includeValue = false) {
    try {
      const envVar = await EnvVar.findOne({
        where: { id: envVarId, user_id: userId }
      });

      if (!envVar) {
        throw new Error('Secret not found or access denied');
      }

      const result = {
        id: envVar.id,
        key: envVar.key,
        encrypted: true,
        created_at: envVar.created_at,
        updated_at: envVar.updated_at,
        metadata: envVar.metadata
      };

      if (includeValue) {
        const context = {
          userId: envVar.user_id,
          projectId: envVar.project_id,
          environmentId: envVar.environment_id,
          key: envVar.key,
          timestamp: envVar.created_at.getTime()
        };

        result.value = this.decrypt(envVar.value_encrypted, context);

        // Log access
        await Audit.create({
          actor_id: userId,
          action: 'ACCESS_SECRET',
          target: 'env_var',
          target_id: envVarId.toString(),
          metadata: {
            key: envVar.key,
            project_id: envVar.project_id,
            environment_id: envVar.environment_id
          },
          ip_address: '127.0.0.1'
        });
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to retrieve secret: ${error.message}`);
    }
  }

  // Update secret value
  async updateSecret(userId, envVarId, newValue, metadata = {}) {
    try {
      const envVar = await EnvVar.findOne({
        where: { id: envVarId, user_id: userId }
      });

      if (!envVar) {
        throw new Error('Secret not found or access denied');
      }

      const context = {
        userId: envVar.user_id,
        projectId: envVar.project_id,
        environmentId: envVar.environment_id,
        key: envVar.key,
        timestamp: Date.now()
      };

      const encryptedValue = this.encrypt(newValue, context);

      await envVar.update({
        value_encrypted: encryptedValue,
        updated_at: new Date(),
        metadata: {
          ...envVar.metadata,
          ...metadata,
          last_updated_by: userId,
          context_hash: crypto.createHash('sha256').update(JSON.stringify(context)).digest('hex')
        }
      });

      await Audit.create({
        actor_id: userId,
        action: 'UPDATE_SECRET',
        target: 'env_var',
        target_id: envVarId.toString(),
        metadata: {
          key: envVar.key,
          project_id: envVar.project_id,
          environment_id: envVar.environment_id
        },
        ip_address: '127.0.0.1'
      });

      return {
        id: envVar.id,
        key: envVar.key,
        encrypted: true,
        updated_at: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to update secret: ${error.message}`);
    }
  }

  // Delete secret
  async deleteSecret(userId, envVarId) {
    try {
      const envVar = await EnvVar.findOne({
        where: { id: envVarId, user_id: userId }
      });

      if (!envVar) {
        throw new Error('Secret not found or access denied');
      }

      await envVar.destroy();

      await Audit.create({
        actor_id: userId,
        action: 'DELETE_SECRET',
        target: 'env_var',
        target_id: envVarId.toString(),
        metadata: {
          key: envVar.key,
          project_id: envVar.project_id,
          environment_id: envVar.environment_id
        },
        ip_address: '127.0.0.1'
      });

      return { deleted: true, id: envVarId };
    } catch (error) {
      throw new Error(`Failed to delete secret: ${error.message}`);
    }
  }

  // Get all secrets for a project/environment (without values)
  async listSecrets(userId, projectId, environmentId = null) {
    try {
      const whereClause = {
        user_id: userId,
        project_id: projectId
      };

      if (environmentId) {
        whereClause.environment_id = environmentId;
      }

      const envVars = await EnvVar.findAll({
        where: whereClause,
        attributes: ['id', 'key', 'created_at', 'updated_at', 'metadata', 'environment_id'],
        order: [['key', 'ASC']]
      });

      return envVars.map(envVar => ({
        id: envVar.id,
        key: envVar.key,
        environment_id: envVar.environment_id,
        encrypted: true,
        created_at: envVar.created_at,
        updated_at: envVar.updated_at,
        metadata: envVar.metadata
      }));
    } catch (error) {
      throw new Error(`Failed to list secrets: ${error.message}`);
    }
  }

  // Rotate encryption keys (for scheduled maintenance)
  async rotateKeys(userId, dryRun = false) {
    try {
      const oldMasterKey = this.masterKey;
      const newMasterKey = this.generateKey();

      if (dryRun) {
        return {
          action: 'key_rotation',
          dry_run: true,
          affected_secrets: await EnvVar.count(),
          new_key_generated: true
        };
      }

      // Get all encrypted environment variables
      const envVars = await EnvVar.findAll({
        attributes: ['id', 'user_id', 'project_id', 'environment_id', 'key', 'value_encrypted', 'metadata']
      });

      let rotatedCount = 0;
      const errors = [];

      for (const envVar of envVars) {
        try {
          // Decrypt with old key
          const context = {
            userId: envVar.user_id,
            projectId: envVar.project_id,
            environmentId: envVar.environment_id,
            key: envVar.key,
            timestamp: envVar.created_at?.getTime() || Date.now()
          };

          const plaintext = this.decrypt(envVar.value_encrypted, context);

          // Re-encrypt with new key
          this.masterKey = newMasterKey;
          const newEncryptedValue = this.encrypt(plaintext, context);

          // Update database
          await envVar.update({
            value_encrypted: newEncryptedValue,
            encryption_version: '2',
            updated_at: new Date(),
            metadata: {
              ...envVar.metadata,
              key_rotation_date: new Date(),
              rotated_by: userId
            }
          });

          rotatedCount++;
        } catch (error) {
          errors.push({
            env_var_id: envVar.id,
            key: envVar.key,
            error: error.message
          });

          // Restore old key for next iteration
          this.masterKey = oldMasterKey;
        }
      }

      // Clear derived key cache
      this.derivedKeys.clear();

      await Audit.create({
        actor_id: userId,
        action: 'ROTATE_ENCRYPTION_KEYS',
        target: 'vault',
        target_id: 'master_key',
        metadata: {
          rotated_count: rotatedCount,
          error_count: errors.length,
          total_secrets: envVars.length
        },
        ip_address: '127.0.0.1'
      });

      return {
        action: 'key_rotation',
        success: true,
        rotated_count: rotatedCount,
        error_count: errors.length,
        errors: errors.slice(0, 10) // Limit error details
      };
    } catch (error) {
      throw new Error(`Key rotation failed: ${error.message}`);
    }
  }

  // Backup encrypted secrets
  async backupSecrets(userId, projectId, includeValues = false) {
    try {
      const secrets = await this.listSecrets(userId, projectId);
      const backup = {
        timestamp: new Date(),
        project_id: projectId,
        user_id: userId,
        vault_version: '1.0',
        encryption_algorithm: this.algorithm,
        secrets: []
      };

      for (const secret of secrets) {
        const secretData = {
          id: secret.id,
          key: secret.key,
          environment_id: secret.environment_id,
          created_at: secret.created_at,
          updated_at: secret.updated_at,
          metadata: secret.metadata
        };

        if (includeValues) {
          const fullSecret = await this.getSecret(userId, secret.id, true);
          secretData.value_encrypted = fullSecret.value_encrypted;
        }

        backup.secrets.push(secretData);
      }

      await Audit.create({
        actor_id: userId,
        action: 'BACKUP_SECRETS',
        target: 'vault',
        target_id: projectId.toString(),
        metadata: {
          project_id: projectId,
          secret_count: backup.secrets.length,
          include_values: includeValues
        },
        ip_address: '127.0.0.1'
      });

      return backup;
    } catch (error) {
      throw new Error(`Backup failed: ${error.message}`);
    }
  }

  // Push secrets to deployment providers
  async pushSecretsToProvider(userId, projectId, environmentId, provider) {
    try {
      const secrets = await this.listSecrets(userId, projectId, environmentId);
      const secretValues = {};

      // Decrypt all secrets for the environment
      for (const secret of secrets) {
        const fullSecret = await this.getSecret(userId, secret.id, true);
        secretValues[secret.key] = fullSecret.value;
      }

      let result;
      switch (provider) {
        case 'vercel':
          const vercelService = require('./vercel');
          result = await vercelService.syncEnvironmentVariables(userId, projectId, secretValues);
          break;

        case 'netlify':
          const netlifyService = require('./netlify');
          result = await netlifyService.setEnvironmentVariables(userId, projectId, secretValues);
          break;

        case 'render':
          const renderService = require('./render');
          const envVarArray = Object.entries(secretValues).map(([key, value]) => ({ key, value }));
          result = await renderService.updateEnvironmentVariables(userId, projectId, envVarArray);
          break;

        case 'aws':
          const awsService = require('./aws');
          for (const [key, value] of Object.entries(secretValues)) {
            await awsService.putParameter(userId, `/shellcompany/${projectId}/${environmentId}/${key}`, value);
          }
          result = { success: true, count: Object.keys(secretValues).length };
          break;

        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

      await Audit.create({
        actor_id: userId,
        action: 'PUSH_SECRETS_TO_PROVIDER',
        target: 'provider_sync',
        target_id: `${provider}-${projectId}`,
        metadata: {
          provider,
          project_id: projectId,
          environment_id: environmentId,
          secret_count: secrets.length
        },
        ip_address: '127.0.0.1'
      });

      return {
        provider,
        success: true,
        pushed_count: secrets.length,
        result
      };
    } catch (error) {
      throw new Error(`Failed to push secrets to ${provider}: ${error.message}`);
    }
  }

  // Health check for vault operations
  async healthCheck() {
    try {
      const testData = 'health-check-' + Date.now();
      const context = { purpose: 'health_check', timestamp: Date.now() };

      // Test encryption/decryption
      const encrypted = this.encrypt(testData, context);
      const decrypted = this.decrypt(encrypted, context);

      if (decrypted !== testData) {
        throw new Error('Encryption/decryption test failed');
      }

      // Test database connectivity
      const secretCount = await EnvVar.count();

      return {
        status: 'healthy',
        encryption: 'ok',
        database: 'ok',
        secret_count: secretCount,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  // Get vault statistics
  async getStatistics(userId) {
    try {
      const stats = await EnvVar.findAll({
        where: { user_id: userId },
        attributes: [
          [EnvVar.sequelize.fn('COUNT', EnvVar.sequelize.col('id')), 'total_secrets'],
          [EnvVar.sequelize.fn('COUNT', EnvVar.sequelize.fn('DISTINCT', EnvVar.sequelize.col('project_id'))), 'projects'],
          [EnvVar.sequelize.fn('COUNT', EnvVar.sequelize.fn('DISTINCT', EnvVar.sequelize.col('environment_id'))), 'environments']
        ],
        raw: true
      });

      return {
        user_id: userId,
        total_secrets: parseInt(stats[0]?.total_secrets || 0),
        projects: parseInt(stats[0]?.projects || 0),
        environments: parseInt(stats[0]?.environments || 0),
        vault_version: '1.0',
        encryption_algorithm: this.algorithm
      };
    } catch (error) {
      throw new Error(`Failed to get statistics: ${error.message}`);
    }
  }
}

module.exports = new SecretsVault();