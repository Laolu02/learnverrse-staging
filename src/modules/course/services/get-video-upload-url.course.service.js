import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../../configs/app.config.js';
import logger from '../../../utils/logger.js';

// AWS S3 Configuration with optimizations
const s3 = new S3Client({
  region: config.AWS_REGION,
  credentials: {
    accessKeyId: config.AWS_ACCESS_KEY_ID,
    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
  },
  maxAttempts: 3,
  retryMode: 'adaptive',
});

// Efficient file type configuration with size limits
const FILE_CONFIG = {
  image: {
    folder: 'images',
    maxSize: 50 * 1024 * 1024, // 50MB
    types: new Set([
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/tiff',
    ]),
    expiry: 300, // 5 mins
  },
  document: {
    folder: 'documents',
    maxSize: 100 * 1024 * 1024, // 100MB
    types: new Set(['application/pdf']),
    expiry: 600, // 10 mins
  },
  video: {
    folder: 'videos',
    maxSize: 300 * 1024 * 1024, // 300MB
    types: new Set([
      'video/mp4',
      'video/avi',
      'video/mov',
      'video/wmv',
      'video/webm',
      'video/mkv',
      'video/quicktime',
    ]),
    expiry: 900, // 15 mins for large uploads
  },
};

// Fast file type detection and validation
const getFileConfig = (fileType, fileSize) => {
  // Find matching config
  for (const [category, config] of Object.entries(FILE_CONFIG)) {
    if (config.types.has(fileType)) {
      // Validate size
      if (fileSize > config.maxSize) {
        const maxMB = Math.round(config.maxSize / (1024 * 1024));
        throw new Error(
          `${category} files cannot exceed ${maxMB}MB. Current size: ${Math.round(
            fileSize / (1024 * 1024)
          )}MB`
        );
      }
      return config;
    }
  }

  // Unsupported type
  const supportedTypes = Object.values(FILE_CONFIG)
    .flatMap((config) => Array.from(config.types))
    .join(', ');
  throw new Error(
    `Unsupported file type: ${fileType}. Supported: ${supportedTypes}`
  );
};

// Input validation with detailed error messages
const validateInput = (fileName, fileType, fileSize) => {
  if (!fileName?.trim()) {
    throw new Error('fileName is required and cannot be empty');
  }

  if (!fileType?.trim()) {
    throw new Error('fileType is required and cannot be empty');
  }

  if (!fileSize || typeof fileSize !== 'number' || fileSize <= 0) {
    throw new Error('fileSize must be a positive number in bytes');
  }

  // Sanitize filename
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  if (sanitizedName !== fileName) {
    logger.warn(`Filename sanitized: ${fileName} -> ${sanitizedName}`);
  }

  return sanitizedName;
};

// Generate optimized S3 key with date partitioning for better performance
const generateS3Key = (folder, fileName) => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const uniqueId = uuidv4();

  // Date partitioning: folder/year/month/uuid/filename
  return `${folder}/${year}/${month}/${uniqueId}/${fileName}`;
};

export const getUploadUrlService = async (fileName, fileType, fileSize) => {
  const startTime = Date.now();

  try {
    // Input validation
    const sanitizedFileName = validateInput(fileName, fileType, fileSize);

    // Get file configuration and validate
    const fileConfig = getFileConfig(fileType, fileSize);

    // Generate optimized S3 key
    const s3Key = generateS3Key(fileConfig.folder, sanitizedFileName);

    // Prepare S3 command with metadata
    const command = new PutObjectCommand({
      Bucket: config.S3_BUCKET_NAME,
      Key: s3Key,
      ContentType: fileType,
      ContentLength: fileSize,
      Metadata: {
        'original-name': fileName,
        'upload-timestamp': Date.now().toString(),
        'file-category': fileConfig.folder,
      },
      // Performance optimizations
      StorageClass: 'STANDARD',
      ServerSideEncryption: 'AES256',
    });

    // Generate presigned URL with appropriate expiry
    const uploadUrl = await getSignedUrl(s3, command, {
      expiresIn: fileConfig.expiry,
    });

    // Construct CloudFront URL
    const fileUrl = `https://${config.CLOUDFRONT_DOMAIN}/${s3Key}`;

    // Performance logging
    const duration = Date.now() - startTime;
    logger.info('Upload URL generated', {
      fileName: sanitizedFileName,
      fileType,
      fileSize,
      category: fileConfig.folder,
      duration: `${duration}ms`,
      s3Key,
    });

    return {
      uploadUrl,
      fileUrl,
      metadata: {
        category: fileConfig.folder,
        expiresIn: fileConfig.expiry,
        maxSize: fileConfig.maxSize,
        s3Key,
      },
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    // Enhanced error logging
    logger.error('Failed to generate upload URL', {
      fileName,
      fileType,
      fileSize,
      duration: `${duration}ms`,
      error: error.message,
      stack: error.stack,
    });

    // Throw with context
    error.context = { fileName, fileType, fileSize };
    throw error;
  }
};
