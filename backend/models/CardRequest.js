const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CardRequest = sequelize.define('CardRequest', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  request_type: { type: DataTypes.ENUM('debit_card', 'cheque_book'), allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'processing', 'dispatched', 'delivered', 'cancelled'), defaultValue: 'pending' },
  delivery_address: { type: DataTypes.TEXT },
  tracking_number: { type: DataTypes.STRING(100) },
  expected_delivery: { type: DataTypes.DATEONLY },
  notes: { type: DataTypes.TEXT },
}, { tableName: 'card_requests' });

module.exports = CardRequest;
