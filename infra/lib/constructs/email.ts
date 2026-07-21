import { Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  EmailIdentity,
  Identity,
  MailFromBehaviorOnMxFailure,
} from "aws-cdk-lib/aws-ses";
import {
  CfnRecordSet,
  MxRecord,
  TxtRecord,
  type IHostedZone,
} from "aws-cdk-lib/aws-route53";
import type { EnvConfig } from "../config";

export interface EmailProps {
  config: EnvConfig;
  /** The delegated Route 53 zone for `config.customDomain.hostedZoneName`. */
  hostedZone: IHostedZone;
}

const RECORD_TTL = Duration.minutes(30);

/**
 * SES sending identity for the root domain (`config.customDomain.hostedZoneName`, e.g.
 * `placemate.uk`) with the full deliverability record set, so magic-link mail lands in
 * the inbox rather than junk (HANDOVER-placemate-domain.md §E):
 *
 *   - Easy DKIM              → 3× CNAME (from the identity's DKIM tokens)
 *   - custom MAIL FROM       → `mail.<domain>`: MX to the regional SES feedback host
 *                              (SPF alignment) + an SPF TXT
 *   - DMARC                  → `_dmarc.<domain>` TXT, `p=quarantine` (tighten to
 *                              `p=reject` after ~1–2 weeks of clean reports),
 *                              reports to `hello@<domain>`
 *
 * The identity is regional and MUST match the region the magic-link Lambda sends from
 * (`config.region`, wired in the Auth construct). Records verify only once the zone is
 * delegated at the registrar; creating them here never blocks the deploy.
 */
export class Email extends Construct {
  readonly identity: EmailIdentity;

  constructor(scope: Construct, id: string, props: EmailProps) {
    super(scope, id);
    const { config, hostedZone } = props;
    const cd = config.customDomain;
    if (!cd) {
      throw new Error("Email construct requires config.customDomain to be set");
    }
    const domain = cd.hostedZoneName; // e.g. "placemate.uk"
    const mailFromDomain = `mail.${domain}`;

    this.identity = new EmailIdentity(this, "DomainIdentity", {
      identity: Identity.domain(domain),
      dkimSigning: true, // Easy DKIM
      mailFromDomain,
      // If the custom MAIL FROM MX ever fails to resolve, fall back to the SES default
      // MAIL FROM rather than dropping mail — DMARC still passes via DKIM alignment.
      mailFromBehaviorOnMxFailure: MailFromBehaviorOnMxFailure.USE_DEFAULT_VALUE,
    });

    // ---- Easy DKIM: 3 CNAMEs. The token *name* attributes are already fully qualified
    // (`<token>._domainkey.<domain>`) but are deploy-time TOKENS, so the L2 `CnameRecord`
    // can't tell they already end in the zone name and would append it again (→
    // `..._domainkey.placemate.uk.placemate.uk`). Use the L1 `CfnRecordSet`, which writes
    // `name` verbatim — this is exactly how CDK's own EasyDkim.bind() creates them. ----
    const dkim = [
      { name: this.identity.dkimDnsTokenName1, value: this.identity.dkimDnsTokenValue1 },
      { name: this.identity.dkimDnsTokenName2, value: this.identity.dkimDnsTokenValue2 },
      { name: this.identity.dkimDnsTokenName3, value: this.identity.dkimDnsTokenValue3 },
    ];
    dkim.forEach((d, i) => {
      new CfnRecordSet(this, `Dkim${i + 1}`, {
        hostedZoneId: hostedZone.hostedZoneId,
        name: d.name,
        type: "CNAME",
        resourceRecords: [d.value],
        ttl: RECORD_TTL.toSeconds().toString(),
      });
    });

    // ---- Custom MAIL FROM (`mail.<domain>`): MX to the regional SES host + SPF ----
    new MxRecord(this, "MailFromMx", {
      zone: hostedZone,
      recordName: mailFromDomain,
      values: [{ hostName: `feedback-smtp.${config.region}.amazonses.com`, priority: 10 }],
      ttl: RECORD_TTL,
    });
    new TxtRecord(this, "MailFromSpf", {
      zone: hostedZone,
      recordName: mailFromDomain,
      values: ["v=spf1 include:amazonses.com -all"],
      ttl: RECORD_TTL,
    });

    // ---- DMARC at p=quarantine (moved up from p=none 2026-07-18 once both senders that
    // use @<domain> — SES here + iCloud Custom Email Domain, which hosts the mailbox — were
    // confirmed DKIM-aligned, so no legitimate mail fails). Aggregate reports land at
    // hello@<domain>. Tighten to p=reject after reviewing clean rua reports. ----
    new TxtRecord(this, "Dmarc", {
      zone: hostedZone,
      recordName: `_dmarc.${domain}`,
      values: [`v=DMARC1; p=quarantine; rua=mailto:hello@${domain}; fo=1; pct=100`],
      ttl: RECORD_TTL,
    });
  }
}
