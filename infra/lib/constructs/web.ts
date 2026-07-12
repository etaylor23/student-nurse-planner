import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  type IBucket,
} from "aws-cdk-lib/aws-s3";
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  Function as CfFunction,
  FunctionCode,
  FunctionEventType,
  HeadersFrameOption,
  HeadersReferrerPolicy,
  OriginProtocolPolicy,
  OriginRequestPolicy,
  ResponseHeadersPolicy,
  SecurityPolicyProtocol,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { HttpOrigin, S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import type { HttpApi } from "aws-cdk-lib/aws-apigatewayv2";
import type { ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import {
  ARecord,
  AaaaRecord,
  RecordTarget,
  type IHostedZone,
} from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import type { EnvConfig } from "../config";

export interface WebProps {
  config: EnvConfig;
  httpApi: HttpApi;
  /** us-east-1 ACM cert (cross-region ref). Required when `config.customDomain` is set. */
  certificate?: ICertificate;
  /** The delegated zone. Required when `config.customDomain` is set. */
  hostedZone?: IHostedZone;
}

/**
 * S3 (private, OAC) SPA origin + a same-origin CloudFront distribution
 * (spec-backend-dynamodb.md §6):
 *   - default behaviour  → S3 (SPA), strict CSP + security headers.
 *   - `/api/*`           → API Gateway (JWT-guarded RPC), no caching, Authorization fwd.
 *   - `/feeds/*`         → API Gateway (public calendar feed, no authorizer).
 *
 * SPA deep-link routing is handled by a CloudFront Function on the S3 behaviour ONLY,
 * so it never rewrites `/api` or `/feeds` origin responses (a distribution-wide
 * errorResponses rule would). The SPA bundle is published by the frontend GitHub
 * Actions workflow (S3 sync + invalidation) — CDK creates the bucket empty.
 *
 * Custom domain (ACM + Route 53) is omitted unless `config.customDomain` is set; the
 * default `*.cloudfront.net` domain is used until cutover.
 */
export class Web extends Construct {
  readonly bucket: IBucket;
  readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: WebProps) {
    super(scope, id);
    const { config, httpApi, certificate, hostedZone } = props;
    if (config.customDomain && (!certificate || !hostedZone)) {
      throw new Error("Web: config.customDomain requires both certificate and hostedZone");
    }

    this.bucket = new Bucket(this, "SpaBucket", {
      bucketName: `nurse-planner-web-${config.name}-${config.account}`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: config.retainData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !config.retainData,
    });

    const apiDomain = `${httpApi.apiId}.execute-api.${config.region}.amazonaws.com`;
    const apiOrigin = new HttpOrigin(apiDomain, {
      protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
    });

    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data:",
      "font-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      `connect-src 'self' https://cognito-idp.${config.region}.amazonaws.com`,
      "form-action 'self'",
    ].join("; ");

    const securityHeaders = new ResponseHeadersPolicy(this, "SecurityHeaders", {
      responseHeadersPolicyName: `nurse-planner-${config.name}-security`,
      comment: "Strict CSP + security headers for the SPA (spec-auth.md §1.3)",
      // The SPA is client-rendered and must NOT compete with (or leak thin pages into) the
      // search index — the marketing apex (placemate.uk) is the single indexed entity.
      // `follow` still lets crawlers traverse links. See spec-corporate-website.md §3.
      customHeadersBehavior: {
        customHeaders: [{ header: "X-Robots-Tag", value: "noindex, follow", override: true }],
      },
      securityHeadersBehavior: {
        contentSecurityPolicy: { contentSecurityPolicy: csp, override: true },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          preload: true,
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

    // SPA deep-link rewrite: extension-less paths → /index.html (S3 behaviour only).
    const spaRouter = new CfFunction(this, "SpaRouterFn", {
      functionName: `nurse-planner-spa-router-${config.name}`,
      comment: "Rewrite extension-less SPA routes to /index.html",
      code: FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
  if (lastSegment.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}
`),
    });

    this.distribution = new Distribution(this, "Distribution", {
      comment: `Student Nurse Planner (${config.name})`,
      defaultRootObject: "index.html",
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      // Custom domain: adding aliases + cert to the existing distribution is an in-place
      // update (the *.cloudfront.net domain keeps working). Omitted when unset.
      ...(config.customDomain
        ? { domainNames: [config.customDomain.domainName], certificate }
        : {}),
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeaders,
        functionAssociations: [
          { function: spaRouter, eventType: FunctionEventType.VIEWER_REQUEST },
        ],
      },
      additionalBehaviors: {
        "/api/*": {
          origin: apiOrigin,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
        "/feeds/*": {
          origin: apiOrigin,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });

    // Route 53 alias records: <domainName> → this CloudFront distribution (A + AAAA).
    if (config.customDomain && hostedZone) {
      const target = RecordTarget.fromAlias(new CloudFrontTarget(this.distribution));
      new ARecord(this, "AliasA", {
        zone: hostedZone,
        recordName: config.customDomain.domainName,
        target,
      });
      new AaaaRecord(this, "AliasAAAA", {
        zone: hostedZone,
        recordName: config.customDomain.domainName,
        target,
      });
    }
  }
}
