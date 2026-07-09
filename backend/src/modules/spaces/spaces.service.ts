import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { extname } from 'path';
import { generateThumbnail } from './thumbnail.util';

export interface UploadedFileResult {
  fileName: string;
  filePath: string;
  thumbnailPath: string | null;
}

@Injectable()
export class SpacesService {
  private readonly logger = new Logger(SpacesService.name);

  readonly client: S3Client;
  readonly bucket: string;
  readonly cdnUrl: string;
  private readonly endpoint: string;

  constructor(private readonly config: ConfigService) {
    this.bucket   = config.get<string>('DO_SPACES_BUCKET',   'customjewelry');
    this.cdnUrl   = config.get<string>('DO_SPACES_CDN_URL',  '').replace(/\/$/, '');
    this.endpoint = config.get<string>('DO_SPACES_ENDPOINT', 'https://nyc3.digitaloceanspaces.com');

    this.client = new S3Client({
      endpoint: this.endpoint,
      region:   config.get<string>('DO_SPACES_REGION', 'nyc3'),
      credentials: {
        accessKeyId:     config.get<string>('DO_SPACES_KEY',    ''),
        secretAccessKey: config.get<string>('DO_SPACES_SECRET', ''),
      },
    });
  }

  // Uploads the original, and — for raster images only — a resized JPEG
  // derivative alongside it, so list/card views never have to load the
  // full-resolution original just to paint a thumbnail.
  async uploadWithThumbnail(buffer: Buffer, folder: string, originalName: string, contentType?: string): Promise<UploadedFileResult> {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    const key = `${folder}/${unique}${extname(originalName)}`;
    const filePath = await this.uploadBuffer(buffer, key, contentType);

    let thumbnailPath: string | null = null;
    const thumbBuffer = await generateThumbnail(buffer, contentType);
    if (thumbBuffer) {
      const thumbKey = `${folder}/${unique}-thumb.jpg`;
      thumbnailPath = await this.uploadBuffer(thumbBuffer, thumbKey, 'image/jpeg');
    }

    return { fileName: key, filePath, thumbnailPath };
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
    if (this.cdnUrl) {
      // Tolerate DO_SPACES_CDN_URL being set without a scheme (e.g. just
      // "nyc3.digitaloceanspaces.com/bucket") — without this the resulting
      // URL is scheme-relative and browsers resolve it against the current
      // page instead of Spaces.
      const cdn = /^https?:\/\//i.test(this.cdnUrl) ? this.cdnUrl : `https://${this.cdnUrl}`;
      return `${cdn}/${key}`;
    }
    const host = this.endpoint.replace(/^https?:\/\//, '');
    return `https://${this.bucket}.${host}/${key}`;
  }
}
