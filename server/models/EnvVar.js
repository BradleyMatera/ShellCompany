const { DataTypes } = require('sequelize');
const CryptoJS = require('crypto-js');

module.exports = (sequelize) => {
  const EnvVar = sequelize.define('EnvVar', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    environment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'environments',
        key: 'id'
      }
    },
    key: {
      type: DataTypes.STRING,
      allowNull: false
    },
    value_encrypted: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    last_pushed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    providers_pushed: {
      type: DataTypes.JSON,
      defaultValue: []
    }
  }, {
    tableName: 'env_vars',
    indexes: [
      { fields: ['environment_id'] },
      { fields: ['environment_id', 'key'], unique: true }
    ]
  });

  EnvVar.prototype.setValue = function(value) {
    const encryptionKey = process.env.ENCRYPTION_KEY;
    this.value_encrypted = CryptoJS.AES.encrypt(value, encryptionKey).toString();
  };

  EnvVar.prototype.getValue = function() {
    const encryptionKey = process.env.ENCRYPTION_KEY;
    try {
      const bytes = CryptoJS.AES.decrypt(this.value_encrypted, encryptionKey);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      console.error('Failed to decrypt env var:', error);
      return null;
    }
  };

  return EnvVar;
};