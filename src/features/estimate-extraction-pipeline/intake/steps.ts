import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { parsedDocumentSchema } from '../document';
import { documentLookupTool } from '../shared/document-lookup-tool';
import { identityAgent } from './agent';
import {
  estimateIntakeOutputSchema,
  intakeIdentitySchema,
  intakeTimeframeSchema,
} from './schema';

const identityPromptSchema = z.object({ prompt: z.string() });

export const identityPromptStep = createStep({
  id: 'Prepare Identity Extraction',
  inputSchema: z.object({ parsedDocument: parsedDocumentSchema }),
  outputSchema: identityPromptSchema,
  execute: async () => {
    // The parsed document is already present from the existing pipeline
    // handoff. This step only supplies the agent's task prompt.
    return {
      prompt:
        'Extract the property address, ZIP code, agent, homeowner, and inspector. ' +
        `Use the ${documentLookupTool.id} tool to search the inspection report.`,
    };
  },
});

export const identityExtractionStep = createStep(identityAgent, {
  structuredOutput: { schema: intakeIdentitySchema },
  retries: 2,
});

export const confirmIdentityStep = createStep({
  id: 'Confirm Estimate Identity',
  inputSchema: intakeIdentitySchema,
  outputSchema: intakeIdentitySchema,
  suspendSchema: z.object({ identity: intakeIdentitySchema }),
  resumeSchema: z.object({ identity: intakeIdentitySchema }),
  execute: async ({ inputData, resumeData, suspend }) => {
    if (!resumeData) {
      return await suspend({ identity: inputData });
    }

    return resumeData.identity;
  },
});

export const collectTimeframeStep = createStep({
  id: 'Collect Estimate Timeframe',
  inputSchema: intakeIdentitySchema,
  outputSchema: estimateIntakeOutputSchema,
  suspendSchema: z.object({ identity: intakeIdentitySchema }),
  resumeSchema: intakeTimeframeSchema,
  execute: async ({ inputData, resumeData, suspend }) => {
    if (!resumeData) {
      return await suspend({ identity: inputData });
    }

    // The intake caller persists the confirmed identity and timeframe, then
    // starts the existing final-estimate workflow separately.
    return { ...inputData, timeframe: resumeData.timeframe };
  },
});
