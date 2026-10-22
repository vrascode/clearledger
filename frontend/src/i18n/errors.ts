import { ZodError } from "zod";
import { messages, type Message, type MessageKey } from "./config";

export class MessageError extends Error {
  constructor(public descriptor: Message) {
    super(descriptor.key);
  }
}

// Keep the FastAPI contract unchanged. Map stable server diagnostics to localized
// explanations; never show unknown raw server messages or financial source data.
const exact: Record<string, MessageKey> = {
  "The dashboard connection was interrupted. Please retry.": "errors.network",
  "The upload was interrupted. Retry with the same batch key.":
    "errors.uploadInterrupted",
  "The upload timed out. Retry with the same batch key; imports are idempotent.":
    "errors.uploadTimeout",
  "The API returned an unexpected response.": "errors.response",
  "Export failed. Please retry.": "errors.export",
  "Batch key already exists with different content": "errors.conflict",
  "Request does not match the schema": "errors.schema",
  "Request is not valid JSON": "errors.json",
  "Database operation unavailable; retry later": "errors.storage",
  "Cannot reconcile three empty imports": "errors.empty",
  "Unsupported database schema version": "errors.storage",
  "CSV must be UTF-8": "errors.utf8",
  "CSV cannot contain NUL characters": "errors.nul",
  "Malformed CSV": "errors.malformed",
  "Invalid or missing API key": "errors.authentication",
  "API authentication failed. Update the key in Settings & connection.":
    "errors.authentication",
  "Cannot reach the local API. Check that FastAPI is running and the address is correct.":
    "errors.unreachable",
  "Connect your local API in Settings & connection to get started.":
    "errors.connect",
  "Enter a valid local API URL": "errors.url",
  "Use http://127.0.0.1:8000 (or another loopback port), without a path or credentials":
    "errors.loopback",
  "Enter a local API address and a valid API key": "errors.connectionInput",
  "Too many local sessions; restart the dashboard to reset connections":
    "errors.sessions",
  "Cross-origin access is not allowed": "errors.crossOrigin",
  "Cross-site access is not allowed": "errors.crossOrigin",
  "A same-origin browser request is required": "errors.browserOrigin",
  "This dashboard accepts local connections only": "errors.localOnly",
  "Compressed bodies are not supported": "errors.compressed",
  "Compressed request bodies are not supported": "errors.compressed",
  "Request exceeds the upload limit": "errors.size",
  "CSV files must be 2 MiB or smaller": "errors.size",
  "Request body too large": "errors.size",
  "Unsupported query parameter": "errors.query",
  "Endpoint not found": "errors.notFound",
};
export function describeError(error: unknown): Message {
  if (error instanceof MessageError) return error.descriptor;
  if (error instanceof ZodError) {
    const precision = error.issues.some(
      (issue) => issue.message === "errors.precision",
    );
    return { key: precision ? "errors.precision" : "errors.response" };
  }
  const text =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  if (
    text.startsWith("errors.") &&
    Object.hasOwn(messages["en-US"].errors, text.slice(7))
  )
    return { key: text as MessageKey };
  if (exact[text]) return { key: exact[text] };
  let match: RegExpMatchArray | null;
  if (
    (match = text.match(
      /^(?:CSV header must be exactly|Expected CSV header): (.+)$/,
    ))
  )
    return { key: "errors.header", values: { header: match[1] } };
  if ((match = text.match(/^CSV exceeds (\d+) records$/)))
    return { key: "errors.rows", values: { count: Number(match[1]) } };
  if (/^CSV exceeds \d+ bytes$/.test(text)) return { key: "errors.size" };
  if (
    /^(Run|orders import|transactions import|deposits import) not found$/.test(
      text,
    )
  )
    return { key: "errors.notFound" };
  if (
    /^Selected (orders|transactions|deposits) import has the wrong kind$/.test(
      text,
    )
  )
    return { key: "errors.wrongKind" };
  if ((match = text.match(/^Record (\d+): (\w+) must be a bounded integer$/)))
    return {
      key: "errors.integer",
      values: { row: Number(match[1]), field: match[2] },
    };
  const rowMessages: Record<string, MessageKey> = {
    "incorrect column count": "errors.columns",
    "unsupported currency": "errors.currency",
    "refund must be between zero and gross": "errors.refund",
    "expected gross must be positive": "errors.positive",
    "invalid transaction kind, sign or fee": "errors.transaction",
    "duplicate source identifier": "errors.duplicate",
  };
  if ((match = text.match(/^Record (\d+): (.+)$/)) && rowMessages[match[2]])
    return { key: rowMessages[match[2]], values: { row: Number(match[1]) } };
  if ((match = text.match(/^(?:Record (\d+): )?(\w+) must be 1-80 ASCII/)))
    return {
      key: match[1] ? "errors.recordIdentifier" : "errors.identifier",
      values: {
        field: match[2],
        ...(match[1] ? { row: Number(match[1]) } : {}),
      },
    };
  if (
    (match = text.match(
      /^Expected (?:Content-Type: )?(text\/csv|application\/json)$/,
    ))
  )
    return { key: "errors.contentType", values: { type: match[1] } };
  return { key: "errors.generic" };
}
