import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import { BlockPublicAccess, Bucket, BucketEncryption, HttpMethods } from "aws-cdk-lib/aws-s3";
import type { EnvConfig } from "../config";

export interface CapturesProps {
  config: EnvConfig;
}

/**
 * Storage for photographed note pages (spec-note-capture.md P1).
 *
 * **No lifecycle expiry, by decision (P13).** The image is the terminal node of the
 * evidence chain — domain row → `NoteBlock` → `NoteCapture` → S3 — and a three-year
 * degree means a year-1 photo must still back year-3 PAD evidence. Objects are removed
 * only by GDPR erasure, which `scripts/delete-user.ts` performs against the key prefix
 * below. If you are tempted to add an expiry rule here, read P13 first: it breaks the
 * evidence trail the whole feature is built on.
 *
 * **Accepted risk (P2):** photos will sometimes contain patient-identifiable data. A
 * camera cannot self-censor the way a keyboard can. The mitigations are a warning before
 * the camera opens and a recorded `piiAcknowledged` per capture — not a technical
 * control. This bucket therefore holds potentially patient-identifiable clinical imagery,
 * which is why it is private, encrypted, TLS-only, and never fronted by CloudFront.
 *
 * Uploads go **direct from the browser** via a presigned PUT (`notes/presignCapture`),
 * so the bucket needs CORS for the app's own origins and nothing else. There is no
 * public read path and no bucket policy granting anonymous access.
 */
export class Captures extends Construct {
  readonly bucket: Bucket;

  /** Key prefix per user. GDPR erasure deletes this whole prefix. */
  static keyPrefix(sub: string): string {
    return `u/${sub}/`;
  }

  constructor(scope: Construct, id: string, props: CapturesProps) {
    super(scope, id);
    const { config } = props;

    this.bucket = new Bucket(this, "CaptureBucket", {
      bucketName: `nurse-planner-captures-${config.name}-${config.account}`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Presigned PUT from the SPA. GET is allowed so the review screen can show the
      // photo beside the extracted blocks; both are still gated by the presigned URL.
      cors: [
        {
          allowedOrigins: config.allowedOrigins,
          allowedMethods: [HttpMethods.PUT, HttpMethods.GET],
          allowedHeaders: ["content-type"],
          exposedHeaders: ["etag"],
          maxAge: Duration.hours(1).toSeconds(),
        },
      ],
      // Deliberately NO `lifecycleRules` — see the class comment (P13).
      removalPolicy: config.retainData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !config.retainData,
    });
  }
}
