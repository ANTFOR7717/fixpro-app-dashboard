import { z } from 'zod';

export const intakeIdentitySchema = z.object({
  propertyAddress: z.string().trim().min(1).max(1000),
  zipCode: z.string().regex(/^\d{5}$/),
  agentName: z.string().trim().min(1).max(255),
  homeownerName: z.string().trim().min(1).max(255),
  inspectorName: z.string().trim().min(1).max(255),
});

export type IntakeIdentity = z.infer<typeof intakeIdentitySchema>;

export const intakeTimeframeSchema = z.object({
  timeframe: z.string().min(1),
});

export type IntakeTimeframe = z.infer<typeof intakeTimeframeSchema>;

export const estimateIntakeInputSchema = z.object({
  estimateRequestId: z.string(),
  fileUrl: z.string().url(),
  zipCode: z.string().length(5),
});

export const estimateIntakeOutputSchema = intakeIdentitySchema.extend({
  timeframe: intakeTimeframeSchema.shape.timeframe,
});
