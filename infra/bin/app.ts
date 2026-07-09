#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { getEnvConfig, type EnvName } from "../lib/config";
import { NursePlannerStack } from "../lib/nurse-planner-stack";

const app = new App();

const envs: EnvName[] = ["dev", "prod"];
for (const name of envs) {
  const config = getEnvConfig(app, name);
  new NursePlannerStack(app, `NursePlanner-${name}`, {
    config,
    env: { account: config.account, region: config.region },
    description: `Student Nurse Planner backend (${name}) — auth + DynamoDB. See spec/spec-implementation-roadmap.md`,
  });
}

app.synth();
