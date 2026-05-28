const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

let transporter;

const createTransporter = () => {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: { rejectUnauthorized: false },
  });
  return transporter;
};

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const transport = createTransporter();
    const info = await transport.sendMail({
      from: process.env.EMAIL_FROM || '"Alister Bank" <noreply@alisterbank.com>',
      to,
      subject,
      html,
      text: text || subject,
    });
    logger.info(`Email sent to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    logger.error(`Email send failed to ${to}: ${err.message}`);
    return { success: false, error: err.message };
  }
};

// ─── Email Templates ──────────────────────────────────────────────────────────

const baseTemplate = (content) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Alister Bank</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background:#0a0a0f; color:#ffffff; }
    .wrapper { max-width:620px; margin:0 auto; padding:20px; }
    .header { background:linear-gradient(135deg,#c8102e 0%,#8b0000 100%); padding:32px 40px; border-radius:16px 16px 0 0; text-align:center; }
    .header img { height:40px; margin-bottom:12px; }
    .header h1 { color:#fff; font-size:22px; font-weight:700; letter-spacing:1px; }
    .header p { color:rgba(255,255,255,0.75); font-size:13px; margin-top:4px; }
    .body { background:#111118; padding:36px 40px; border-left:1px solid #1e1e2e; border-right:1px solid #1e1e2e; }
    .body h2 { font-size:20px; color:#ffffff; margin-bottom:16px; }
    .body p { color:#a0a0b0; font-size:15px; line-height:1.7; margin-bottom:14px; }
    .otp-box { background:linear-gradient(135deg,#1a0a10,#200d18); border:1px solid rgba(200,16,46,0.3); border-radius:12px; padding:24px; text-align:center; margin:24px 0; }
    .otp-code { font-size:42px; font-weight:800; letter-spacing:12px; color:#c8102e; font-family:monospace; }
    .otp-note { color:#666; font-size:12px; margin-top:10px; }
    .btn { display:inline-block; background:linear-gradient(135deg,#c8102e,#8b0000); color:#fff; text-decoration:none; padding:14px 36px; border-radius:8px; font-weight:600; font-size:15px; margin:20px 0; }
    .info-box { background:#1a1a2e; border-left:3px solid #c8102e; padding:16px 20px; border-radius:6px; margin:20px 0; }
    .info-box p { color:#c0c0d0; font-size:14px; margin:0; }
    .divider { border:none; border-top:1px solid #1e1e2e; margin:24px 0; }
    .footer { background:#0d0d14; padding:24px 40px; border-radius:0 0 16px 16px; border:1px solid #1e1e2e; border-top:none; text-align:center; }
    .footer p { color:#555; font-size:12px; line-height:1.6; }
    .footer a { color:#c8102e; text-decoration:none; }
    .anti-phish { background:#0a0a0f; border:1px solid #1e1e2e; border-radius:8px; padding:12px 16px; margin-top:16px; }
    .anti-phish p { color:#666; font-size:11px; }
    .highlight { color:#c8102e; font-weight:600; }
    .badge { display:inline-block; background:rgba(200,16,46,0.15); color:#c8102e; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600; margin-bottom:16px; }
    .detail-row { display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid #1e1e2e; }
    .detail-row:last-child { border-bottom:none; }
    .detail-label { color:#666; font-size:13px; }
    .detail-value { color:#fff; font-size:13px; font-weight:600; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>⬡ ALISTER BANK</h1>
      <p>Secure Banking · Trusted Worldwide</p>
    </div>
    ${content}
    <div class="footer">
      <p>© ${new Date().getFullYear()} Alister Bank. All rights reserved.</p>
      <p>This is an automated message. Please do not reply to this email.</p>
      <p><a href="#">Privacy Policy</a> &nbsp;|&nbsp; <a href="#">Terms of Service</a> &nbsp;|&nbsp; <a href="#">Contact Support</a></p>
      <div class="anti-phish">
        <p>🔒 <strong>Anti-Phishing Notice:</strong> Alister Bank will never ask for your password, PIN, or OTP via phone or email. If you did not request this email, please ignore it or <a href="#">report phishing</a>.</p>
      </div>
    </div>
  </div>
</body>
</html>`;

// ─── Individual Email Senders ─────────────────────────────────────────────────

const sendOTPEmail = async (email, otp, purpose = 'verification') => {
  const html = baseTemplate(`
    <div class="body">
      <div class="badge">🔐 Verification Required</div>
      <h2>Your One-Time Password</h2>
      <p>You requested an OTP for <strong>${purpose}</strong>. Use the code below to proceed:</p>
      <div class="otp-box">
        <div class="otp-code">${otp}</div>
        <p class="otp-note">⏱ This OTP expires in <strong>5 minutes</strong></p>
      </div>
      <div class="info-box">
        <p>⚠️ Never share this OTP with anyone — including Alister Bank staff. Our team will never ask for your OTP.</p>
      </div>
      <p style="color:#555; font-size:13px;">If you didn't request this OTP, your account may be at risk. Please contact support immediately.</p>
    </div>`);
  return sendEmail({ to: email, subject: `${otp} — Your Alister Bank OTP (expires in 5 min)`, html });
};

const sendKYCUnderReviewEmail = async (email, name, customerId) => {
  const html = baseTemplate(`
    <div class="body">
      <div class="badge">📋 Application Received</div>
      <h2>Documents Under Review</h2>
      <p>Dear <span class="highlight">${name}</span>,</p>
      <p>Thank you for applying to <strong>Alister Bank</strong>. We have received your application and documents. Our KYC team is currently reviewing them.</p>
      <div class="info-box">
        <p><strong>Customer ID:</strong> ${customerId}</p>
        <p style="margin-top:8px;">Please keep this ID safe for future reference.</p>
      </div>
      <p>You will receive a notification shortly to complete your <strong>Video KYC</strong> verification. This is a mandatory step to activate your account.</p>
      <p>Expected review time: <span class="highlight">10–15 minutes</span></p>
    </div>`);
  return sendEmail({ to: email, subject: 'Alister Bank — Your Application is Under Review', html });
};

const sendVideoKYCEmail = async (email, name, kycLink) => {
  const html = baseTemplate(`
    <div class="body">
      <div class="badge">🎥 Video KYC Required</div>
      <h2>Complete Your Video KYC</h2>
      <p>Dear <span class="highlight">${name}</span>,</p>
      <p>Your documents have been reviewed. To proceed with account activation, please complete your <strong>Video KYC</strong> verification.</p>
      <p style="text-align:center;">
        <a href="${kycLink}" class="btn">Start Video KYC →</a>
      </p>
      <div class="info-box">
        <p>⏱ This link expires in <strong>5 minutes</strong>. Do not share this link with anyone.</p>
      </div>
      <p><strong>What you'll need:</strong></p>
      <p>• Good lighting and a clear background<br/>• Your original ID document ready<br/>• A stable internet connection</p>
    </div>`);
  return sendEmail({ to: email, subject: 'Alister Bank — Complete Your Video KYC Now', html });
};

const sendAccountApprovedEmail = async (email, name, setupLink, accountNumber) => {
  const html = baseTemplate(`
    <div class="body">
      <div class="badge">✅ Account Approved!</div>
      <h2>Welcome to Alister Bank! 🎉</h2>
      <p>Dear <span class="highlight">${name}</span>,</p>
      <p>Congratulations! Your bank account has been <strong>approved and activated</strong>. You're now part of the Alister Bank family.</p>
      <div class="info-box">
        <p><strong>Account Number:</strong> ${accountNumber}</p>
        <p style="margin-top:6px;"><strong>IFSC Code:</strong> ALST0000001</p>
        <p style="margin-top:6px;"><strong>Bank:</strong> Alister Bank</p>
      </div>
      <p>Click the secure button below to set up your <strong>username, password, and security PIN</strong>:</p>
      <p style="text-align:center;">
        <a href="${setupLink}" class="btn">Set Up My Account →</a>
      </p>
      <div class="info-box">
        <p>⏱ This setup link expires in <strong>5 minutes</strong>. Please complete setup immediately.</p>
      </div>
    </div>`);
  return sendEmail({ to: email, subject: 'Alister Bank — Your Account is Approved! Set Up Now', html });
};

const sendLoginAlertEmail = async (email, name, loginData) => {
  const html = baseTemplate(`
    <div class="body">
      <div class="badge">🔔 Login Detected</div>
      <h2>New Login to Your Account</h2>
      <p>Dear <span class="highlight">${name}</span>,</p>
      <p>A new login was detected on your Alister Bank account.</p>
      <div style="background:#1a1a2e; border-radius:10px; padding:20px; margin:20px 0;">
        <div class="detail-row"><span class="detail-label">Date & Time</span><span class="detail-value">${loginData.time}</span></div>
        <div class="detail-row"><span class="detail-label">IP Address</span><span class="detail-value">${loginData.ip}</span></div>
        <div class="detail-row"><span class="detail-label">Device</span><span class="detail-value">${loginData.device}</span></div>
        <div class="detail-row"><span class="detail-label">Location</span><span class="detail-value">${loginData.location || 'Unknown'}</span></div>
      </div>
      <p>If this was you, no action is needed. If you don't recognize this login, please change your password immediately.</p>
    </div>`);
  return sendEmail({ to: email, subject: 'Alister Bank — New Login Detected', html });
};

const sendTransferAlertEmail = async (email, name, txData) => {
  const isDebit = txData.type === 'debit';
  const html = baseTemplate(`
    <div class="body">
      <div class="badge">${isDebit ? '💸 Money Sent' : '💰 Money Received'}</div>
      <h2>Transaction ${isDebit ? 'Debit' : 'Credit'} Alert</h2>
      <p>Dear <span class="highlight">${name}</span>,</p>
      <p>A transaction has been ${isDebit ? 'debited from' : 'credited to'} your account.</p>
      <div style="background:#1a1a2e; border-radius:10px; padding:20px; margin:20px 0;">
        <div class="detail-row"><span class="detail-label">Amount</span><span class="detail-value" style="color:${isDebit ? '#ef4444' : '#22c55e'}; font-size:18px;">₹${txData.amount}</span></div>
        <div class="detail-row"><span class="detail-label">Reference</span><span class="detail-value">${txData.reference}</span></div>
        <div class="detail-row"><span class="detail-label">${isDebit ? 'To Account' : 'From'}</span><span class="detail-value">${txData.counterparty}</span></div>
        <div class="detail-row"><span class="detail-label">Mode</span><span class="detail-value">${txData.mode}</span></div>
        <div class="detail-row"><span class="detail-label">Balance</span><span class="detail-value">₹${txData.balance}</span></div>
        <div class="detail-row"><span class="detail-label">Date & Time</span><span class="detail-value">${txData.time}</span></div>
      </div>
    </div>`);
  return sendEmail({ to: email, subject: `Alister Bank — ${isDebit ? 'Debit' : 'Credit'} Alert: ₹${txData.amount}`, html });
};

const sendPasswordResetEmail = async (email, name, resetLink) => {
  const html = baseTemplate(`
    <div class="body">
      <div class="badge">🔑 Password Reset</div>
      <h2>Reset Your Password</h2>
      <p>Dear <span class="highlight">${name}</span>,</p>
      <p>We received a request to reset your Alister Bank password. Click the button below to proceed:</p>
      <p style="text-align:center;">
        <a href="${resetLink}" class="btn">Reset Password →</a>
      </p>
      <div class="info-box">
        <p>⏱ This link expires in <strong>5 minutes</strong>. If you did not request a password reset, please ignore this email.</p>
      </div>
    </div>`);
  return sendEmail({ to: email, subject: 'Alister Bank — Password Reset Request', html });
};

module.exports = {
  sendEmail,
  sendOTPEmail,
  sendKYCUnderReviewEmail,
  sendVideoKYCEmail,
  sendAccountApprovedEmail,
  sendLoginAlertEmail,
  sendTransferAlertEmail,
  sendPasswordResetEmail,
};
