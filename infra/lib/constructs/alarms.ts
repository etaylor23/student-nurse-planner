import { Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  Alarm,
  ComparisonOperator,
  type IMetric,
  Metric,
  TreatMissingData,
} from "aws-cdk-lib/aws-cloudwatch";
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions";
import { Topic } from "aws-cdk-lib/aws-sns";
import { EmailSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { Operation, type Table } from "aws-cdk-lib/aws-dynamodb";
import type { HttpApi } from "aws-cdk-lib/aws-apigatewayv2";
import type { IFunction } from "aws-cdk-lib/aws-lambda";
import type { EnvConfig } from "../config";

export interface AlarmsProps {
  config: EnvConfig;
  /** The RPC router Lambda (Errors metric). */
  routerFn: IFunction;
  /** The HTTP API (5xx metric). */
  httpApi: HttpApi;
  /** The single-table store (throttle + system-error metrics). */
  table: Table;
  /** The AI ask Lambda (Errors metric). Optional so envs without AI still synth. */
  aiAskFn?: IFunction;
  /** Where alarm notifications go (e.g. ellis@placemate.uk). */
  notifyEmail: string;
}

// The operations the app actually issues against the table; throttle/system-error metrics
// are per-operation, so they must be summed across these to catch any of them.
const WATCHED_OPS = [
  Operation.GET_ITEM,
  Operation.BATCH_GET_ITEM,
  Operation.QUERY,
  Operation.PUT_ITEM,
  Operation.UPDATE_ITEM,
  Operation.DELETE_ITEM,
  Operation.BATCH_WRITE_ITEM,
  Operation.TRANSACT_WRITE_ITEMS,
  Operation.TRANSACT_GET_ITEMS,
];

/**
 * Operational alarms for the live environment.
 *
 * Before this, the account had ZERO CloudWatch alarms — a router Lambda failing, the API
 * 5xx-ing, the table throttling, or the SES bounce rate climbing toward the
 * account-suspension threshold would all have been invisible until a user complained. Every
 * alarm notifies a single SNS email topic (subscription must be confirmed once from the
 * target inbox).
 *
 * The cost budget lives OUTSIDE this stack (CLI-managed) — AWS::Budgets::Budget has flaky
 * CloudFormation update support ("same name, different internalId") that repeatedly blocked
 * deploys; a static $20 budget is set once via `aws budgets create-budget` instead. See the
 * runbook / README ops notes.
 *
 * Instantiated only for the live env (see the stack) — no point paging on a placeholder.
 */
export class Alarms extends Construct {
  constructor(scope: Construct, id: string, props: AlarmsProps) {
    super(scope, id);
    const { config, routerFn, httpApi, table, notifyEmail } = props;

    const topic = new Topic(this, "AlarmTopic", {
      topicName: `nurse-planner-alarms-${config.name}`,
      displayName: "PlaceMate alarms",
    });
    topic.addSubscription(new EmailSubscription(notifyEmail));
    const action = new SnsAction(topic);

    const FIVE_MIN = Duration.minutes(5);

    // Any 5-minute window with ≥1 occurrence trips the alarm; missing data is healthy.
    const makeAlarm = (
      idSuffix: string,
      metric: IMetric,
      threshold: number,
      alarmDescription: string,
    ) => {
      const alarm = new Alarm(this, idSuffix, {
        alarmName: `nurse-planner-${config.name}-${idSuffix}`,
        alarmDescription,
        metric,
        threshold,
        evaluationPeriods: 1,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(action);
      return alarm;
    };

    makeAlarm(
      "RouterErrors",
      routerFn.metricErrors({ period: FIVE_MIN, statistic: "Sum" }),
      1,
      "RPC router Lambda threw ≥1 error in 5 minutes",
    );

    makeAlarm(
      "Api5xx",
      httpApi.metricServerError({ period: FIVE_MIN, statistic: "Sum" }),
      1,
      "HTTP API returned ≥1 5xx in 5 minutes",
    );

    makeAlarm(
      "TableThrottles",
      table.metricThrottledRequestsForOperations({ operations: WATCHED_OPS, period: FIVE_MIN }),
      1,
      "DynamoDB throttled ≥1 request in 5 minutes",
    );

    makeAlarm(
      "TableSystemErrors",
      table.metricSystemErrorsForOperations({ operations: WATCHED_OPS, period: FIVE_MIN }),
      1,
      "DynamoDB returned ≥1 system error in 5 minutes",
    );

    // SES account-level reputation (no dimensions; auto-published on sending activity).
    // SES starts throttling/suspending sending near bounce 5% / complaint 0.1%; alarm well
    // under those so there is time to react during the beta.
    const sesMetric = (metricName: string) =>
      new Metric({
        namespace: "AWS/SES",
        metricName,
        statistic: "Average",
        period: Duration.hours(1),
      });
    makeAlarm(
      "SesBounceRate",
      sesMetric("Reputation.BounceRate"),
      0.05,
      "SES bounce rate ≥5% — risk of sending suspension",
    );
    // ---- AI recall (spec-ai-recall.md Phase 4) ----
    if (props.aiAskFn) {
      makeAlarm(
        "AiAskErrors",
        props.aiAskFn.metricErrors({ period: FIVE_MIN, statistic: "Sum" }),
        1,
        "AI ask Lambda threw ≥1 unhandled error in 5 minutes",
      );

      const aiMetric = (metricName: string, statistic: string, period: Duration) =>
        new Metric({
          namespace: "PlaceMate/AI",
          metricName,
          statistic,
          period,
          // Must match the EMF dimension set in infra/lambda/ai/metrics.ts.
          dimensionsMap: { Provider: config.ai.provider, Model: config.ai.modelId },
        });

      // Answers that fail *inside* the stream return HTTP 200 with an `error` frame, so
      // Lambda Errors never sees them — this is the only signal for THROTTLED/UPSTREAM.
      makeAlarm(
        "AiAnswerErrors",
        aiMetric("Errors", "Sum", FIVE_MIN),
        3,
        "AI recall returned ≥3 error frames in 5 minutes (throttling or upstream trouble)",
      );

      // THE COST ALARM. Prompt caching is what makes a frontier model affordable here
      // (~$0.005/question warm vs ~$0.032 cold on a ~10k-token corpus), and it breaks
      // SILENTLY: one stray byte in the cached prefix and every question quietly pays
      // full price. Alarm when a whole day of traffic produced no cache reads at all.
      // `treatMissingData: NOT_BREACHING` (from makeAlarm) means a quiet day with zero
      // questions does not page — only a day with questions but no cache hits.
      const dailyCacheReads = aiMetric("CacheReadTokens", "Sum", Duration.hours(24));
      const cacheAlarm = new Alarm(this, "AiCacheReadsZero", {
        alarmName: `nurse-planner-${config.name}-AiCacheReadsZero`,
        alarmDescription:
          "No prompt-cache reads in 24h despite AI usage — caching has silently broken and every question is paying full price",
        metric: dailyCacheReads,
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
        treatMissingData: TreatMissingData.NOT_BREACHING,
      });
      cacheAlarm.addAlarmAction(action);
    }

    makeAlarm(
      "SesComplaintRate",
      sesMetric("Reputation.ComplaintRate"),
      0.001,
      "SES complaint rate ≥0.1% — risk of sending suspension",
    );
  }
}
