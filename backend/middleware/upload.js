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

const documentTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const imageTypes = ['image/jpeg', 'image/jpg', 'image/png'];
const videoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];

const MAX_DOC_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

const kycUpload = multer({
  storage: createStorage('documents'),
  limits: { fileSize: MAX_DOC_SIZE },
  fileFilter: fileFilter(documentTypes),
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

// KYC multi-document upload fields (covers all supported countries)
const kycFields = [
  // India
  { name: 'aadhaar', maxCount: 1 },
  { name: 'pan', maxCount: 1 },
  { name: 'passport', maxCount: 1 },
  // Nepal / Bhutan / Bangladesh
  { name: 'citizenship', maxCount: 1 },
  { name: 'cid', maxCount: 1 },
  { name: 'nid', maxCount: 1 },
  { name: 'nominee_nid', maxCount: 1 },
  { name: 'tin', maxCount: 1 },
  // Common across all countries
  { name: 'selfie', maxCount: 1 },
  { name: 'signature', maxCount: 1 },
  { name: 'address_proof', maxCount: 1 },
];

module.exports = { kycUpload, selfieUpload, videoUpload, profileUpload, kycFields };
