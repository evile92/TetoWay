import {
  Crosshair,
  Download,
  Layers,
  Maximize2,
  Moon,
  PencilRuler,
  RotateCcw,
  Sun,
} from 'lucide-react';
import { resolveHubName, TRANSLATIONS } from '../i18n';
import type { AppMode, BusLine, Lang, MapPickMode, Theme } from '../types/transit';
import { BidiText, LineBadge } from './BidiText';

interface TopBarProps {
  lang: Lang;
  onChangeLang: (lang: Lang) => void;
  theme: Theme;
  onToggleTheme: () => void;
  mode: AppMode;
  onChangeMode: (mode: AppMode) => void;
  showOsmStops: boolean;
  onToggleOsmStops: () => void;
  osmStopCount: number;
  selectedLine: BusLine | null;
  onFitSelectedLine: () => void;
  onResetMapView: () => void;
  pickMode: MapPickMode;
  onCancelPickMode: () => void;
  showInstallButton: boolean;
  onInstallApp: () => void;
}

export function TopBar({
  lang,
  onChangeLang,
  theme,
  onToggleTheme,
  mode,
  onChangeMode,
  showOsmStops,
  onToggleOsmStops,
  osmStopCount,
  selectedLine,
  onFitSelectedLine,
  onResetMapView,
  pickMode,
  onCancelPickMode,
  showInstallButton,
  onInstallApp,
}: TopBarProps) {
  const t = TRANSLATIONS[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  const pickPrompt =
    pickMode === 'near_me'
      ? t.planner.pickOnMapActive
      : pickMode === 'trip_origin'
        ? t.planner.pickingPointA
        : pickMode === 'trip_destination'
          ? t.planner.pickingPointB
          : pickMode === 'editor_add_stop'
            ? t.editor.addStopActiveHint
            : null;

  return (
    <header
      dir={dir}
      className="pointer-events-none absolute top-[calc(0.75rem+env(safe-area-inset-top))] inset-x-3 z-20 flex flex-wrap items-center justify-between gap-2"
    >
      {/* Left / Start Context Cluster */}
      <div className="pointer-events-auto flex items-center gap-2 flex-wrap">
        {/* Mobile Brand Badge */}
        <div className="flex md:hidden items-center gap-1.5 bg-white dark:bg-[#081828] border border-[#DCE6EE] dark:border-[#183550] rounded-lg px-2.5 py-1.5 shadow-sm">
          <img
            src="/logo-pin.png"
            alt={t.app.brand}
            className="w-5 h-5 object-contain shrink-0"
          />
          <span className="text-xs font-bold tracking-tight text-[#041626] dark:text-[#EFF6FA] whitespace-nowrap">
            {t.app.brand}
          </span>
        </div>

        {/* Active Pick Mode Banner */}
        {pickPrompt && (
          <div className="flex items-center gap-2 bg-[#0155A6] dark:bg-[#0284C7] text-white rounded-lg px-3 py-1.5 shadow-sm">
            <Crosshair className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            <span className="text-xs font-medium">{pickPrompt}</span>
            <button
              type="button"
              onClick={onCancelPickMode}
              className="ms-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 transition-colors cursor-pointer"
            >
              {t.planner.clearTrip}
            </button>
          </div>
        )}

        {/* Active Line Context Bar (Desktop) */}
        {!pickPrompt && selectedLine && mode !== 'planner' && (
          <div className="hidden md:flex items-center gap-2 bg-white dark:bg-[#081828] border border-[#DCE6EE] dark:border-[#183550] rounded-lg px-2.5 py-1.5 shadow-sm max-w-full">
            <LineBadge number={selectedLine.number} color={selectedLine.color} size="sm" />
            <span className="text-xs font-medium text-[#041626] dark:text-[#EFF6FA] flex items-center gap-1.5 min-w-0">
              <BidiText
                label={{
                  text: resolveHubName(selectedLine.origin_key, lang),
                  dir,
                }}
                className="truncate max-w-[115px] xl:max-w-[145px]"
              />
              <span className="text-[#85A3BC] dark:text-[#4A657A] shrink-0">{lang === 'ar' ? '←' : '→'}</span>
              <BidiText
                label={{
                  text: resolveHubName(selectedLine.destination_key, lang),
                  dir,
                }}
                className="truncate max-w-[125px] xl:max-w-[155px]"
              />
            </span>
            <span className="h-3.5 w-px bg-[#DCE6EE] dark:bg-[#183550] shrink-0" />
            <button
              type="button"
              onClick={onFitSelectedLine}
              title={t.map.fitRoute}
              className="shrink-0 whitespace-nowrap inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium text-[#4A657A] dark:text-[#85A3BC] hover:text-[#041626] dark:hover:text-[#EFF6FA] hover:bg-[#F2F7FA] dark:hover:bg-[#0D2236] transition-colors cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
              <span>{t.map.fitRoute}</span>
            </button>
          </div>
        )}

        {/* Reset View Button (Desktop) */}
        {!pickPrompt && !selectedLine && mode !== 'planner' && (
          <button
            type="button"
            onClick={onResetMapView}
            className="hidden md:inline-flex items-center gap-1.5 bg-white dark:bg-[#081828] border border-[#DCE6EE] dark:border-[#183550] hover:bg-[#F4F8FB] dark:hover:bg-[#0D2236] text-xs font-medium text-[#041626] dark:text-[#EFF6FA] rounded-lg px-2.5 py-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#01A069] dark:text-[#34D399]" strokeWidth={1.75} />
            <span>{t.map.resetView}</span>
          </button>
        )}
      </div>

      {/* Unified Docked Architectural Toolbar */}
      <div className="pointer-events-auto inline-flex items-center divide-x rtl:divide-x-reverse divide-[#DCE6EE] dark:divide-[#183550] bg-white dark:bg-[#081828] border border-[#DCE6EE] dark:border-[#183550] rounded-lg shadow-sm overflow-hidden">
        {/* OSM Stops Toggle */}
        <button
          type="button"
          onClick={onToggleOsmStops}
          aria-pressed={showOsmStops}
          data-testid="toggle-osm-stops"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
            showOsmStops
              ? 'bg-[#E6F4FA] dark:bg-[#0B2D48] text-[#0155A6] dark:text-[#38BDF8]'
              : 'text-[#041626] dark:text-[#EFF6FA] hover:bg-[#F4F8FB] dark:hover:bg-[#0D2236]'
          }`}
        >
          <Layers className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
          <span className="hidden sm:inline whitespace-nowrap">
            {showOsmStops ? t.nav.hideOsm : t.nav.showOsm}
          </span>
          <span dir="ltr" className="tabular-nums text-[11px] text-[#526D82] dark:text-[#85A3BC]">
            {osmStopCount}
          </span>
        </button>

        {/* Editor Mode Toggle */}
        <button
          type="button"
          onClick={() => onChangeMode(mode === 'editor' ? 'explorer' : 'editor')}
          aria-pressed={mode === 'editor'}
          data-testid="toggle-editor-mode"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
            mode === 'editor'
              ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
              : 'text-[#041626] dark:text-[#EFF6FA] hover:bg-[#F4F8FB] dark:hover:bg-[#0D2236]'
          }`}
        >
          <PencilRuler className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
          <span className="whitespace-nowrap">{t.nav.editor}</span>
        </button>

        {/* Install PWA Button */}
        {showInstallButton && (
          <button
            type="button"
            onClick={onInstallApp}
            data-testid="pwa-install-btn"
            title={t.pwa.installButton}
            aria-label={t.pwa.installButton}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#0155A6] dark:text-[#34D399] hover:bg-[#F4F8FB] dark:hover:bg-[#0D2236] transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
            <span className="hidden 2xl:inline whitespace-nowrap">{t.pwa.installButton}</span>
          </button>
        )}

        {/* Day / Night Theme Toggle */}
        <button
          type="button"
          onClick={onToggleTheme}
          data-testid="toggle-theme"
          aria-label={theme === 'dark' ? t.nav.lightTheme : t.nav.darkTheme}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#041626] dark:text-[#EFF6FA] hover:bg-[#F4F8FB] dark:hover:bg-[#0D2236] transition-colors cursor-pointer"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" strokeWidth={1.75} />
              <span className="hidden sm:inline whitespace-nowrap">{t.nav.lightTheme}</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-[#0155A6] shrink-0" strokeWidth={1.75} />
              <span className="hidden sm:inline whitespace-nowrap">{t.nav.darkTheme}</span>
            </>
          )}
        </button>

        {/* Language Switcher (EN LTR / AR RTL) */}
        <div className="inline-flex items-center" role="group">
          <button
            type="button"
            dir="ltr"
            onClick={() => onChangeLang('en')}
            data-testid="lang-en"
            className={`px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              lang === 'en'
                ? 'bg-[#041626] text-white dark:bg-[#01A069] dark:text-white'
                : 'text-[#4A657A] dark:text-[#85A3BC] hover:bg-[#F4F8FB] dark:hover:bg-[#0D2236]'
            }`}
          >
            {TRANSLATIONS.en.nav.langBadge}
          </button>
          <button
            type="button"
            dir="rtl"
            onClick={() => onChangeLang('ar')}
            data-testid="lang-ar"
            className={`px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              lang === 'ar'
                ? 'bg-[#041626] text-white dark:bg-[#01A069] dark:text-white'
                : 'text-[#4A657A] dark:text-[#85A3BC] hover:bg-[#F4F8FB] dark:hover:bg-[#0D2236]'
            }`}
          >
            {TRANSLATIONS.ar.nav.langBadge}
          </button>
        </div>
      </div>
    </header>
  );
}
