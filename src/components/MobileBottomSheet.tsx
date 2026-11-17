import { ChevronDown, ChevronUp, Compass, Route } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useRef } from 'react';
import { TRANSLATIONS } from '../i18n';
import type { AppMode, Lang, SheetSnap } from '../types/transit';
import { ContactFooter } from './ContactFooter';
import { OfflineMapButton } from './OfflineMapButton';

interface MobileBottomSheetProps {
  lang: Lang;
  mode: AppMode;
  onChangeMode: (mode: AppMode) => void;
  snap: SheetSnap;
  onChangeSnap: (snap: SheetSnap) => void;
  offlineSupported: boolean;
  isOfflineCached: boolean;
  onOpenOfflineModal: () => void;
  onOpenReport: () => void;
  children: ReactNode;
}

export function MobileBottomSheet({
  lang,
  mode,
  onChangeMode,
  snap,
  onChangeSnap,
  offlineSupported,
  isOfflineCached,
  onOpenOfflineModal,
  onOpenReport,
  children,
}: MobileBottomSheetProps) {
  const t = TRANSLATIONS[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const dragStartY = useRef<number | null>(null);

  const heightClass =
    snap === 'collapsed'
      ? 'h-[76px]'
      : snap === 'half'
        ? 'h-[48dvh]'
        : 'h-[84dvh]';

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    dragStartY.current = e.clientY;
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (dragStartY.current === null) return;
    const deltaY = e.clientY - dragStartY.current;
    dragStartY.current = null;

    if (Math.abs(deltaY) < 20) return;

    if (deltaY < -20) {
      if (snap === 'collapsed') onChangeSnap('half');
      else if (snap === 'half') onChangeSnap('expanded');
    } else if (deltaY > 20) {
      if (snap === 'expanded') onChangeSnap('half');
      else if (snap === 'half') onChangeSnap('collapsed');
    }
  }

  function cycleSnap() {
    if (snap === 'collapsed') onChangeSnap('half');
    else if (snap === 'half') onChangeSnap('expanded');
    else onChangeSnap('collapsed');
  }

  return (
    <div
      dir={dir}
      data-testid="mobile-bottom-sheet"
      className={`md:hidden fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-[#081828] border-t border-[#DCE6EE] dark:border-[#183550] rounded-t-xl shadow-lg flex flex-col transition-[height] duration-200 ease-out ${heightClass}`}
    >
      <div
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        className="shrink-0 px-3.5 pt-2 pb-2 border-b border-[#DCE6EE] dark:border-[#183550] touch-none"
      >
        <div className="flex justify-center mb-1.5">
          <div className="w-9 h-1 rounded-full bg-[#C4D6E2] dark:bg-[#1B3B59]" />
        </div>

        <div className="flex items-center justify-between gap-2">
          {mode === 'editor' ? (
            <div className="text-xs font-semibold text-amber-700 dark:text-amber-300 px-1">
              {t.editor.bannerTitle}
            </div>
          ) : (
            <div className="inline-flex items-center bg-[#F2F7FA] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => {
                  onChangeMode('explorer');
                  if (snap === 'collapsed') onChangeSnap('half');
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  mode === 'explorer'
                    ? 'bg-white dark:bg-[#081828] text-[#041626] dark:text-[#EFF6FA] shadow-xs'
                    : 'text-[#526D82] dark:text-[#85A3BC]'
                }`}
              >
                <Compass className="w-3.5 h-3.5 text-[#0155A6] dark:text-[#34D399]" strokeWidth={1.75} />
                <span>{t.nav.explorer}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onChangeMode('planner');
                  if (snap === 'collapsed') onChangeSnap('half');
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  mode === 'planner'
                    ? 'bg-white dark:bg-[#081828] text-[#041626] dark:text-[#EFF6FA] shadow-xs'
                    : 'text-[#526D82] dark:text-[#85A3BC]'
                }`}
              >
                <Route className="w-3.5 h-3.5 text-[#01A069] dark:text-[#38BDF8]" strokeWidth={1.75} />
                <span>{t.nav.planner}</span>
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            {offlineSupported && (
              <OfflineMapButton
                lang={lang}
                isCached={isOfflineCached}
                onClick={onOpenOfflineModal}
                testId="mobile-offline-map-btn"
              />
            )}

            <button
              type="button"
              onClick={cycleSnap}
              aria-label={snap === 'expanded' ? t.sheet.collapse : t.sheet.expand}
              data-testid="mobile-sheet-toggle"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F2F7FA] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] text-xs font-medium text-[#041626] dark:text-[#EFF6FA] cursor-pointer"
            >
              {snap === 'expanded' ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>{t.sheet.collapse}</span>
                </>
              ) : (
                <>
                  <ChevronUp className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>{t.sheet.expand}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {snap !== 'collapsed' && (
        <>
          <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
          <ContactFooter
            lang={lang}
            onOpenReport={onOpenReport}
            className="pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
          />
        </>
      )}
    </div>
  );
}
