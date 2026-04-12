import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  GetBucketLocationCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let _s3Client: S3Client | null = null;
let _resolvedRegion: string | null = null;

function getBaseCredentials() {
  return {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  };
}

function getBucket(): string {
  return process.env.S3_BUCKET_NAME!;
}

async function resolveRegion(): Promise<string> {
  if (_resolvedRegion) return _resolvedRegion;

  // Detect bucket region by making a HeadBucket-style call from us-east-1
  // GetBucketLocation always works from us-east-1 regardless of where the bucket is
  const probe = new S3Client({
    region: "us-east-1",
    credentials: getBaseCredentials(),
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  try {
    const resp = await probe.send(new GetBucketLocationCommand({ Bucket: getBucket() }));
    // S3 returns empty string or null for us-east-1 buckets
    _resolvedRegion = resp.LocationConstraint || "us-east-1";
  } catch {
    // Fallback to env var
    _resolvedRegion = process.env.S3_REGION || process.env.AWS_REGION || "us-east-1";
  } finally {
    probe.destroy();
  }

  return _resolvedRegion;
}

async function getS3Client(): Promise<S3Client> {
  if (_s3Client) return _s3Client;

  const region = await resolveRegion();
  _s3Client = new S3Client({
    region,
    credentials: getBaseCredentials(),
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return _s3Client;
}

export async function uploadObject(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void> {
  const client = await getS3Client();
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await client.send(command);
}

export async function getDownloadUrl(key: string): Promise<string> {
  const client = await getS3Client();
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn: 3600 });
}

export async function deleteObject(key: string): Promise<void> {
  const client = await getS3Client();
  const command = new DeleteObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });

  await client.send(command);
}
