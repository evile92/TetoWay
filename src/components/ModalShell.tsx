import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { getDir, TRANSLATIONS } from '../i18n';
import type { Lang } from '../types/transit';

interface ModalShellProps {
  open: boolean;
  lang: Lang;
  titleId: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
  testId: string;
  onClose: () => void;
  children: ReactNode;
}

/** Shared accessible dialog shell preserving TetoWay surface depth and BiDi isolation. */
export function ModalShell({
  open,
  lang,
  titleId,
  title,
  subtitle,
  icon,
  testId,
  onClose,
  children,
}: ModalShellProps) {
  const t = TRANSLATIONS[lang];
  const dir = getDir(lang);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      dir={dir}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid={testId}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#041626]/55 backdrop-blur-xs"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-[#DCE6EE] dark:border-[#183550] bg-white dark:bg-[#081828] shadow-xl overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-[#DCE6EE] dark:border-[#183550]">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon}
            <div className="min-w-0">
              <h2
                id={titleId}
                className="text-sm font-bold text-[#041626] dark:text-[#EFF6FA] truncate"
              >
                {title}
              </h2>
              <p className="text-[11px] text-[#526D82] dark:text-[#85A3BC] truncate">
                {subtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t.pwa.close}
            className="w-7 h-7 rounded-md inline-flex items-center justify-center text-[#526D82] dark:text-[#85A3BC] hover:bg-[#F2F7FA] dark:hover:bg-[#0D2236] hover:text-[#041626] dark:hover:text-[#EFF6FA] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="p-4 space-y-3">{children}</div>
      </div>
    </div>
  );
}
