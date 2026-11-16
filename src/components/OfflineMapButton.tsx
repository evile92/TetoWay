import { CheckCircle2, CloudDownload } from 'lucide-react';
import { TRANSLATIONS } from '../i18n';
import type { Lang } from '../types/transit';

interface OfflineMapButtonProps {
  lang: Lang;
  isCached: boolean;
  onClick: () => void;
  testId?: string;
}

/** Compact pill button indicating offline map cache readiness and opening management modal. */
export function OfflineMapButton({
  lang,
  isCached,
  onClick,
  testId = 'offline-map-btn',
}: OfflineMapButtonProps) {
  const t = TRANSLATIONS[lang];

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      title={t.offlineMap.modalTitle}
      aria-label={t.offlineMap.modalTitle}
      className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold transition-colors cursor-pointer ${
        isCached
          ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/70 text-[#01A069] dark:text-[#34D399]'
          : 'bg-[#EEF5F9] dark:bg-[#0D2236] border-[#DCE6EE] dark:border-[#183550] text-[#0155A6] dark:text-[#38BDF8] hover:bg-[#E1EEF6] dark:hover:bg-[#132E49]'
      }`}
    >
      {isCached ? (
        <CheckCircle2 className="w-3 h-3 shrink-0" strokeWidth={2} />
      ) : (
        <CloudDownload className="w-3 h-3 shrink-0" strokeWidth={2} />
      )}
      <span>{isCached ? t.offlineMap.readyBadge : t.offlineMap.buttonLabel}</span>
    </button>
  );
}
