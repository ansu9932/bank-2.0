const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OTP = sequelize.define('OTP', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  email: { type: DataTypes.STRING(200), allowNull: false },
  otp_hash: { type: DataTypes.STRING(255), allowNull: false },
  purpose: { type: DataTypes.ENUM('email_verification', 'login', 'transaction', 'password_reset', '2fa'), allowNull: false },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  used: { type: DataTypes.BOOLEAN, defaultValue: false },
  attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
  ip_address: { type: DataTypes.STRING(50) },
}, {
  tableName: 'otps',
  indexes: [{ fields: ['email', 'purpose'] }],
});

module.exports = OTP;
