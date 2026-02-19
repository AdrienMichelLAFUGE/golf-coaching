"use client";

export type AppToastTone = "info" | "success" | "error";

export type AppToast = {
  id: string;
  message: string;
  tone: AppToastTone;
  durationMs?: number;
};

const TOAST_TONE_CLASSES: Record<AppToastTone, string> = {
  info: "border-sky-300/35 bg-sky-500/15 text-sky-100",
  success: "border-emerald-300/35 bg-emerald-500/15 text-emerald-100",
  error: "border-rose-300/35 bg-rose-500/15 text-rose-100",
};

const TOAST_PROGRESS_TONE_CLASSES: Record<AppToastTone, string> = {
  info: "bg-sky-100",
  success: "bg-emerald-100",
  error: "bg-rose-100",
};

export default function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: AppToast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-4 top-20 z-[120] ml-auto flex w-auto max-w-sm flex-col gap-2"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto relative overflow-hidden rounded-2xl border px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.35)] ${TOAST_TONE_CLASSES[toast.tone]}`}
          role="status"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-medium leading-relaxed">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-[0.58rem] uppercase tracking-wide text-white/90 transition hover:bg-white/20"
              aria-label="Fermer la notification"
            >
              Fermer
            </button>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1.5 bg-black/35">
            <div
              className={`h-full origin-left [animation-name:app-toast-progress] [animation-fill-mode:forwards] [animation-timing-function:linear] motion-reduce:[animation-duration:0ms] ${TOAST_PROGRESS_TONE_CLASSES[toast.tone]}`}
              style={{ animationDuration: `${toast.durationMs ?? 6500}ms` }}
            />
          </div>
        </div>
      ))}
      <style jsx global>{`
        @keyframes app-toast-progress {
          from {
            transform: scaleX(1);
          }
          to {
            transform: scaleX(0);
          }
        }
      `}</style>
    </div>
  );
}
