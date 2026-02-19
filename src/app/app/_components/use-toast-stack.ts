"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppToast, AppToastTone } from "./toast-stack";

const DEFAULT_TOAST_DURATION_MS = 6500;

export default function useToastStack(defaultDurationMs = DEFAULT_TOAST_DURATION_MS) {
  const [toasts, setToasts] = useState<AppToast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((previous) => previous.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (
      message: string,
      tone: AppToastTone = "info",
      durationMs: number = defaultDurationMs
    ) => {
      const safeDurationMs = Math.max(1200, Math.round(durationMs));
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setToasts((previous) => [...previous, { id, message, tone, durationMs: safeDurationMs }]);

      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((previous) => previous.filter((toast) => toast.id !== id));
      }, safeDurationMs);
      timersRef.current.set(id, timer);
    },
    [defaultDurationMs]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  return { toasts, pushToast, dismissToast };
}
