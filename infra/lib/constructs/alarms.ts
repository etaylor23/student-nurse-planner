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
import { CfnBudget } from "aws-cdk-lib/aws-budgets";
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
  /** Where alarm + budget notifications go (e.g. hello@placemate.uk). */
  notifyEmail: string;
  /** Monthly cost-budget ceiling in USD (forecast/actual notifications). */
  monthlyBudgetUsd: number;
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
 * Operational alarms + a cost budget for the live environment.
 *
 * Before this, the account had ZERO CloudWatch alarms and no budget — a router Lambda
 * failing, the API 5xx-ing, the table throttling, or the SES bounce rate climbing toward
 * the account-suspension threshold would all have been invisible until a user complained
 * or the bill arrived. Every alarm and both budget thresholds notify a single SNS email
 * topic (subscription must be confirmed once from the target inbox).
 *
 * Instantiated only for the live env (see the stack) — no point paging on a placeholder.
 */
export class Alarms extends Construct {
  constructor(scope: Construct, id: string, props: AlarmsProps) {
    super(scope, id);
    const { config, routerFn, httpApi, table, notifyEmail, monthlyBudgetUsd } = props;

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
    makeAlarm(
      "SesComplaintRate",
      sesMetric("Reputation.ComplaintRate"),
      0.001,
      "SES complaint rate ≥0.1% — risk of sending suspension",
    );

    // Cost guardrail. Budget notifications email directly (no SNS confirmation needed).
    // `threshold` is a percentage of the limit.
    new CfnBudget(this, "MonthlyBudget", {
      budget: {
        budgetName: `nurse-planner-${config.name}-monthly`,
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: monthlyBudgetUsd, unit: "USD" },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: "ACTUAL",
            comparisonOperator: "GREATER_THAN",
            threshold: 80,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [{ subscriptionType: "EMAIL", address: notifyEmail }],
        },
        {
          notification: {
            notificationType: "FORECASTED",
            comparisonOperator: "GREATER_THAN",
            threshold: 100,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [{ subscriptionType: "EMAIL", address: notifyEmail }],
        },
      ],
    });
  }
}
