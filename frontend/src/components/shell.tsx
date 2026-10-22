"use client";
import { useI18n } from "@/i18n/provider";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { LanguageSelector } from "./language-selector";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  Check,
  ChevronRight,
  CircleHelp,
  Columns3,
  LayoutDashboard,
  Menu,
  Moon,
  Play,
  Settings2,
  ShieldCheck,
  Sun,
  Upload,
  X,
} from "lucide-react";
import { api, type ConnectionStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function navigation(t: ReturnType<typeof useI18n>["t"]) {
  return [
    { href: "/", label: t("nav.overview"), icon: LayoutDashboard },
    {
      href: "/reconciliation",
      label: t("nav.reconciliation"),
      icon: ArrowLeftRight,
    },
    { href: "/imports", label: t("nav.imports"), icon: Upload },
    { href: "/runs", label: t("runs.title"), icon: Play },
    { href: "/reports", label: t("reports.title"), icon: BarChart3 },
    { href: "/settings", label: t("settings.title"), icon: Settings2 },
  ];
}
export function Shell({ children }: { children: React.ReactNode }) {
  const { t, number } = useI18n();
  const items = navigation(t);
  const sidebar = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const connection = useQuery({
    queryKey: ["connection"],
    queryFn: () => api<ConnectionStatus>("connection"),
  });
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = sidebar.current;
    const controls = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>('a, button, [tabindex="0"]') ?? [],
      ).filter((element) => element.getClientRects().length);
    controls()[0]?.focus();
    function trap(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const elements = controls();
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", trap);
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", trap);
      document.body.style.overflow = before;
      previous?.focus();
    };
  }, [open]);
  const current =
    items.find((item) => item.href === pathname)?.label ?? t("nav.overview");
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        {t("shell.skip")}
      </a>
      {open && (
        <button
          className="nav-overlay"
          aria-label={t("shell.closeNav")}
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        ref={sidebar}
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        className={`sidebar ${open ? "open" : ""}`}
        aria-label={t("shell.mainNav")}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <button
          className="close-menu"
          aria-label={t("shell.closeNav")}
          onClick={() => setOpen(false)}
        >
          <X size={16} />
        </button>
        <Link href="/" className="brand" onClick={() => setOpen(false)}>
          <span className="brand-mark">
            <Columns3 size={20} strokeWidth={2.5} />
          </span>
          clearledger
          <span className="text-muted" style={{ fontSize: 18, marginLeft: -9 }}>
            .
          </span>
        </Link>
        <div className="workspace-label">
          <span className="workspace-icon">
            <Building2 size={16} />
          </span>
          <div>
            <strong style={{ fontWeight: 550 }}>
              {t("shell.financeWorkspace")}
            </strong>
            <div className="text-muted" style={{ fontSize: 10, marginTop: 2 }}>
              {t("shell.localEnvironment")}
            </div>
          </div>
          <ShieldCheck
            size={13}
            className="text-muted"
            style={{ marginLeft: "auto" }}
          />
        </div>
        <div className="nav-label">{t("shell.workspace")}</div>
        <nav>
          {items.slice(0, 5).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`nav-link ${pathname === item.href ? "active" : ""}`}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              <item.icon />
              {item.label}
              {item.href === "/reconciliation" && (
                <span className="nav-count">↔</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="local-note">
            <strong>
              <ShieldCheck
                size={13}
                style={{ display: "inline", marginRight: 5 }}
              />
              {t("shell.localData")}
            </strong>
            {t("shell.confidence")}
            <br />
            {t("shell.sources")}
            <Link
              href="/settings"
              className="text-link"
              style={{ display: "block", marginTop: 9 }}
            >
              {t("shell.connectionDetails")}
              <ArrowUpRight size={11} style={{ display: "inline" }} />
            </Link>
          </div>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className={`nav-link ${pathname === "/settings" ? "active" : ""}`}
            aria-current={pathname === "/settings" ? "page" : undefined}
          >
            <Settings2 />
            {t("settings.title")}
          </Link>
          <div className="identity">
            <span className="avatar">CL</span>
            <div>
              <strong style={{ fontWeight: 550 }}>
                {t("shell.localWorkspace")}
              </strong>
              <div
                className="text-muted"
                style={{ fontSize: 10, marginTop: 3 }}
              >
                {t("shell.singleHost")}
              </div>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell" inert={open}>
        <header className="topbar">
          <div className="breadcrumb">
            <Button
              className="mobile-menu"
              size="icon"
              variant="ghost"
              aria-label={t("shell.openNav")}
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Menu size={18} />
            </Button>
            <span>{t("shell.workspace")}</span>
            <ChevronRight size={12} />
            <strong>{current}</strong>
          </div>
          <div className="top-actions">
            <Link
              href="/settings"
              className="connection-text text-muted"
              style={{ fontSize: 11 }}
            >
              <span
                className="connection-dot"
                style={
                  connection.data?.connected
                    ? undefined
                    : { background: "var(--warning)" }
                }
              />
              {connection.isPending
                ? t("shell.checkingApi")
                : connection.data?.connected
                  ? t("shell.apiConnected")
                  : t("shell.connectApi")}
            </Link>
            <LanguageSelector />
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("shell.theme")}
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              <Sun size={17} className="hidden dark:block" />
              <Moon size={17} className="dark:hidden" />
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("shell.guide")}
                >
                  <CircleHelp size={17} />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("shell.guideTitle")}</DialogTitle>
                  <DialogDescription>
                    {t("shell.guideDescription")}
                  </DialogDescription>
                </DialogHeader>
                <div className="guide-list">
                  {[
                    [t("shell.guide1Title"), t("shell.guide1Body")],
                    [t("shell.guide2Title"), t("shell.guide2Body")],
                    [t("shell.guide3Title"), t("shell.guide3Body")],
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
                  <Check
                    size={14}
                    style={{ display: "inline", marginRight: 6 }}
                  />
                  {t("shell.guideNote")}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </header>
        <main id="main" className="content">
          {children}
          <footer className="page-footer">
            <span>
              <ShieldCheck
                size={11}
                style={{ display: "inline", marginRight: 5 }}
              />
              {t("shell.footer")}
            </span>
            <span>{t("shell.footerBrand")}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
