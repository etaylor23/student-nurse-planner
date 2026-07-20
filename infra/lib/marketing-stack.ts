import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3";
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  Function as CfFunction,
  FunctionCode,
  FunctionEventType,
  HeadersFrameOption,
  HeadersReferrerPolicy,
  ResponseHeadersPolicy,
  SecurityPolicyProtocol,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import { ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";

export interface MarketingStackProps extends StackProps {
  /** Apex served as the single indexed marketing entity, e.g. `placemate.uk`. */
  apexDomain: string;
  /** `www` host, 301'd to the apex by the viewer-request function. */
  wwwDomain: string;
  /** Route 53 public hosted zone for the apex (already delegated). */
  hostedZoneId: string;
  hostedZoneName: string;
  /**
   * us-east-1 ACM cert ARN covering the apex + `*.placemate.uk` (reused from the app —
   * CloudFront viewer certs must live in us-east-1). A plain ARN import: no new cert and
   * no cross-region references needed. See HANDOVER-corporate-website.md §1.
   */
  certificateArn: string;
}

/**
 * The PlaceMate marketing site (spec/spec-corporate-website.md): a static Astro build on a
 * NEW, isolated S3 + CloudFront stack for the `placemate.uk` apex. Deliberately SEPARATE
 * from `NursePlanner-dev` so marketing deploys never touch the live app/data stack.
 *
 *   - S3 (private, OAC) origin; the build is published by the deploy-marketing workflow.
 *   - CloudFront: apex + www aliases, reused us-east-1 cert, security headers + a
 *     marketing CSP (allows the Plausible analytics vendor), and a viewer-request function
 *     that (a) 301s www → apex and (b) maps Astro `directory`-format paths to /index.html.
 *   - Route 53 A aliases for apex AND www → this distribution (IPv6/AAAA deliberately
 *     not published — see the AliasA loop below for why).
 */
export class MarketingStack extends Stack {
  constructor(scope: Construct, id: string, props: MarketingStackProps) {
    super(scope, id, props);
    const { apexDomain, wwwDomain, hostedZoneId, hostedZoneName, certificateArn } = props;

    const bucket = new Bucket(this, "SiteBucket", {
      bucketName: `placemate-marketing-${this.account}`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Static, fully re-publishable from source — safe to destroy with the stack.
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Marketing CSP: same-origin by default, plus the cookieless analytics vendor
    // (Plausible) for its script + event beacon. JSON-LD is `application/ld+json` (data,
    // not executed) so it needs no script-src allowance; CSS is an external stylesheet.
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data:",
      "font-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' https://plausible.io",
      "connect-src 'self' https://plausible.io",
      "form-action 'self'",
    ].join("; ");

    const securityHeaders = new ResponseHeadersPolicy(this, "SecurityHeaders", {
      responseHeadersPolicyName: "placemate-marketing-security",
      comment: "Security headers + marketing CSP (spec-corporate-website.md §3)",
      securityHeadersBehavior: {
        contentSecurityPolicy: { contentSecurityPolicy: csp, override: true },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          // `preload` intentionally dropped: avoid being locked into the browser HSTS
          // preload list while diagnosing NHS-network reachability (delisting is slow).
          // HSTS itself stays (365d max-age + includeSubdomains). See
          // plans/2026-07-20-nhs-wifi-access.md.
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
      },
    });

    // Viewer-request function (ES5-safe, cloudfront-js-1.0):
    //   1) www → apex 301 (preserving path + query), so the apex is the sole canonical host.
    //   2) Astro `directory` format: rewrite `/features` → `/features/index.html` and
    //      `/dir/` → `/dir/index.html`. Extension-bearing paths (assets) pass through.
    const router = new CfFunction(this, "RouterFn", {
      functionName: "placemate-marketing-router",
      comment: "www→apex 301 + Astro directory-index rewrite",
      code: FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var headers = request.headers;
  var host = headers.host && headers.host.value;

  if (host === '${wwwDomain}') {
    var query = '';
    var qs = request.querystring;
    if (qs) {
      var parts = [];
      for (var k in qs) {
        if (qs[k].multiValue) {
          for (var i = 0; i < qs[k].multiValue.length; i++) {
            parts.push(k + '=' + qs[k].multiValue[i].value);
          }
        } else if (qs[k].value !== undefined && qs[k].value !== '') {
          parts.push(k + '=' + qs[k].value);
        } else {
          parts.push(k);
        }
      }
      if (parts.length > 0) query = '?' + parts.join('&');
    }
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { location: { value: 'https://${apexDomain}' + request.uri + query } }
    };
  }

  var uri = request.uri;
  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
  if (lastSegment === '') {
    request.uri = uri + 'index.html';
  } else if (lastSegment.indexOf('.') === -1) {
    request.uri = uri + '/index.html';
  }
  return request;
}
`),
    });

    const certificate = Certificate.fromCertificateArn(this, "Cert", certificateArn);

    const distribution = new Distribution(this, "Distribution", {
      comment: "PlaceMate marketing site (placemate.uk)",
      defaultRootObject: "index.html",
      domainNames: [apexDomain, wwwDomain],
      certificate,
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeaders,
        functionAssociations: [
          { function: router, eventType: FunctionEventType.VIEWER_REQUEST },
        ],
      },
      // A missing key behind OAC returns 403 (no s3:ListBucket) — serve the Astro 404.
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 404,
          responsePagePath: "/404.html",
          ttl: Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 404,
          responsePagePath: "/404.html",
          ttl: Duration.minutes(5),
        },
      ],
    });

    // Apex + www both alias to this distribution; the function 301s www → apex.
    const zone = HostedZone.fromHostedZoneAttributes(this, "Zone", {
      hostedZoneId,
      zoneName: hostedZoneName,
    });
    const target = RecordTarget.fromAlias(new CloudFrontTarget(distribution));
    // IPv6 (AaaaRecord) deliberately NOT published: half-working IPv6 on NHS/hospital
    // guest WiFi is a classic cause of "the network connection was lost" that works on
    // cellular but not WiFi. Publishing A-only makes clients resolve IPv4, which
    // CloudFront serves universally. Fully reversible (re-add AaaaRecord). See
    // plans/2026-07-20-nhs-wifi-access.md.
    for (const [rid, name] of [
      ["Apex", apexDomain],
      ["Www", wwwDomain],
    ] as const) {
      new ARecord(this, `AliasA${rid}`, { zone, recordName: name, target });
    }

    new CfnOutput(this, "MarketingBucketName", { value: bucket.bucketName });
    new CfnOutput(this, "MarketingDistributionId", { value: distribution.distributionId });
    new CfnOutput(this, "MarketingDistributionDomainName", {
      value: distribution.distributionDomainName,
    });
    new CfnOutput(this, "MarketingSiteUrl", { value: `https://${apexDomain}` });
  }
}
