const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const createStorage = (subDir) => multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads', subDir);
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (allowedTypes) => (req, file, cb) => {
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`), false);
  }
};

// ── KYC document filter: accept ANY file type EXCEPT ZIP / archive files ──────
// Customers upload from many devices (iPhone HEIC, scans, Word docs, etc.), so
// we no longer whitelist a narrow set of MIME types (which was rejecting valid
// uploads and surfacing as "Submission failed"). We only BLOCK ZIP/archive
// files — both by extension and by reported MIME type — so they are never
// written to disk or recorded in the database.
const BLOCKED_DOC_EXTENSIONS = ['.zip', '.zipx'];
const BLOCKED_DOC_MIMETYPES = [
  'application/zip',
  'application/x-zip',
  'application/x-zip-compressed',
  'application/zip-compressed',
  'multipart/x-zip',
];
const blockZipFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();
  if (BLOCKED_DOC_EXTENSIONS.includes(ext) || BLOCKED_DOC_MIMETYPES.includes(mime)) {
    const err = new Error('ZIP and archive files are not allowed. Please upload an image, PDF, or document.');
    err.code = 'INVALID_FILE_TYPE';
    return cb(err, false);
  }
  cb(null, true);
};

const documentTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const imageTypes = ['image/jpeg', 'image/jpg', 'image/png'];
const videoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];

const MAX_DOC_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

const kycUpload = multer({
  storage: createStorage('documents'),
  limits: { fileSize: MAX_DOC_SIZE },
  // Accept any document type up to 20MB, except ZIP/archive files.
  fileFilter: blockZipFilter,
});

const selfieUpload = multer({
  storage: createStorage('selfies'),
  limits: { fileSize: MAX_DOC_SIZE },
  fileFilter: fileFilter(imageTypes),
});

const videoUpload = multer({
  storage: createStorage('kyc-videos'),
  limits: { fileSize: MAX_VIDEO_SIZE },
  fileFilter: fileFilter(videoTypes),
});

const profileUpload = multer({
  storage: createStorage('profiles'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilter(imageTypes),
});

// KYC multi-document upload fields
const kycFields = [
  { name: 'aadhaar', maxCount: 1 },
  { name: 'pan', maxCount: 1 },
  { name: 'passport', maxCount: 1 },
  { name: 'selfie', maxCount: 1 },
  { name: 'signature', maxCount: 1 },
  { name: 'address_proof', maxCount: 1 },
];

module.exports = { kycUpload, selfieUpload, videoUpload, profileUpload, kycFields };
