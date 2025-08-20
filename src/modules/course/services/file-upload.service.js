import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../../configs/app.config.js';
import logger from '../../../utils/logger.js';

const s3 = new S3Client({
  region: config.AWS_REGION,
  credentials: {
    accessKeyId: config.AWS_ACCESS_KEY_ID,
    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
  },
});

export const getUploadFileUrlService = async (fileName, fileType, category) => {
  try {
    const uniqueId = uuidv4();
    const folderMap = {
      image: 'images',
      pdf: 'pdfs',
      video: 'videos',
    };

    const s3Key = `${folderMap[category]}/${uniqueId}/${fileName}`;
    const bucket = config.S3_BUCKET_NAME;
    const cloudfrontDomain = config.CLOUDFRONT_DOMAIN;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      ContentType: fileType,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 mins
    const fileUrl = `https://${cloudfrontDomain}/${s3Key}`;

    return { uploadUrl, fileUrl };
  } catch (error) {
    logger.error('Failed to generate S3 upload URL:', error);
    throw error;
  }
};
