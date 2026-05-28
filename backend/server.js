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

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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

    // Sync models (use migrations in production)
    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    logger.info('✅ Database models synchronized.');

    // Start cron jobs
    runKYCWorkflow();

    app.listen(PORT, () => {
      logger.info(`\n🏦 ══════════════════════════════════════════════`);
      logger.info(`   ALISTER BANK API SERVER RUNNING`);
      logger.info(`   Port: ${PORT} | Env: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`   URL:  http://localhost:${PORT}`);
      logger.info(`══════════════════════════════════════════════\n`);
    });
  } catch (err) {
    logger.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
};

start();

module.exports = app;
