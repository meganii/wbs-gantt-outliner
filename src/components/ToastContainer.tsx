import { useEffect } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, XCircle, X } from 'lucide-react';
import {
  useNotificationStore,
  type AppNotification,
  type NotificationLevel,
} from '../store/useNotificationStore';

/** レベルごとの自動消滅までの時間(ms)。null は手動で閉じるまで残る。 */
const AUTO_DISMISS_MS: Record<NotificationLevel, number | null> = {
  info: 5000,
  warning: 12000,
  error: null,
};

const LEVEL_STYLES: Record<NotificationLevel, string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  error: 'border-red-300 bg-red-50 text-red-800',
};

function LevelIcon({ level }: { level: NotificationLevel }) {
  if (level === 'error') return <XCircle size={14} className="mt-0.5 shrink-0" />;
  if (level === 'warning') return <AlertTriangle size={14} className="mt-0.5 shrink-0" />;
  return <CheckCircle2 size={14} className="mt-0.5 shrink-0" />;
}

function Toast({
  notification,
  onDismiss,
}: {
  notification: AppNotification;
  onDismiss: (id: string) => void;
}) {
  const { id, level, message, details } = notification;

  useEffect(() => {
    const ms = AUTO_DISMISS_MS[level];
    if (ms === null) return;
    const timer = window.setTimeout(() => onDismiss(id), ms);
    return () => window.clearTimeout(timer);
  }, [id, level, onDismiss]);

  return (
    <div
      role="alert"
      className={clsx(
        'pointer-events-auto rounded-md border px-3 py-2 shadow-md',
        LEVEL_STYLES[level]
      )}
    >
      <div className="flex items-start gap-2">
        <LevelIcon level={level} />
        <span className="flex-1 text-xs leading-5">{message}</span>
        <button
          type="button"
          onClick={() => onDismiss(id)}
          aria-label="通知を閉じる"
          className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
        >
          <X size={12} />
        </button>
      </div>
      {details && details.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-6 text-[10px] leading-4 opacity-90">
          {details.map((detail, index) => (
            <li key={`${id}-${index}`}>{detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 画面右下に通知を表示する。警告・情報は自動で消え、エラーは手動で閉じるまで残る。
 * （右上はズーム等の操作系と重なるため、右下に固定する）
 */
export function ToastContainer() {
  const notifications = useNotificationStore((state) => state.notifications);
  const dismiss = useNotificationStore((state) => state.dismiss);

  if (notifications.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-9 right-4 z-[100] flex w-80 max-w-[80vw] flex-col gap-2"
      aria-live="polite"
    >
      {notifications.map((notification) => (
        <Toast key={notification.id} notification={notification} onDismiss={dismiss} />
      ))}
    </div>
  );
}
