const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

/**
 * Generate unique Customer ID: ALB + year + 6 digits
 */
const generateCustomerID = () => {
  const year = new Date().getFullYear().toString().slice(-2);
  const random = Math.floor(100000 + Math.random() * 900000);
  return `ALB${year}${random}`;
};

/**
 * Generate 16-digit bank account number
 * Format: 4141 (prefix) + 9 digits (middle) + 4 digits (suffix) = 17 chars total
 * The 4-digit suffix range (1000–9999) guarantees a stable, uniform width
 * with no leading-zero truncation.
 */
const generateAccountNumber = () => {
  const prefix = '4141'; // Alister Bank prefix
  const middle = Math.floor(100000000 + Math.random() * 900000000).toString();
  const suffix = Math.floor(1000 + Math.random() * 9000).toString();
  return prefix + middle + suffix;
};

/**
 * Generate IFSC Code: ALST0 + 6 digit branch code
 */
const generateIFSC = (branchCode = '000001') => {
  return `ALST0${branchCode}`;
};

/**
 * Generate transaction reference number
 */
const generateReferenceNumber = (mode = 'IMPS') => {
  const timestamp = Date.now().toString();
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${mode}${timestamp.slice(-10)}${random}`;
};

/**
 * Generate support ticket number
 */
const generateTicketNumber = () => {
  const ts = Date.now().toString().slice(-8);
  return `TKT${ts}`;
};

/**
 * Generate 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Generate secure random token
 */
const generateSecureToken = (length = 64) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Hash a value using SHA-256
 */
const hashValue = (value) => {
  return crypto.createHash('sha256').update(value).digest('hex');
};

/**
 * Mask account number: show only last 4 digits
 */
const maskAccountNumber = (accountNumber) => {
  if (!accountNumber) return '****';
  return 'XXXX XXXX XXXX ' + accountNumber.slice(-4);
};

/**
 * Format currency
 */
const formatCurrency = (amount, currency = 'INR') => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

/**
 * Calculate OTP expiry (5 minutes from now)
 */
const getOTPExpiry = (minutes = 5) => {
  return new Date(Date.now() + minutes * 60 * 1000);
};

/**
 * Get secure link expiry
 */
const getSecureLinkExpiry = (minutes = 5) => {
  return new Date(Date.now() + minutes * 60 * 1000);
};

/**
 * Strict 24-hour expiry for onboarding secure links (Video KYC + Account Setup).
 * Returns the absolute timestamp written into SecureLink.expires_at so an
 * onboarding invitation is valid for exactly 24 hours from issuance.
 */
const ONBOARDING_LINK_EXPIRY_HOURS = 24;
const getOnboardingLinkExpiry = () => {
  return new Date(Date.now() + ONBOARDING_LINK_EXPIRY_HOURS * 60 * 60 * 1000);
};

/**
 * Check if value is expired
 */
const isExpired = (expiryDate) => {
  return new Date() > new Date(expiryDate);
};

/**
 * Sanitize user input
 */
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/[<>]/g, '');
};

/**
 * Generate referral code
 */
const generateReferralCode = (name) => {
  const prefix = name.slice(0, 3).toUpperCase();
  const random = Math.floor(10000 + Math.random() * 90000);
  return `${prefix}${random}`;
};

/**
 * Detect device type from user agent
 */
const detectDevice = (userAgent = '') => {
  if (/mobile/i.test(userAgent)) return 'mobile';
  if (/tablet|ipad/i.test(userAgent)) return 'tablet';
  return 'desktop';
};

/**
 * Paginate results
 */
const paginate = (page = 1, limit = 20) => {
  const offset = (parseInt(page) - 1) * parseInt(limit);
  return { limit: parseInt(limit), offset };
};

module.exports = {
  generateCustomerID,
  generateAccountNumber,
  generateIFSC,
  generateReferenceNumber,
  generateTicketNumber,
  generateOTP,
  generateSecureToken,
  hashValue,
  maskAccountNumber,
  formatCurrency,
  getOTPExpiry,
  getSecureLinkExpiry,
  getOnboardingLinkExpiry,
  isExpired,
  sanitizeInput,
  generateReferralCode,
  detectDevice,
  paginate,
};
