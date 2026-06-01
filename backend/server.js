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
app.use(express.json({ limit: '10mb' }));
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
app.use('/api/transactions', require('./routes/transactions'));
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

    // ─── SAFE SYNC FALLBACK MECHANISM ───
    try {
      // First attempt: Try to alter tables to match exact models
      await sequelize.sync({ alter: true });
      logger.info('✅ Database models synchronized (alter: true).');
      console.log('✅ Database models synchronized (alter: true).');
    } catch (syncErr) {
      // Log the exact MySQL reason it failed
      logger.error(`❌ CRITICAL SYNC ERROR: ${syncErr.message}`);
      console.error(`❌ CRITICAL SYNC ERROR: ${syncErr.message}`);
      if (syncErr.original) {
        logger.error(`Raw MySQL Error: ${syncErr.original.message}`);
        console.error(`Raw MySQL Error: ${syncErr.original.message}`);
      }
      
      console.log('⚠️ Falling back to standard sync to prevent crash...');
      
      // Fallback attempt: Standard sync (Creates missing tables, leaves existing alone)
      await sequelize.sync();
      logger.info('✅ Database models synchronized using safe fallback.');
      console.log('✅ Database models synchronized using safe fallback.');
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