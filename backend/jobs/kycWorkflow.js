const cron = require('node-cron');
const { Op } = require('sequelize');
const { User, SecureLink } = require('../models');
const { generateSecureToken, getSecureLinkExpiry } = require('../utils/helpers');
const { sendVideoKYCEmail, sendAccountApprovedEmail } = require('../services/emailService');
const logger = require('../utils/logger');

/**
 * KYC Workflow Automation:
 * 1. Every minute: find users in 'under_review' for 10+ min → send Video KYC link
 * 2. Every minute: find users in 'video_kyc_pending' with completed video for 10+ min → send approval + setup link
 *
 * NOTE: In production, these should be triggered by actual admin review.
 * This auto-flow simulates the banking process for demo/test purposes.
 */

const runKYCWorkflow = () => {
  // Step 1: Auto-send Video KYC after 10 minutes of under_review
  cron.schedule('* * * * *', async () => {
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const users = await User.findAll({
        where: {
          kyc_status: 'under_review',
          updated_at: { [Op.lte]: tenMinutesAgo },
          video_kyc_completed: false,
        },
        limit: 10,
      });

      for (const user of users) {
        // Check no existing valid video KYC link
        const existingLink = await SecureLink.findOne({
          where: {
            user_id: user.id,
            purpose: 'video_kyc',
            used: false,
            expires_at: { [Op.gt]: new Date() },
          },
        });

        if (!existingLink) {
          const token = generateSecureToken();
          const expiresAt = getSecureLinkExpiry(5);

          await SecureLink.create({
            user_id: user.id,
            token,
            purpose: 'video_kyc',
            expires_at: expiresAt,
          });

          const kycLink = `${process.env.FRONTEND_URL}/video-kyc?token=${token}`;
          await sendVideoKYCEmail(user.email, user.first_name, kycLink);

          // Update status so we don't re-process
          await user.update({ kyc_status: 'video_kyc_pending' });
          logger.info(`Video KYC link sent to ${user.email}`);
        }
      }
    } catch (err) {
      logger.error(`KYC Workflow Step 1 error: ${err.message}`);
    }
  });

  // Step 2: Auto-approve + send setup link after 10 minutes of video_kyc_pending with video completed
  cron.schedule('* * * * *', async () => {
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const users = await User.findAll({
        where: {
          kyc_status: 'video_kyc_pending',
          video_kyc_completed: true,
          updated_at: { [Op.lte]: tenMinutesAgo },
        },
        limit: 10,
      });

      for (const user of users) {
        const existingSetup = await SecureLink.findOne({
          where: {
            user_id: user.id,
            purpose: 'account_setup',
            used: false,
            expires_at: { [Op.gt]: new Date() },
          },
        });

        if (!existingSetup) {
          // Create account
          const { Account } = require('../models');
          const { generateAccountNumber, generateIFSC } = require('../utils/helpers');

          let account = await Account.findOne({ where: { user_id: user.id } });
          if (!account) {
            account = await Account.create({
              user_id: user.id,
              account_number: generateAccountNumber(),
              ifsc_code: generateIFSC('000001'),
              swift_code: process.env.BANK_SWIFT || 'ALSTINBB',
              account_type: user.account_type,
              balance: 0.00,
              available_balance: 0.00,
              currency: 'INR',
              status: 'active',
            });
          }

          const setupToken = generateSecureToken();
          await SecureLink.create({
            user_id: user.id,
            token: setupToken,
            purpose: 'account_setup',
            expires_at: getSecureLinkExpiry(5),
          });

          const setupLink = `${process.env.FRONTEND_URL}/account-setup?token=${setupToken}`;
          await sendAccountApprovedEmail(user.email, user.first_name, setupLink, account.account_number);

          await user.update({ kyc_status: 'approved' });
          logger.info(`Account approved and setup link sent to ${user.email}`);
        }
      }
    } catch (err) {
      logger.error(`KYC Workflow Step 2 error: ${err.message}`);
    }
  });

  // Clean up expired OTPs and secure links every hour
  cron.schedule('0 * * * *', async () => {
    try {
      const { OTP } = require('../models');
      await OTP.update({ used: true }, { where: { expires_at: { [Op.lt]: new Date() }, used: false } });
      await SecureLink.update({ used: true }, { where: { expires_at: { [Op.lt]: new Date() }, used: false } });
      logger.info('Expired OTPs and secure links cleaned up.');
    } catch (err) {
      logger.error(`Cleanup job error: ${err.message}`);
    }
  });

  // Daily limit reset at midnight
  cron.schedule('0 0 * * *', async () => {
    try {
      const { Account } = require('../models');
      await Account.update({ daily_transferred: 0, last_limit_reset: new Date() }, { where: {} });
      logger.info('Daily transfer limits reset.');
    } catch (err) {
      logger.error(`Daily limit reset error: ${err.message}`);
    }
  });

  logger.info('KYC workflow cron jobs initialized.');
};

module.exports = { runKYCWorkflow };
