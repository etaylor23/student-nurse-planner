/**
 * CloudWatch metrics for AI recall, emitted as **EMF** (Embedded Metric Format): a
 * specially-shaped JSON line on stdout that CloudWatch Logs parses into metrics. No
 * PutMetricData call, so no extra latency in the request path and no IAM permission
 * beyond the log group the Lambda already writes to.
 *
 * The metric that matters most is `CacheReadTokens`. Prompt caching is the assumption
 * that makes Sonnet affordable (~$0.005/question warm vs ~$0.032 cold on a ~10k-token
 * corpus), and it fails *silently* — a stray byte in the cached prefix just means every
 * question pays full price. Phase 4 alarms on this going to zero over a day.
 */

const NAMESPACE = "PlaceMate/AI";

export interface AskMetrics {
  /** Present on every ask. */
  latencyMs: number;
  corpusBlocks: number;
  corpusTruncated: boolean;
  historyTurns: number;
  /** Absent when the ask never reached the model (cap, kill switch, auth). */
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  /** Set when the ask ended in an error frame, so `Errors` can be split by cause. */
  errorCode?: string;
  /** Questions the student has left today — useful for spotting cap pressure. */
  remaining?: number;
}

/**
 * Emit one EMF line. Dimensions are deliberately minimal (`Provider` + `Model`) so the
 * swap from the interim model to Sonnet shows up as a clean before/after on the same
 * metrics rather than a break in continuity.
 */
export function emitAskMetrics(m: AskMetrics): void {
  const provider = process.env.AI_PROVIDER ?? "unknown";
  const model = process.env.AI_MODEL_ID ?? "unknown";

  const metrics: Array<{ Name: string; Unit: string }> = [
    { Name: "Questions", Unit: "Count" },
    { Name: "LatencyMs", Unit: "Milliseconds" },
    { Name: "CorpusBlocks", Unit: "Count" },
  ];
  const values: Record<string, number | string> = {
    Questions: 1,
    LatencyMs: m.latencyMs,
    CorpusBlocks: m.corpusBlocks,
    HistoryTurns: m.historyTurns,
    CorpusTruncated: m.corpusTruncated ? 1 : 0,
    Provider: provider,
    Model: model,
  };

  if (typeof m.inputTokens === "number") {
    metrics.push({ Name: "InputTokens", Unit: "Count" });
    values.InputTokens = m.inputTokens;
  }
  if (typeof m.outputTokens === "number") {
    metrics.push({ Name: "OutputTokens", Unit: "Count" });
    values.OutputTokens = m.outputTokens;
  }
  // Always emit when the model was called, INCLUDING zero — an absent metric reads as
  // "no data" to an alarm, which is exactly the silent failure we want to catch.
  if (typeof m.inputTokens === "number") {
    metrics.push({ Name: "CacheReadTokens", Unit: "Count" });
    values.CacheReadTokens = m.cacheReadTokens ?? 0;
  }
  if (typeof m.remaining === "number") {
    metrics.push({ Name: "QuestionsRemaining", Unit: "Count" });
    values.QuestionsRemaining = m.remaining;
  }
  if (m.errorCode) {
    metrics.push({ Name: "Errors", Unit: "Count" });
    values.Errors = 1;
    values.ErrorCode = m.errorCode;
    if (m.errorCode === "CAP") {
      metrics.push({ Name: "CapHits", Unit: "Count" });
      values.CapHits = 1;
    }
  }

  const emf = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: NAMESPACE,
          // Dimension sets must be low-cardinality; ErrorCode stays a property (searchable
          // in Logs Insights) rather than a dimension, so a new code can't fan out cost.
          Dimensions: [["Provider", "Model"]],
          Metrics: metrics,
        },
      ],
    },
    ...values,
  };
  console.log(JSON.stringify(emf));
}
