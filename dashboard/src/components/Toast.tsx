import { useState, useEffect, useCallback } from 'react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

const ICONS: Record<ToastMessage['type'], string> = {
  success: 'check_circle',
  error: 'error',
  info: 'info',
};

const BG_COLORS: Record<ToastMessage['type'], string> = {
  success: '#16a34a',
  error: '#dc2626',
  info: '#1e40af',
};

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const push = useCallback((type: ToastMessage['type'], text: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, push, dismiss };
}

export default function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all duration-300 cursor-pointer ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
      style={{ backgroundColor: BG_COLORS[toast.type], color: '#ffffff' }}
      onClick={() => onDismiss(toast.id)}
    >
      <span className="material-symbols-outlined text-[18px]">{ICONS[toast.type]}</span>
      <span className="flex-1">{toast.text}</span>
      <span className="material-symbols-outlined text-[16px] opacity-70 hover:opacity-100">close</span>
    </div>
  );
}
