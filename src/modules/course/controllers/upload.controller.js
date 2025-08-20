import { HTTPSTATUS } from '../../../configs/http.config.js';
import AsyncHandler from '../../../middlewares/asyncHandler.js';
import { BadRequestException } from '../../../utils/appError.js';
import { getUploadFileUrlService } from '../services/file-upload.service.js';

/**
 * @desc    Get presigned S3 upload URL (supports image, PDF, video)
 * @route   POST /uploads/get-upload-url
 */
export const getUploadFileUrl = AsyncHandler(async (req, res) => {
  const { fileName, fileType, fileSize } = req.body;

  if (!fileName || !fileType || !fileSize) {
    throw new BadRequestException('File name, type, and size are required');
  }

  // Rules for allowed file types and max sizes
  const FILE_RULES = {
    image: {
      extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
      mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      maxSize: 5 * 1024 * 1024, // 5MB
    },
    pdf: {
      extensions: ['.pdf'],
      mimeTypes: ['application/pdf'],
      maxSize: 10 * 1024 * 1024, // 10MB
    },
    video: {
      extensions: ['.mp4', '.mov', '.avi', '.mkv', '.webm'],
      mimeTypes: [
        'video/mp4',
        'video/quicktime',
        'video/x-msvideo',
        'video/x-matroska',
        'video/webm',
      ],
      maxSize: 100 * 1024 * 1024, // 100MB
    },
  };

  // Detect category from MIME type
  let category = null;
  for (const [key, rules] of Object.entries(FILE_RULES)) {
    if (rules.mimeTypes.includes(fileType)) {
      category = key;
      break;
    }
  }

  if (!category) {
    throw new BadRequestException('Unsupported file type');
  }

  const rules = FILE_RULES[category];
  const fileExtension = fileName
    .substring(fileName.lastIndexOf('.'))
    .toLowerCase();

  // Validate extension
  if (!rules.extensions.includes(fileExtension)) {
    throw new BadRequestException(
      `Invalid file extension for ${category}. Allowed: ${rules.extensions.join(
        ', '
      )}`
    );
  }

  // Validate file size
  if (fileSize > rules.maxSize) {
    throw new BadRequestException(
      `File too large for ${category}. Max allowed size is ${
        rules.maxSize / (1024 * 1024)
      }MB`
    );
  }

  // Sanitize file name
  const baseName = fileName
    .substring(0, fileName.lastIndexOf('.'))
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^a-z0-9._-]/g, ''); // Remove special chars

  const safeFileName = `${baseName}${fileExtension}`;

  // Proceed with sanitized name
  const { uploadUrl, fileUrl } = await getUploadFileUrlService(
    safeFileName,
    fileType,
    category
  );

  return res.status(HTTPSTATUS.CREATED).json({
    success: true,
    message: 'Upload URL generated successfully',
    data: { uploadUrl, fileUrl },
  });
});
