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
  // Active daily transaction limit. New accounts start RESTRICTED at ₹5,000;
  // an admin can raise it up to the ₹5,00,000 max ceiling via modifyUserCeiling.
  daily_transfer_limit: { type: DataTypes.DECIMAL(15, 2), defaultValue: 5000.00 },
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
  // ── Activation deposit (SANDBOX onboarding simulation) ──────────────────────
  // Set true once the user completes the simulated minimum-balance activation
  // deposit; activation_deposit_at gates the ~1-minute-later account-setup email.
  activation_deposit_done: { type: DataTypes.BOOLEAN, defaultValue: false },
  activation_deposit_at: { type: DataTypes.DATE },
}, {
  tableName: 'accounts',
  // account_number already has a unique index via field-level `unique: true`.
  // The previous explicit indexes duplicated it (account_number) and added a
  // non-mandatory user_id filter index — both removed to stay under the 64 cap.
});

module.exports = Account;
