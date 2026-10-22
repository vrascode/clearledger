"use client";
import { useI18n } from "@/i18n/provider";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowDownToLine,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  LoaderCircle,
  Search,
  UploadCloud,
} from "lucide-react";
import { notify } from "@/i18n/notifications";
import { MessageError } from "@/i18n/errors";
import {
  batchSchema,
  kinds,
  MAX_BYTES,
  schemas,
  type ImportRecord,
} from "@/lib/contracts";
import { uploadCsv } from "@/lib/api";

import { Button } from "./ui/button";

const formSchema = z.object({ kind: z.enum(kinds), batch: batchSchema });
export function Imports({ imports }: { imports: ImportRecord[] }) {
  const { t, number, percent, error: formatError } = useI18n();
  const client = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [completed, setCompleted] = useState<ImportRecord | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { kind: "orders", batch: "" },
  });
  const kind = useWatch({ control, name: "kind" });
  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      if (!file) throw new Error("errors.fileRequired");
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(
          await file.arrayBuffer(),
        );
      } catch {
        throw new Error("errors.utf8");
      }
      if (text.split(/\r?\n/, 1)[0] !== schemas[values.kind])
        throw new MessageError({
          key: "errors.header",
          values: { header: schemas[values.kind] },
        });
      setProgress(0);
      setCompleted(null);
      return uploadCsv(values.kind, values.batch, file, setProgress);
    },
    onSuccess: async (result) => {
      setCompleted(result);
      await client.invalidateQueries({ queryKey: ["ledger", "imports"] });
      notify.success("notifications.imported", undefined, {
        key: "notifications.importSummary",
        values: { count: result.row_count },
      });
    },
    onError: (error) => notify.error(error, "notifications.importFailure"),
  });
  function selectFile(next: File | undefined) {
    mutation.reset();
    setFileError("");
    setCompleted(null);
    setProgress(0);
    if (!next) return;
    if (!next.name.toLowerCase().endsWith(".csv")) {
      setFile(null);
      setFileError("errors.fileType");
      return;
    }
    if (next.size > MAX_BYTES) {
      setFile(null);
      setFileError("errors.size");
      return;
    }
    setFile(next);
  }
  return (
    <>
      <div className="two-col">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{t("imports.formTitle")}</h2>
              <p>{t("imports.formDescription")}</p>
            </div>
            <FileSpreadsheet size={18} className="text-muted" />
          </div>
          <form
            className="form-body"
            onSubmit={handleSubmit((values) => mutation.mutate(values))}
          >
            <div>
              <label htmlFor="import-kind" className="field-label">
                {t("imports.datasetType")}
              </label>
              <select
                id="import-kind"
                className="w-full"
                {...register("kind")}
                disabled={mutation.isPending}
              >
                <option value="orders">{t("kind.orders")}</option>
                <option value="transactions">{t("kind.transactions")}</option>
                <option value="deposits">{t("kind.deposits")}</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="csv-file"
                className={`dropzone ${dragging ? "dragging" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!mutation.isPending) setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  if (!mutation.isPending) {
                    if (e.dataTransfer.files.length !== 1)
                      setFileError("errors.singleFile");
                    else selectFile(e.dataTransfer.files[0]);
                  }
                }}
              >
                <UploadCloud size={28} strokeWidth={1.5} />
                <strong>{file ? file.name : t("imports.dropzone")}</strong>
                <span>
                  {file
                    ? t("imports.fileReady", {
                        size: number(file.size / 1024, {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        }),
                      })
                    : t("imports.fileLimits")}
                </span>
                <input
                  ref={fileInput}
                  id="csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  disabled={mutation.isPending}
                  onChange={(e) => selectFile(e.target.files?.[0])}
                />
              </label>
              {fileError && (
                <p className="form-error" role="alert">
                  {formatError(fileError)}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="batch-key" className="field-label">
                {t("imports.batchKey")}
              </label>
              <input
                id="batch-key"
                className="field w-full"
                placeholder={t("imports.batchPlaceholder")}
                {...register("batch")}
                aria-invalid={!!errors.batch}
                aria-describedby="batch-help"
                disabled={mutation.isPending}
              />
              <p id="batch-help" className="field-help">
                {t("imports.batchHelp")}
              </p>
              {errors.batch && (
                <p className="form-error" role="alert">
                  {formatError(errors.batch.message)}
                </p>
              )}
            </div>
            {mutation.isPending && (
              <div role="status">
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="field-help">
                  {progress < 100
                    ? t("imports.uploading", { progress: percent(progress, 0) })
                    : t("imports.validating")}
                </p>
              </div>
            )}
            {mutation.error && (
              <div className="error-notice" role="alert">
                {formatError(mutation.error)}
              </div>
            )}
            {completed && (
              <div className="notice" role="status">
                <strong style={{ color: "var(--success)" }}>
                  <CheckCircle2 size={13} className="inline mr-1" />
                  {t("imports.ready", { count: completed.row_count })}
                </strong>
                <div className="mono mt-2" style={{ overflowWrap: "anywhere" }}>
                  {completed.id}
                </div>
              </div>
            )}
            <Button
              type="submit"
              disabled={!file || !!fileError || mutation.isPending}
            >
              {mutation.isPending ? (
                <LoaderCircle size={14} className="animate-spin" />
              ) : (
                <UploadCloud size={14} />
              )}
              {mutation.isPending
                ? t("imports.importing")
                : t("imports.validate")}
            </Button>
          </form>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{t("imports.guideTitle")}</h2>
              <p>{t("imports.guideDescription")}</p>
            </div>
          </div>
          <div className="form-body">
            <div className="guide-list">
              {[
                [t("imports.guide1Title"), t("imports.guide1Body")],
                [t("imports.guide2Title"), t("imports.guide2Body")],
                [t("imports.guide3Title"), t("imports.guide3Body")],
              ].map(([title, copy], index) => (
                <div key={title} className="guide-item">
                  <span>{number(index + 1)}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{copy}</p>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div className="field-label">
                {t("imports.requiredHeader", { kind: t(`kind.${kind}`) })}
              </div>
              <code className="schema-box block">{schemas[kind]}</code>
            </div>
            <Button variant="outline" asChild>
              <a href={`/api/examples/${kind}`} download>
                <ArrowDownToLine size={14} />
                {t("imports.downloadSample", { kind: t(`kind.${kind}`) })}
              </a>
            </Button>
            <p className="field-help">{t("imports.atomicNote")}</p>
          </div>
        </section>
      </div>
      <ImportHistory imports={imports} />
    </>
  );
}
function ImportHistory({ imports }: { imports: ImportRecord[] }) {
  const { t, number, date } = useI18n();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [page, setPage] = useState(0);
  const rows = imports.filter(
    (row) =>
      (kind === "all" || row.kind === kind) &&
      `${row.batch_key} ${row.id}`.toLowerCase().includes(search.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(rows.length / 8));
  const currentPage = Math.min(page, pages - 1);
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>{t("imports.history")}</h2>
          <p>{t("imports.historyDescription")}</p>
        </div>
        <span className="text-muted text-xs">
          {t("common.datasets", { count: imports.length })}
        </span>
      </div>
      <div className="filters">
        <div className="search-field">
          <Search />
          <input
            className="field"
            placeholder={t("imports.searchPlaceholder")}
            aria-label={t("imports.search")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <select
          aria-label={t("imports.filterType")}
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setPage(0);
          }}
        >
          <option value="all">{t("imports.allDatasets")}</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {t(`kind.${k}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="table-wrap">
        <table aria-label={t("imports.history")}>
          <thead>
            <tr>
              <th>{t("imports.batchId")}</th>
              <th>{t("imports.dataset")}</th>
              <th>{t("imports.records")}</th>
              <th>{t("imports.imported")}</th>
              <th>{t("imports.fingerprint")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(currentPage * 8, currentPage * 8 + 8).map((row) => (
              <tr key={row.id}>
                <td>
                  <strong className="text-xs font-medium">
                    {row.batch_key}
                  </strong>
                  <div className="mono text-muted mt-1" title={row.id}>
                    {row.id}
                  </div>
                </td>
                <td>{t(`kind.${row.kind}`)}</td>
                <td className="numeric">{number(row.row_count)}</td>
                <td>{date(row.created_at)}</td>
                <td>
                  <details>
                    <summary className="mono cursor-pointer">
                      {row.sha256.slice(0, 12)}…
                    </summary>
                    <code className="mono">{row.sha256}</code>
                  </details>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td
                  colSpan={5}
                  className="text-center text-muted"
                  style={{ padding: 32 }}
                >
                  {imports.length
                    ? t("imports.noMatches")
                    : t("imports.noHistory")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>
          {t("common.datasets", { count: rows.length })} ·{" "}
          {t("common.page", { page: currentPage + 1, pages })}
        </span>
        <div className="actions">
          <Button
            size="icon"
            variant="outline"
            aria-label={t("imports.previous")}
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft size={14} />
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label={t("imports.next")}
            disabled={currentPage === pages - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>
    </section>
  );
}
