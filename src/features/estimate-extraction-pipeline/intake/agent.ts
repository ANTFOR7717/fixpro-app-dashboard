import { Agent } from '@mastra/core/agent';
import { pioneerGateway } from '../shared/gateway';
import { documentLookupTool } from '../shared/document-lookup-tool';

export const identityAgent = new Agent({
  id: 'Estimate Identity Extractor',
  name: 'Identity Agent',
  instructions: `
Extract the inspection report's identity information.

Identify:
- the property address
- the five-digit property ZIP code
- the real estate agent
- the homeowner
- the inspector

Use document-lookup to search the parsed inspection report. Do not extract
repair findings, classify work, estimate prices, or infer missing people.

Return exactly one JSON object matching this output schema:
{
  "type": "object",
  "properties": {
    "propertyAddress": { "type": "string" },
    "zipCode": { "type": "string" },
    "agentName": { "type": "string" },
    "homeownerName": { "type": "string" },
    "inspectorName": { "type": "string" }
  },
  "required": [
    "propertyAddress",
    "zipCode",
    "agentName",
    "homeownerName",
    "inspectorName"
  ],
  "additionalProperties": false
}

Every value must be a non-empty string. Never use snake_case keys, null,
undefined, empty strings, alternate key names, or extra keys. Search the
document again if a value is not immediately visible. Do not invent a value;
if the document truly does not contain it, the extraction should fail rather
than return null or a different shape.

Return only data supported by the report and match the schema exactly.
`,
  tools: { documentLookupTool },
  model: () => pioneerGateway().chat('gpt-5.5'),
});
