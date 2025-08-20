import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../../configs/app.config.js';
import logger from '../../../utils/logger.js';

// S3 Client with checksum disabled
const s3 = new S3Client({
  region: config.AWS_REGION,
  credentials: {
    accessKeyId: config.AWS_ACCESS_KEY_ID,
    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
  },
  // Disable automatic checksums
  requestChecksumCalculation: false,
  responseChecksumValidation: false,
});

// File type configuration
const FILE_CONFIG = {
  image: {
    folder: 'images',
    types: new Set([
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/tiff',
      'image/svg+xml',
    ]),
    expiry: 300,
    maxSizeMB: 50,
  },
  document: {
    folder: 'documents',
    types: new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
    ]),
    expiry: 600,
    maxSizeMB: 100,
  },
  video: {
    folder: 'videos',
    types: new Set([
      'video/mp4',
      'video/avi',
      'video/mov',
      'video/wmv',
      'video/webm',
      'video/mkv',
      'video/quicktime',
    ]),
    expiry: 900,
    maxSizeMB: 500,
  },
  audio: {
    folder: 'audio',
    types: new Set([
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'audio/mp3',
      'audio/mp4',
    ]),
    expiry: 600,
    maxSizeMB: 100,
  },
};

const getFileConfig = (fileType) => {
  const normalizedType = fileType.toLowerCase().trim();

  for (const [category, config] of Object.entries(FILE_CONFIG)) {
    if (config.types.has(normalizedType)) {
      return { ...config, category };
    }
  }

  const supportedTypes = Object.values(FILE_CONFIG)
    .flatMap((config) => Array.from(config.types))
    .sort()
    .join(', ');

  throw new Error(
    `Unsupported file type: ${fileType}. Supported: ${supportedTypes}`
  );
};

const validateInput = (fileName, fileType) => {
  if (!fileName || typeof fileName !== 'string' || !fileName.trim()) {
    throw new Error('fileName is required and must be a non-empty string');
  }

  if (!fileType || typeof fileType !== 'string' || !fileType.trim()) {
    throw new Error('fileType is required and must be a non-empty string');
  }

  if (!fileType.includes('/')) {
    throw new Error('fileType must be a valid MIME type (e.g., image/jpeg)');
  }

  const sanitizedName = fileName
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.+$/, '')
    .replace(/\s+/g, '_')
    .substring(0, 255);

  if (!sanitizedName) {
    throw new Error('fileName contains only invalid characters');
  }

  return sanitizedName;
};

const generateS3Key = (folder, fileName) => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const uniqueId = uuidv4();

  return `${folder}/${year}/${month}/${day}/${uniqueId}/${fileName}`;
};

export const getUploadUrlService = async (fileName, fileType) => {
  const startTime = Date.now();
  let s3Key = '';

  try {
    const sanitizedFileName = validateInput(fileName, fileType);
    const fileConfig = getFileConfig(fileType);
    s3Key = generateS3Key(fileConfig.folder, sanitizedFileName);

    // Create command with explicit checksum disabling
    const command = new PutObjectCommand({
      Bucket: config.S3_BUCKET_NAME,
      Key: s3Key,
      ContentType: fileType,
      // Explicitly disable checksums
      ChecksumAlgorithm: undefined,
    });

    // Remove any middleware that might add checksums
    command.middlewareStack.remove('checksumMiddleware');

    // Generate presigned URL with additional options to prevent extra params
    const uploadUrl = await getSignedUrl(s3, command, {
      expiresIn: fileConfig.expiry,
      // Disable signing of extra headers
      unhoistableHeaders: new Set(),
      signableHeaders: new Set(['host']),
    });

    const fileUrl = config.CLOUDFRONT_DOMAIN
      ? `https://${config.CLOUDFRONT_DOMAIN}/${s3Key}`
      : `https://${config.S3_BUCKET_NAME}.s3.${config.AWS_REGION}.amazonaws.com/${s3Key}`;

    const duration = Date.now() - startTime;

    logger.info('Upload URL generated successfully', {
      fileName: sanitizedFileName,
      fileType,
      category: fileConfig.category,
      s3Key,
      duration: `${duration}ms`,
    });

    return {
      success: true,
      uploadUrl,
      fileUrl,
      metadata: {
        s3Key,
        category: fileConfig.category,
        expiresIn: fileConfig.expiry,
        expiresAt: new Date(
          Date.now() + fileConfig.expiry * 1000
        ).toISOString(),
        maxSizeMB: fileConfig.maxSizeMB,
        sanitizedFileName,
        originalFileName: fileName,
        uploadInstructions: {
          method: 'PUT',
          headers: {
            'Content-Type': fileType,
          },
          note: 'Send file as binary body. Do not add any additional headers.',
        },
      },
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('Upload URL generation failed', {
      fileName,
      fileType,
      s3Key,
      duration: `${duration}ms`,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });

    const enhancedError = new Error(error.message);
    enhancedError.statusCode = 400;
    enhancedError.context = { fileName, fileType };

    throw enhancedError;
  }
};
