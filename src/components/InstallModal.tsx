import { CheckCircle2, Download, PlusSquare, Share, Smartphone, X } from 'lucide-react';
import { useEffect } from 'react';
import { getDir, TRANSLATIONS } from '../i18n';
import type { Lang } from '../types/transit';

interface InstallModalProps {
  open: boolean;
  lang: Lang;
  isIos: boolean;
  canPromptInstall: boolean;
  onTriggerNativeInstall: () => void;
  onClose: () => void;
}

export function InstallModal({
  open,
  lang,
  isIos,
  canPromptInstall,
  onTriggerNativeInstall,
  onClose,
}: InstallModalProps) {
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

  const iosCard = (
    <div className="rounded-lg border border-[#DCE6EE] dark:border-[#183550] bg-[#F6FAFC] dark:bg-[#0D2236] p-3.5 space-y-2.5">
      <div className="flex items-center gap-2 text-xs font-semibold text-[#041626] dark:text-[#EFF6FA]">
        <Smartphone className="w-4 h-4 text-[#0155A6] dark:text-[#38BDF8] shrink-0" strokeWidth={1.75} />
        <span>{t.pwa.iosHintTitle}</span>
      </div>
      <ol className="space-y-2 text-xs text-[#4A657A] dark:text-[#85A3BC]">
        <li className="flex items-start gap-2.5">
          <span
            dir="ltr"
            className="w-5 h-5 rounded-full bg-white dark:bg-[#081828] border border-[#DCE6EE] dark:border-[#183550] text-[11px] font-bold text-[#0155A6] dark:text-[#38BDF8] inline-flex items-center justify-center shrink-0 tabular-nums"
          >
            1
          </span>
          <span className="flex items-center gap-1.5 pt-0.5 leading-relaxed">
            <Share className="w-3.5 h-3.5 text-[#0155A6] dark:text-[#38BDF8] shrink-0" strokeWidth={1.75} />
            <span>{t.pwa.iosStep1}</span>
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <span
            dir="ltr"
            className="w-5 h-5 rounded-full bg-white dark:bg-[#081828] border border-[#DCE6EE] dark:border-[#183550] text-[11px] font-bold text-[#0155A6] dark:text-[#38BDF8] inline-flex items-center justify-center shrink-0 tabular-nums"
          >
            2
          </span>
          <span className="flex items-center gap-1.5 pt-0.5 leading-relaxed">
            <PlusSquare className="w-3.5 h-3.5 text-[#01A069] dark:text-[#34D399] shrink-0" strokeWidth={1.75} />
            <span>{t.pwa.iosStep2}</span>
          </span>
        </li>
      </ol>
    </div>
  );

  const androidCard = (
    <div className="rounded-lg border border-[#DCE6EE] dark:border-[#183550] bg-[#F6FAFC] dark:bg-[#0D2236] p-3.5 space-y-2.5">
      <div className="flex items-center gap-2 text-xs font-semibold text-[#041626] dark:text-[#EFF6FA]">
        <Download className="w-4 h-4 text-[#01A069] dark:text-[#34D399] shrink-0" strokeWidth={1.75} />
        <span>{t.pwa.androidHintTitle}</span>
      </div>
      <p className="text-xs text-[#4A657A] dark:text-[#85A3BC] leading-relaxed">
        {t.pwa.androidStep1}
      </p>
      {canPromptInstall && (
        <button
          type="button"
          onClick={onTriggerNativeInstall}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#0155A6] hover:bg-[#014486] dark:bg-[#01A069] dark:hover:bg-[#018557] text-white text-xs font-semibold transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
          <span>{t.pwa.installNow}</span>
        </button>
      )}
    </div>
  );

  return (
    <div
      dir={dir}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-title"
      data-testid="pwa-install-modal"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#041626]/55 backdrop-blur-xs"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-[#DCE6EE] dark:border-[#183550] bg-white dark:bg-[#081828] shadow-xl overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-[#DCE6EE] dark:border-[#183550]">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/pwa-192x192.png"
              alt={t.app.brand}
              className="w-9 h-9 rounded-lg border border-[#DCE6EE] dark:border-[#183550] bg-[#F2F7FA] dark:bg-[#0D2236] object-contain p-1 shrink-0"
            />
            <div className="min-w-0">
              <h2
                id="pwa-install-title"
                className="text-sm font-bold text-[#041626] dark:text-[#EFF6FA] truncate"
              >
                {t.pwa.modalTitle}
              </h2>
              <p className="text-[11px] text-[#526D82] dark:text-[#85A3BC] truncate">
                {t.app.brand}
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

        <div className="p-4 space-y-3">
          <p className="text-xs text-[#4A657A] dark:text-[#85A3BC] leading-relaxed">
            {t.pwa.modalSubtitle}
          </p>

          {isIos ? (
            <>
              {iosCard}
              {androidCard}
            </>
          ) : (
            <>
              {androidCard}
              {iosCard}
            </>
          )}

          <div className="flex items-center gap-2 pt-1 text-[11px] text-[#01A069] dark:text-[#34D399]">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
            <span>{t.pwa.offlineReady}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
