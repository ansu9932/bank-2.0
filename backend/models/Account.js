const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Account = sequelize.define('Account', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  account_number: { type: DataTypes.STRING(20), unique: true, allowNull: false },
  ifsc_code: { type: DataTypes.STRING(20), allowNull: false },
  swift_code: { type: DataTypes.STRING(20) },
  account_type: { type: DataTypes.ENUM('savings', 'current'), allowNull: false },
  balance: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0.00 },
  available_balance: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0.00 },
  hold_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0.00 },
  currency: { type: DataTypes.STRING(5), defaultValue: 'INR' },
  status: { type: DataTypes.ENUM('active', 'frozen', 'dormant', 'closed'), defaultValue: 'active' },
  daily_transfer_limit: { type: DataTypes.DECIMAL(15, 2), defaultValue: 500000.00 },
  daily_transferred: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0.00 },
  last_limit_reset: { type: DataTypes.DATE },
  interest_rate: { type: DataTypes.DECIMAL(5, 2), defaultValue: 4.00 },
  minimum_balance: { type: DataTypes.DECIMAL(10, 2), defaultValue: 1000.00 },
  nomination_name: { type: DataTypes.STRING(200) },
  nomination_relation: { type: DataTypes.STRING(100) },
  branch_name: { type: DataTypes.STRING(200), defaultValue: 'Alister Bank Main Branch' },
  branch_code: { type: DataTypes.STRING(20) },
  card_issued: { type: DataTypes.BOOLEAN, defaultValue: false },
  card_number_masked: { type: DataTypes.STRING(20) },
  cheque_book_issued: { type: DataTypes.BOOLEAN, defaultValue: false },
}, {
  tableName: 'accounts',
  indexes: [{ fields: ['account_number'] }, { fields: ['user_id'] }],
});

module.exports = Account;
