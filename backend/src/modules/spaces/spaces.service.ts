import { Injectable, Logger } from '@nestjs/common';
import { S3Client, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import * as multerS3 from 'multer-s3';
import { extname } from 'path';

@Injectable()
export class SpacesService {
  private readonly logger = new Logger(SpacesService.name);

  readonly client: S3Client;
  readonly bucket: string;
  readonly cdnUrl: string;

  constructor() {
    this.bucket  = process.env.DO_SPACES_BUCKET  || 'customjewelry';
    this.cdnUrl  = (process.env.DO_SPACES_CDN_URL || '').replace(/\/$/, '');

    this.client = new S3Client({
      endpoint: process.env.DO_SPACES_ENDPOINT || 'https://nyc3.digitaloceanspaces.com',
      region:   process.env.DO_SPACES_REGION    || 'nyc3',
      credentials: {
        accessKeyId:     process.env.DO_SPACES_KEY    || '',
        secretAccessKey: process.env.DO_SPACES_SECRET || '',
      },
    });
  }

  getMulterStorage(folder: string) {
    return multerS3({
      s3:          this.client,
      bucket:      this.bucket,
      acl:         'public-read',
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key: (_req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
        cb(null, `${folder}/${unique}${extname(file.originalname)}`);
      },
    });
  }

  async uploadBuffer(buffer: Buffer, key: string, contentType = 'application/octet-stream'): Promise<string> {
    await this.client.send(new PutObjectCommand({
      Bucket:      this.bucket,
      Key:         key,
      Body:        buffer,
      ACL:         'public-read',
      ContentType: contentType,
    }));
    return this.getPublicUrl(key);
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      this.logger.warn(`Failed to delete Spaces file ${key}: ${err.message}`);
    }
  }

  getPublicUrl(key: string): string {
    if (this.cdnUrl) return `${this.cdnUrl}/${key}`;
    const endpoint = (process.env.DO_SPACES_ENDPOINT || 'https://nyc3.digitaloceanspaces.com').replace('https://', '');
    return `https://${this.bucket}.${endpoint}/${key}`;
  }
}
