import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";

export const s3 = new S3Client({
  region: process.env.AWS_REGION || "ap-southeast-3",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});
export const S3_BUCKET = process.env.S3_BUCKET || "vaa-web-storage-jakarta-768669378515-ap-southeast-3-an";

export async function listExcelObjects(): Promise<{ name: string }[]> {
  const command = new ListObjectsV2Command({
    Bucket: S3_BUCKET,
    Prefix: "uploads/",
  });

  const response = await s3.send(command);
  const objects: { name: string }[] = [];

  for (const obj of response.Contents || []) {
    if (obj.Key?.toLowerCase().endsWith(".xlsx")) {
      objects.push({ name: obj.Key });
    }
  }

  return objects;
}

export async function getObjectBuffer(objectKey: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: objectKey,
  });
  const response = await s3.send(command);
  const stream = response.Body as Readable;
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

export async function putObject(
  objectKey: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: objectKey,
    Body: buffer,
    ContentType: contentType,
  });

  await s3.send(command);
}