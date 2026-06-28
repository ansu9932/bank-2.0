const cron = require('node-cron');
const { Op } = require('sequelize');
const { User, SecureLink, Account } = require('../models');
const { generateSecureToken, getSecureLinkExpiry, getOnboardingLinkExpiry, generateAccountNumber, generateIFSC, minimumBalanceForType } = require('../utils/helpers');
const { sendVideoKYCEmail, sendAccountApprovedEmail, sendActivationDepositEmail } = require('../services/emailService');
const { issueDepositToken } = require('../utils/depositLink');
const logger = require('../utils/logger');

/**
 * KYC Workflow Automation:
 * 1. Every minute: find users in 'under_review' for 2+ min → send Video KYC link
 * 2. Every minute: find users in 'video_kyc_pending' with completed video for 2+ min → send activation deposit link
 * 3. Every minute: find users who completed activation deposit 2+ min ago → send account setup link
 */

const runKYCWorkflow = () => {
  // Step 1: Auto-send Video KYC after 2 minutes of under_review
  cron.schedule('* * * * *', async () => {
    try {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
      const users = await User.findAll({
        where: {
          kyc_status: 'under_review',
          updated_at: { [Op.lte]: twoMinutesAgo },
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
          // 24h expiry (was getSecureLinkExpiry(5) = 5 MINUTES, which expired
          // before users could even open the email). Matches the manual
          // admin/resend paths, which already use getOnboardingLinkExpiry().
          const expiresAt = getOnboardingLinkExpiry();

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

  // Step 2: Auto-approve + send ACTIVATION DEPOSIT link after 2 minutes of
  // video_kyc_pending with video completed. (Account-setup link follows in
  // Step 3, ~2 minutes after the activation deposit is received.)
  cron.schedule('* * * * *', async () => {
    try {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
      const users = await User.findAll({
        where: {
          kyc_status: 'video_kyc_pending',
          video_kyc_completed: true,
          updated_at: { [Op.lte]: twoMinutesAgo },
        },
        limit: 10,
      });

      for (const user of users) {
        // Create account if missing.
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
            currency: 'USD',
            status: 'active',
            minimum_balance: minimumBalanceForType(user.account_type),
          });
        }

        // Mark approved and email the (simulated) activation-deposit link.
        const { token } = issueDepositToken(user.id);
        const depositLink = `${process.env.FRONTEND_URL}/activate-deposit?token=${token}`;
        await sendActivationDepositEmail(user.email, user.first_name, {
          depositLink,
          minimumBalance: parseFloat(account.minimum_balance) || minimumBalanceForType(account.account_type),
          accountNumber: account.account_number,
        });

        await user.update({ kyc_status: 'approved' });
        logger.info(`Activation deposit link sent to ${user.email}`);
      }
    } catch (err) {
      logger.error(`KYC Workflow Step 2 error: ${err.message}`);
    }
  });

  // Step 3: ~2 minutes after the activation deposit is received,
  // email the account-setup link. Gated so it only fires once per user (no
  // existing unused account_setup link) and survives a process restart.
  cron.schedule('* * * * *', async () => {
    try {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
      const accounts = await Account.findAll({
        where: {
          activation_deposit_done: true,
          activation_deposit_at: { [Op.lte]: twoMinutesAgo },
        },
        limit: 20,
      });

      for (const account of accounts) {
        const user = await User.findByPk(account.user_id);
        if (!user || user.setup_completed) continue;

        // Skip if a setup link was already issued (prevents duplicate emails).
        const existingSetup = await SecureLink.findOne({
          where: {
            user_id: user.id,
            purpose: 'account_setup',
            used: false,
            expires_at: { [Op.gt]: new Date() },
          },
        });
        if (existingSetup) continue;

        const setupToken = generateSecureToken();
        await SecureLink.create({
          user_id: user.id,
          token: setupToken,
          purpose: 'account_setup',
          expires_at: getSecureLinkExpiry(60 * 24), // 24h
        });

        const setupLink = `${process.env.FRONTEND_URL}/account-setup?token=${setupToken}`;
        await sendAccountApprovedEmail(user.email, user.first_name, setupLink, account.account_number);
        logger.info(`Account setup link sent (post-deposit) to ${user.email}`);
      }
    } catch (err) {
      logger.error(`KYC Workflow Step 3 error: ${err.message}`);
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
