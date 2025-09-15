const { DataTypes } = require('sequelize');
const CryptoJS = require('crypto-js');

module.exports = (sequelize) => {
  const Connection = sequelize.define('Connection', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    provider: {
      type: DataTypes.ENUM('github', 'google', 'vercel', 'netlify', 'render', 'aws', 'openai', 'gemini', 'claude'),
      allowNull: false
    },
    account_id: {
      type: DataTypes.STRING,
      allowNull: true // External account ID
    },
    team_id: {
      type: DataTypes.STRING,
      allowNull: true // For team-based providers
    },
    token_encrypted: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    refresh_token_encrypted: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    scopes: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_checked_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'expired', 'revoked', 'error'),
      defaultValue: 'active'
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    }
  }, {
    tableName: 'connections',
    indexes: [
      { fields: ['user_id'] },
      { fields: ['provider'] },
      { fields: ['user_id', 'provider'], unique: true },
      { fields: ['expires_at'] },
      { fields: ['status'] }
    ]
  });

  // Instance methods for encryption/decryption
  Connection.prototype.setToken = function(token) {
    const encryptionKey = process.env.ENCRYPTION_KEY;
    this.token_encrypted = CryptoJS.AES.encrypt(token, encryptionKey).toString();
  };

  Connection.prototype.getToken = function() {
    const encryptionKey = process.env.ENCRYPTION_KEY;
    try {
      const bytes = CryptoJS.AES.decrypt(this.token_encrypted, encryptionKey);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      console.error('Failed to decrypt token:', error);
      return null;
    }
  };

  Connection.prototype.setRefreshToken = function(refreshToken) {
    if (!refreshToken) {
      this.refresh_token_encrypted = null;
      return;
    }
    const encryptionKey = process.env.ENCRYPTION_KEY;
    this.refresh_token_encrypted = CryptoJS.AES.encrypt(refreshToken, encryptionKey).toString();
  };

  Connection.prototype.getRefreshToken = function() {
    if (!this.refresh_token_encrypted) return null;
    const encryptionKey = process.env.ENCRYPTION_KEY;
    try {
      const bytes = CryptoJS.AES.decrypt(this.refresh_token_encrypted, encryptionKey);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      console.error('Failed to decrypt refresh token:', error);
      return null;
    }
  };

  Connection.prototype.isExpired = function() {
    if (!this.expires_at) return false;
    return new Date() >= this.expires_at;
  };

  Connection.prototype.isExpiringSoon = function(days = 7) {
    if (!this.expires_at) return false;
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() + days);
    return this.expires_at <= warningDate;
  };

  return Connection;
};
