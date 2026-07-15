/**
 * THE DOOR — document's complete public contract. document/ does exactly
 * one job: parse the source PDF into page-level plain text. It does not
 * chunk, embed, or store anything — semantic judgment about which
 * sentences matter belongs to extraction/, which actually reads the
 * document with reasoning; document/ never has.
 */
export {
  parsedDocumentSchema,
  type ParsedDocument,
  type DocumentPage,
} from './schema';
export { parsePdfFromUrl } from './parse';
