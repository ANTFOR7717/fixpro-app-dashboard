import { z } from 'zod';
import { collectTimeframeStep, confirmIdentityStep } from './steps';
import { intakeIdentitySchema, type IntakeIdentity } from './schema';

const suspendedWorkflowResultSchema = z.object({
  suspended: z.array(z.array(z.string()).min(1)).length(1),
  steps: z.record(
    z.string(),
    z.object({ suspendPayload: z.unknown() }),
  ),
});

const suspendedIdentityPayloadSchema = z.object({
  identity: intakeIdentitySchema,
});

export function readSuspendedIdentity(result: unknown): IntakeIdentity {
  const parsed = suspendedWorkflowResultSchema.parse(result);
  const [path] = parsed.suspended;
  const stepId = path[0];

  if (stepId !== confirmIdentityStep.id) {
    throw new Error(`Unexpected suspended step: ${stepId}`);
  }

  return suspendedIdentityPayloadSchema.parse(
    parsed.steps[stepId].suspendPayload,
  ).identity;
}

export function readSuspendedTimeframe(result: unknown): IntakeIdentity {
  const parsed = suspendedWorkflowResultSchema.parse(result);
  const [path] = parsed.suspended;
  const stepId = path[0];

  if (stepId !== collectTimeframeStep.id) {
    throw new Error(`Unexpected suspended step: ${stepId}`);
  }

  return suspendedIdentityPayloadSchema.parse(
    parsed.steps[stepId].suspendPayload,
  ).identity;
}
