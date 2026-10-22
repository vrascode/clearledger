"use client";
import { useI18n } from "@/i18n/provider";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleAlert,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { notify } from "@/i18n/notifications";
import { api, type ConnectionStatus } from "@/lib/api";
import { connectionSchema } from "@/lib/contracts";
import { Heading } from "./common";
import { Button } from "./ui/button";
export function Settings() {
  const { t, number, error: formatError } = useI18n();
  const client = useQueryClient();
  const connection = useQuery({
    queryKey: ["connection"],
    queryFn: () => api<ConnectionStatus>("connection"),
  });
  const {
    register,
    handleSubmit,
    resetField,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm<z.infer<typeof connectionSchema>>({
    resolver: zodResolver(connectionSchema),
    defaultValues: { apiUrl: "http://127.0.0.1:8000", apiKey: "" },
  });
  useEffect(() => {
    if (connection.data?.apiUrl && !dirtyFields.apiUrl)
      setValue("apiUrl", connection.data.apiUrl);
  }, [connection.data?.apiUrl, dirtyFields.apiUrl, setValue]);
  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof connectionSchema>) =>
      api("connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      }),
    onSuccess: async () => {
      resetField("apiKey");
      client.removeQueries({ queryKey: ["ledger"] });
      await client.invalidateQueries({ queryKey: ["connection"] });
      notify.success("notifications.connectionSuccess", undefined, {
        key: "notifications.connectionSummary",
      });
    },
    onError: (error) => {
      resetField("apiKey");
      notify.error(error, "notifications.connectionFailure");
    },
  });
  const reset = useMutation({
    mutationFn: () => api("connection", { method: "DELETE" }),
    onSuccess: async () => {
      client.removeQueries({ queryKey: ["ledger"] });
      await client.invalidateQueries({ queryKey: ["connection"] });
      notify.success("notifications.reset");
    },
    onError: (error) => notify.error(error),
  });
  return (
    <>
      <Heading
        title={t("settings.title")}
        description={t("settings.description")}
      />
      <div className="two-col">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{t("settings.apiConnection")}</h2>
              <p>{t("settings.loopback")}</p>
            </div>
            <KeyRound size={18} className="text-muted" />
          </div>
          <form
            className="form-body"
            onSubmit={handleSubmit((values) => mutation.mutate(values))}
            autoComplete="off"
          >
            <div className="notice" role="status">
              {connection.data?.connected ? (
                <CheckCircle2
                  size={15}
                  className="inline mr-2"
                  style={{ color: "var(--success)" }}
                />
              ) : (
                <CircleAlert size={15} className="inline mr-2" />
              )}
              <strong>
                {connection.isPending
                  ? t("settings.checking")
                  : connection.data?.connected
                    ? t("settings.connected")
                    : t("settings.attention")}
              </strong>
              <div className="text-xs mt-1">
                {connection.data?.configured
                  ? connection.data.apiUrl
                  : t("settings.addAddress")}
              </div>
              {connection.data?.message && (
                <p>{formatError(connection.data.message)}</p>
              )}
              {connection.error && (
                <p role="alert">{formatError(connection.error)}</p>
              )}
            </div>
            <div>
              <label className="field-label" htmlFor="api-url">
                {t("settings.address")}
              </label>
              <input
                className="field w-full"
                id="api-url"
                {...register("apiUrl")}
                placeholder="http://127.0.0.1:8000"
                aria-invalid={!!errors.apiUrl}
                disabled={mutation.isPending}
              />
              <p className="field-help">{t("settings.addressHelp")}</p>
              {errors.apiUrl && (
                <p className="form-error">
                  {formatError(errors.apiUrl.message)}
                </p>
              )}
            </div>
            <div>
              <label className="field-label" htmlFor="api-key">
                {t("settings.key")}
              </label>
              <input
                className="field w-full"
                id="api-key"
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                {...register("apiKey")}
                placeholder={t("settings.keyPlaceholder")}
                aria-invalid={!!errors.apiKey}
                disabled={mutation.isPending}
              />
              <p className="field-help">{t("settings.keyHelp")}</p>
              {errors.apiKey && (
                <p className="form-error" role="alert">
                  {formatError(errors.apiKey.message)}
                </p>
              )}
            </div>
            {mutation.error && (
              <p className="error-notice" role="alert">
                {formatError(mutation.error)}
              </p>
            )}
            <div className="actions">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : (
                  <ShieldCheck size={14} />
                )}
                {t("settings.verify")}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={connection.isFetching}
                onClick={() => connection.refetch()}
              >
                <RefreshCw size={14} />
                {t("settings.test")}
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="justify-start px-0 text-xs"
              disabled={reset.isPending}
              onClick={() => reset.mutate()}
            >
              {t("settings.reset")}
            </Button>
          </form>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{t("settings.guideTitle")}</h2>
              <p>{t("settings.guideDescription")}</p>
            </div>
          </div>
          <div className="form-body">
            <div className="guide-list">
              {[
                [t("settings.guide1Title"), t("settings.guide1Body")],
                [t("settings.guide2Title"), t("settings.guide2Body")],
                [t("settings.guide3Title"), t("settings.guide3Body")],
              ].map(([title, copy], i) => (
                <div className="guide-item" key={title}>
                  <span>{number(i + 1)}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{copy}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="notice">
              <strong>{t("settings.environment")}</strong>
              <p className="mt-1">{t("settings.environmentBody")}</p>
            </div>
            <p className="field-help">{t("settings.sharedWarning")}</p>
          </div>
        </section>
      </div>
    </>
  );
}
