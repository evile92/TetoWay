import { CheckCircle2, CloudDownload, Trash2, Wifi, WifiOff } from 'lucide-react';
import { TRANSLATIONS } from '../i18n';
import type { Lang } from '../types/transit';
import { ModalShell } from './ModalShell';

interface OfflineMapModalProps {
  open: boolean;
  lang: Lang;
  isCached: boolean;
  isDownloading: boolean;
  progress: number;
  error: boolean;
  onStartDownload: () => void;
  onRemoveCache: () => void;
  onClose: () => void;
}

export function OfflineMapModal({
  open,
  lang,
  isCached,
  isDownloading,
  progress,
  error,
  onStartDownload,
  onRemoveCache,
  onClose,
}: OfflineMapModalProps) {
  const t = TRANSLATIONS[lang];

  return (
    <ModalShell
      open={open}
      lang={lang}
      titleId="offline-map-title"
      title={t.offlineMap.modalTitle}
      subtitle={t.app.brand}
      testId="offline-map-modal"
      onClose={onClose}
      icon={
        <div className="w-9 h-9 rounded-lg border border-[#DCE6EE] dark:border-[#183550] bg-[#F2F7FA] dark:bg-[#0D2236] inline-flex items-center justify-center shrink-0">
          {isCached ? (
            <CheckCircle2 className="w-5 h-5 text-[#01A069] dark:text-[#34D399]" strokeWidth={1.75} />
          ) : (
            <WifiOff className="w-5 h-5 text-[#0155A6] dark:text-[#38BDF8]" strokeWidth={1.75} />
          )}
        </div>
      }
    >
      <p className="text-xs text-[#4A657A] dark:text-[#85A3BC] leading-relaxed">
        {t.offlineMap.modalSubtitle}
      </p>

      <div className="rounded-lg border border-[#DCE6EE] dark:border-[#183550] bg-[#F6FAFC] dark:bg-[#0D2236] p-3.5 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#041626] dark:text-[#EFF6FA]">
          {isCached ? (
            <CheckCircle2 className="w-4 h-4 text-[#01A069] dark:text-[#34D399] shrink-0" strokeWidth={1.75} />
          ) : (
            <Wifi className="w-4 h-4 text-[#0155A6] dark:text-[#38BDF8] shrink-0" strokeWidth={1.75} />
          )}
          <span>{isCached ? t.offlineMap.statusReadyTitle : t.offlineMap.statusNotReadyTitle}</span>
        </div>
        <p className="text-xs text-[#4A657A] dark:text-[#85A3BC] leading-relaxed">
          {isCached ? t.offlineMap.statusReadyDesc : t.offlineMap.statusNotReadyDesc}
        </p>
      </div>

      {isDownloading && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-[#041626] dark:text-[#EFF6FA]">
            <span>{t.offlineMap.downloading}</span>
            <span dir="ltr" className="tabular-nums text-[#0155A6] dark:text-[#34D399]">
              {progress}%
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-[#E6EFF5] dark:bg-[#0D2236] overflow-hidden">
            <div
              className="h-full bg-[#0155A6] dark:bg-[#01A069] transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-rose-600 dark:text-rose-400">{t.offlineMap.downloadError}</p>
      )}

      <div className="flex items-center gap-2 pt-1">
        {!isCached && !isDownloading && (
          <button
            type="button"
            onClick={onStartDownload}
            data-testid="start-offline-download"
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#0155A6] hover:bg-[#014486] dark:bg-[#01A069] dark:hover:bg-[#018557] text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <CloudDownload className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            <span>{t.offlineMap.downloadButton}</span>
          </button>
        )}

        {isCached && !isDownloading && (
          <button
            type="button"
            onClick={onRemoveCache}
            data-testid="remove-offline-map"
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-[#DCE6EE] dark:border-[#183550] bg-[#F6FAFC] dark:bg-[#0D2236] hover:bg-[#EEF5F9] dark:hover:bg-[#132E49] text-xs font-medium text-[#4A657A] dark:text-[#85A3BC] transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
            <span>{t.offlineMap.removeButton}</span>
          </button>
        )}
      </div>
    </ModalShell>
  );
}
