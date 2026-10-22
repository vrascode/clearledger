import { z } from "zod";
import {
  importSchema,
  runSchema,
  reportSchema,
  type ImportKind,
} from "./contracts";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, { ...init, cache: "no-store" });
  } catch {
    throw new ApiError(
      "The dashboard connection was interrupted. Please retry.",
      0,
    );
  }
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      body?.error?.message ?? "This request could not be completed.",
      response.status,
    );
  return body as T;
}
async function allPages<T>(resource: string, schema: z.ZodType<T>) {
  const records: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const data = z
      .object({ items: z.array(schema) })
      .parse(await api(`v1/${resource}?limit=100&offset=${offset}`));
    records.push(...data.items);
    if (data.items.length < 100) return records;
  }
}
export const getImports = () => allPages("imports", importSchema);
export const getRuns = () => allPages("runs", runSchema);
export const getReport = async (id: string) =>
  reportSchema.parse(await api(`v1/runs/${id}`));
export type ConnectionStatus = {
  configured: boolean;
  connected: boolean;
  apiUrl: string;
  source?: string;
  message?: string;
};
export function uploadCsv(
  kind: ImportKind,
  batch: string,
  file: File,
  progress: (percent: number) => void,
) {
  return new Promise<z.infer<typeof importSchema>>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(
      "POST",
      `/api/v1/imports/${kind}?batch_key=${encodeURIComponent(batch)}`,
    );
    request.setRequestHeader("Content-Type", "text/csv");
    request.timeout = 40_000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        progress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () =>
      reject(
        new ApiError(
          "The upload was interrupted. Retry with the same batch key.",
          0,
        ),
      );
    request.ontimeout = () =>
      reject(
        new ApiError(
          "The upload timed out. Retry with the same batch key; imports are idempotent.",
          0,
        ),
      );
    request.onload = () => {
      try {
        const data = JSON.parse(request.responseText);
        if (request.status >= 400)
          reject(
            new ApiError(
              data?.error?.message ?? "Import failed",
              request.status,
            ),
          );
        else resolve(importSchema.parse(data));
      } catch {
        reject(
          new ApiError(
            "The API returned an unexpected response.",
            request.status,
          ),
        );
      }
    };
    request.send(file);
  });
}
export async function downloadReport(id: string, format: "csv" | "json") {
  const response = await fetch(`/api/v1/runs/${id}/export?format=${format}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error?.message ?? "Export failed. Please retry.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `clearledger-${id}.${format}`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
