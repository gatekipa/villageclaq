"use client";

/**
 * Promise-based confirmation dialog to replace window.confirm().
 *
 * Usage inside a "use client" page:
 *   const confirm = useConfirmDialog();
 *   const ok = await confirm({
 *     title: t("cancelMeetingConfirmTitle"),
 *     description: t("cancelMeetingConfirm"),
 *     confirmLabel: t("confirm"),
 *     cancelLabel: tc("cancel"),
 *     destructive: true,
 *   });
 *   if (!ok) return;
 *
 * Renders at the root via <ConfirmDialogProvider> which is mounted in
 * src/lib/providers.tsx so every dashboard page has access.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type Resolver = (value: boolean) => void;

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<Resolver | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOptions(opts);
      setOpen(true);
    });
  }, []);

  const close = (value: boolean) => {
    setOpen(false);
    resolverRef.current?.(value);
    resolverRef.current = null;
    // Leave options mounted briefly so the dialog's exit animation
    // can render against the last label set.
    setTimeout(() => setOptions(null), 200);
  };

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={(next) => { if (!next) close(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{options?.title ?? ""}</DialogTitle>
            {options?.description && (
              <DialogDescription>{options.description}</DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              {options?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={options?.destructive ? "destructive" : "default"}
              onClick={() => close(true)}
            >
              {options?.confirmLabel ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirmDialog(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Fail-safe fallback — never block callers if the provider is missing.
    return async (opts) => {
      if (typeof window === "undefined") return true;
      // eslint-disable-next-line no-alert
      return window.confirm(`${opts.title}${opts.description ? "\n\n" + opts.description : ""}`);
    };
  }
  return ctx;
}
