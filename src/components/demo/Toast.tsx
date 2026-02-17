import styles from "./demo.module.css";

export type DemoToast = {
  id: string;
  message: string;
  tone?: "success" | "info";
};

type ToastProps = {
  toasts: DemoToast[];
};

export default function Toast({ toasts }: ToastProps) {
  if (toasts.length === 0) return null;

  return (
    <div className={styles.toastStack} aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`${styles.toast} ${toast.tone === "success" ? styles.toastSuccess : ""}`}
          role="status"
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
