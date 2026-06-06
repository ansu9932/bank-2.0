require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');

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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
app.use('/api/', apiLimiter);

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/account', require('./routes/account'));
app.use('/api/kyc', require('./routes/kyc'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/payments', require('./routes/payment'));
app.use('/api/requests', require('./routes/requests'));
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
const start = async () => {
  try {
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