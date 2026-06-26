require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const sequelize = require('./config/database');
const logger = require('./utils/logger');
const { securityHeaders, sanitizeRequest, securityResponseHeaders, apiLimiter, hpp } = require('./middleware/security');
const { runKYCWorkflow } = require('./jobs/kycWorkflow');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Trust proxy (for Nginx) ──────────────────────────────────────────────────
app.set('trust proxy', 1);

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(securityHeaders);
app.use(securityResponseHeaders);
app.use(hpp());

// ─── CORS (Updated Fallback to Hostinger Frontend) ────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://powderblue-yak-779749.hostingersite.com',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Registration-Token'],
}));

// ─── Body Parsing ─────────────────────────────────────────────────────────────
// `verify` captures the EXACT raw bytes of every JSON request into req.rawBody.
// This is required to cryptographically validate the Razorpay webhook signature,
// which must be computed over the unmodified request body.
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ─── Compression & Logging ────────────────────────────────────────────────────
app.use(compression());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
    stream: { write: (msg) => logger.info(msg.trim()) },
  }));
}

// ─── Sanitize Input ───────────────────────────────────────────────────────────
app.use(sanitizeRequest);

// ─── Static Files (uploaded docs) ────────────────────────────────────────────
// Absolute path to the uploads root. ensureUploadDirs() (run at boot, below)
// guarantees this tree + its KYC sub-folders exist so fetches never 404.
const UPLOADS_ROOT = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(UPLOADS_ROOT));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
app.use('/api/', apiLimiter);

// ─── Block stray .php calls (this is a Node.js backend — no PHP exists) ───────
// DevTools sometimes shows 404s for paths like `bank-transfer.php`. These do
// NOT originate from this app (there are zero .php files in the codebase) —
// they come from third-party scripts (e.g. Razorpay Checkout internals) or a
// browser extension. This guard simply returns a clean JSON 404 instead of the
// generic HTML fall-through, and keeps such noise out of the real route table.
app.use((req, res, next) => {
  if (req.path.toLowerCase().endsWith('.php')) {
    return res.status(404).json({ success: false, message: 'Not found.' });
  }
  next();
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/account', require('./routes/account'));
app.use('/api/kyc', require('./routes/kyc'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/payments', require('./routes/payment'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/payouts', require('./routes/payouts'));
app.use('/api/admin', require('./routes/admin'));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    app: 'Alister Bank API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found.` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}\n${err.stack}`);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'File size exceeds the allowed limit.' });
  }
  if (err.name === 'MulterError') {
    return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
  }
  if (err.name === 'SequelizeUniqueConstraintError') {
    const field = err.errors[0]?.path || 'field';
    return res.status(400).json({ success: false, message: `${field} already exists.` });
  }
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({ success: false, message: err.errors[0]?.message || 'Validation error.' });
  }

  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error.' : err.message,
  });
});

// ─── Database & Server Start ──────────────────────────────────────────────────
/**
 * Ensure the uploads directory tree exists on disk at boot.
 *
 * Multer creates a sub-folder lazily on first upload, but the express.static
 * mount + any direct fetch can 404 if the tree was never created (e.g. a fresh
 * Hostinger container, or after a deploy that doesn't ship empty dirs). We
 * recursively create the uploads root + every known KYC/media sub-folder so
 * assets are always servable immediately, with no manual intervention.
 */
function ensureUploadDirs() {
  const subDirs = ['documents', 'selfies', 'kyc-videos', 'profiles'];
  const targets = [UPLOADS_ROOT, ...subDirs.map((d) => path.join(UPLOADS_ROOT, d))];
  targets.forEach((dir) => {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`📁 Created missing upload directory: ${dir}`);
      }
    } catch (e) {
      logger.error(`Failed to create upload directory ${dir}: ${e.message}`);
    }
  });
}

/**
 * Idempotently add the premium debit-card columns to an EXISTING card_requests
 * table. Plain sequelize.sync() won't add columns to a table that already
 * exists, and full alter-sync risks the MySQL 64-index overflow — so we add
 * only the named columns, only when absent, with zero index changes.
 */
async function ensureCardRequestColumns() {
  const qi = sequelize.getQueryInterface();
  const { DataTypes } = require('sequelize');

  // If the table doesn't exist yet, sync() already created it WITH these
  // columns (fresh deploy) — nothing to backfill.
  let table;
  try {
    table = await qi.describeTable('card_requests');
  } catch {
    return; // table absent; plain sync will create it complete.
  }

  const columns = {
    card_network: { type: DataTypes.STRING(20), allowNull: true },
    card_tier: { type: DataTypes.STRING(20), allowNull: true },
    card_number: { type: DataTypes.STRING(16), allowNull: true },
    cvv: { type: DataTypes.STRING(4), allowNull: true },
    expiry_date: { type: DataTypes.STRING(5), allowNull: true },
    controls: { type: DataTypes.JSON, allowNull: true },
    issuance_fee: { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: 0.00 },
    fee_status: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'none' },
    fee_reference: { type: DataTypes.STRING(30), allowNull: true },
  };

  for (const [name, def] of Object.entries(columns)) {
    if (!table[name]) {
      try {
        await qi.addColumn('card_requests', name, def);
        logger.info(`card_requests: added column '${name}'.`);
      } catch (e) {
        logger.error(`card_requests: could not add column '${name}': ${e.message}`);
      }
    }
  }

  // The status ENUM gained 'active'. On MySQL the column may be a constrained
  // ENUM; widen it to a plain STRING so 'active' is accepted without an ENUM
  // migration. Best-effort and non-fatal.
  try {
    await qi.changeColumn('card_requests', 'status', { type: DataTypes.STRING(20), allowNull: true });
  } catch (e) {
    logger.warn(`card_requests: status column widen skipped: ${e.message}`);
  }
}

/**
 * Idempotently add the activation-deposit columns to an EXISTING accounts
 * table. Mirrors ensureCardRequestColumns(): only adds the named columns when
 * absent, with no index changes, so it cannot trigger the 64-index overflow.
 */
async function ensureAccountColumns() {
  const qi = sequelize.getQueryInterface();
  const { DataTypes } = require('sequelize');

  let table;
  try {
    table = await qi.describeTable('accounts');
  } catch {
    return; // table absent; plain sync will create it complete.
  }

  const columns = {
    activation_deposit_done: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false },
    activation_deposit_at: { type: DataTypes.DATE, allowNull: true },
    // Per-user transfer-method locks (IMPS/NEFT/UPI default-off, internal on).
    // Added with NO DB-level default (avoids MySQL JSON-default constraints on
    // older versions); application code normalizes NULL → the secure default.
    transfer_methods: { type: DataTypes.JSON, allowNull: true },
  };

  for (const [name, def] of Object.entries(columns)) {
    if (!table[name]) {
      try {
        await qi.addColumn('accounts', name, def);
        logger.info(`accounts: added column '${name}'.`);
      } catch (e) {
        logger.error(`accounts: could not add column '${name}': ${e.message}`);
      }
    }
  }
}

const start = async () => {
  try {
    // Guarantee the uploads tree exists before anything serves/writes to it.
    ensureUploadDirs();

    await sequelize.authenticate();
    logger.info('✅ Database connected successfully.');
    console.log('✅ Database connected successfully.');

    // ─── Schema sync (durable + safe-fallback) ─────────────────────────────────
    // IMPORTANT: alter:true must NOT run on every boot. On MySQL, alter cannot
    // reliably detect existing unique indexes, so it re-adds a new copy
    // (email_2, email_3, …) on each restart until the table exceeds MySQL's hard
    // limit of 64 indexes and sync() crashes with "Too many keys specified".
    //
    // Normal boots use plain sync() — it still auto-creates any MISSING tables
    // (what Hostinger needs) but never re-adds indexes to existing tables.
    //
    // To intentionally realign the schema (e.g. after a model change), do a
    // SINGLE deploy with DB_SYNC_ALTER=true, then remove the flag again. Even in
    // that mode we keep a safe fallback so a failed alter degrades gracefully to
    // a plain sync() instead of crashing the whole server.
    const useAlter = process.env.DB_SYNC_ALTER === 'true';
    if (useAlter) {
      try {
        await sequelize.sync({ alter: false });
        logger.info('✅ Database models synchronized (alter mode).');
        console.log('✅ Database models synchronized (alter mode).');
      } catch (syncErr) {
        // Surface the exact MySQL reason to the Hostinger live dashboard.
        logger.error(`❌ CRITICAL SYNC ERROR: ${syncErr.message}`);
        console.error(`❌ CRITICAL SYNC ERROR: ${syncErr.message}`);
        if (syncErr.original) {
          logger.error(`Raw MySQL Error: ${syncErr.original.message}`);
          console.error(`Raw MySQL Error: ${syncErr.original.message}`);
        }
        console.log('⚠️ Falling back to standard sync to prevent crash...');
        // Plain sync: creates missing tables, leaves existing tables untouched.
        await sequelize.sync();
        logger.info('✅ Database models synchronized using safe fallback.');
        console.log('✅ Database models synchronized using safe fallback.');
      }
    } else {
      // Guardrail: schema sync is explicitly LOCKED to alter:false so existing
      // table schemas are fully protected. Plain sync still auto-creates any
      // MISSING tables, but never alters/re-indexes existing ones.
      await sequelize.sync({ alter: false });
      logger.info('✅ Database models synchronized.');
      console.log('✅ Database models synchronized.');
    }

    // ─── Targeted, idempotent column backfill for card_requests ───────────────
    // Plain sync() never adds columns to an EXISTING table, so the new premium
    // debit-card fields must be added explicitly. This is surgical (only the
    // named columns, only if absent) and adds NO indexes — so it cannot trigger
    // the 64-index overflow that full alter sync does. Safe to run every boot.
    try {
      await ensureCardRequestColumns();
    } catch (colErr) {
      logger.error(`card_requests column backfill failed (non-fatal): ${colErr.message}`);
      console.error(`card_requests column backfill failed (non-fatal): ${colErr.message}`);
    }

    // Activation-deposit columns on accounts (sandbox onboarding simulation).
    try {
      await ensureAccountColumns();
    } catch (colErr) {
      logger.error(`accounts column backfill failed (non-fatal): ${colErr.message}`);
      console.error(`accounts column backfill failed (non-fatal): ${colErr.message}`);
    }

    // Start cron jobs (KYC automated workflow, cleanup, daily limit reset).
    // Wrapped so any background crash is piped explicitly to stdout for the
    // Hostinger live tracking dashboard.
    try {
      runKYCWorkflow();
      logger.info('✅ Background workflows (runKYCWorkflow) started.');
      console.log('✅ Background workflows (runKYCWorkflow) started.');
    } catch (workflowErr) {
      logger.error(`Background workflow failed to start: ${workflowErr.message}`);
      console.error(workflowErr);
    }

    // Re-arm settlement timers for any NEFT payouts left 'processing' by a
    // restart, so they still transition to completed after their delay window.
    try {
      const { resumePendingNeftSettlements } = require('./controllers/payoutController');
      await resumePendingNeftSettlements();
    } catch (neftErr) {
      logger.error(`Failed to resume NEFT settlements: ${neftErr.message}`);
    }

    app.listen(PORT, () => {
      logger.info(`\n🏦 ══════════════════════════════════════════════`);
      logger.info(`   ALISTER BANK API SERVER RUNNING`);
      logger.info(`   Port: ${PORT} | Env: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`   Live: https://aqua-salamander-597310.hostingersite.com`);
      logger.info(`   URL:  http://localhost:${PORT}`);
      logger.info(`══════════════════════════════════════════════\n`);

      console.log('\n🏦 ══════════════════════════════════════════════');
      console.log('   ALISTER BANK API SERVER RUNNING');
      console.log(`   Port: ${PORT} | Env: ${process.env.NODE_ENV || 'development'}`);
      console.log('   Live: https://aqua-salamander-597310.hostingersite.com');
      console.log(`   URL:  http://localhost:${PORT}`);
      console.log('══════════════════════════════════════════════\n');
    });
  } catch (err) {
    logger.error(`Failed to start server: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
};

start();

module.exports = app;