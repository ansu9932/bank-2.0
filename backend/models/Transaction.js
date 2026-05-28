const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Transaction = sequelize.define('Transaction', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  account_id: { type: DataTypes.UUID, allowNull: false },
  reference_number: { type: DataTypes.STRING(30), unique: true, allowNull: false },
  transaction_type: { type: DataTypes.ENUM('credit', 'debit'), allowNull: false },
  transfer_mode: { type: DataTypes.ENUM('NEFT', 'RTGS', 'IMPS', 'INTERNAL', 'SALARY', 'INTEREST', 'CHARGE', 'REVERSAL', 'SYSTEM'), defaultValue: 'INTERNAL' },
  amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  balance_before: { type: DataTypes.DECIMAL(15, 2) },
  balance_after: { type: DataTypes.DECIMAL(15, 2) },
  description: { type: DataTypes.STRING(500) },
  narration: { type: DataTypes.STRING(500) },
  status: { type: DataTypes.ENUM('pending', 'processing', 'success', 'failed', 'reversed'), defaultValue: 'pending' },
  to_account_number: { type: DataTypes.STRING(20) },
  to_account_name: { type: DataTypes.STRING(200) },
  to_bank_name: { type: DataTypes.STRING(200) },
  to_ifsc: { type: DataTypes.STRING(20) },
  from_account_number: { type: DataTypes.STRING(20) },
  from_account_name: { type: DataTypes.STRING(200) },
  category: { type: DataTypes.STRING(100) },
  tags: { type: DataTypes.JSON },
  ip_address: { type: DataTypes.STRING(50) },
  device_info: { type: DataTypes.STRING(200) },
  failure_reason: { type: DataTypes.STRING(500) },
  processed_at: { type: DataTypes.DATE },
  reversal_reason: { type: DataTypes.STRING(500) },
  is_flagged: { type: DataTypes.BOOLEAN, defaultValue: false },
  flag_reason: { type: DataTypes.STRING(500) },
  receipt_path: { type: DataTypes.STRING(500) },
  scheduled_at: { type: DataTypes.DATE },
  is_scheduled: { type: DataTypes.BOOLEAN, defaultValue: false },
}, {
  tableName: 'transactions',
  indexes: [
    { fields: ['reference_number'] },
    { fields: ['account_id'] },
    { fields: ['status'] },
    { fields: ['created_at'] },
  ],
});

module.exports = Transaction;
