import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Flag,
  MapPin,
  Radio,
  Search,
  Star,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatMad, resolveHubName, resolveStopLabel, TRANSLATIONS } from '../i18n';
import type {
  BusLine,
  BusStop,
  DirectionMode,
  Lang,
  LineCategoryFilter,
} from '../types/transit';
import { buildShareUrl } from '../utils/deepLink';
import { normalizeSearchText } from '../utils/stopSearch';
import { getLineServiceStatus } from '../utils/transitSchedule';
import { BidiText, LineBadge } from './BidiText';
import { ShareButton } from './ShareButton';

interface LineExplorerProps {
  lang: Lang;
  lines: BusLine[];
  selectedLine: BusLine | null;
  direction: DirectionMode;
  favoriteIds: string[];
  onToggleFavorite: (lineId: string) => void;
  onSelectLine: (line: BusLine | null) => void;
  onChangeDirection: (dir: DirectionMode) => void;
  onFocusStop: (stop: BusStop) => void;
  onReportLine: (line: BusLine) => void;
  onStartRideLine: (line: BusLine, direction: DirectionMode) => void;
}

interface LineListRowProps {
  line: BusLine;
  lang: Lang;
  now: Date;
  isFavorite: boolean;
  onSelectLine: (line: BusLine) => void;
  onToggleFavorite: (lineId: string) => void;
}

function LineListRow({
  line,
  lang,
  now,
  isFavorite,
  onSelectLine,
  onToggleFavorite,
}: LineListRowProps) {
  const t = TRANSLATIONS[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const status = getLineServiceStatus(line.first_departure, line.last_departure, now);

  return (
    <div className="flex items-center hover:bg-[#F4F8FB] dark:hover:bg-[#0D2236] transition-colors">
      <button
        type="button"
        onClick={() => onSelectLine(line)}
        data-testid={`line-card-${line.id}`}
        className="flex-1 min-w-0 text-start flex items-center gap-3 ps-3.5 pe-2 py-2.5 cursor-pointer"
      >
        <LineBadge number={line.number} color={line.color} size="md" />

        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-[#041626] dark:text-[#EFF6FA] truncate">
            <BidiText label={{ text: resolveHubName(line.origin_key, lang), dir }} />
          </div>
          <div className="text-[11px] text-[#526D82] dark:text-[#85A3BC] truncate mt-0.5 flex items-center gap-1">
            <span>{lang === 'ar' ? '←' : '→'}</span>
            <BidiText label={{ text: resolveHubName(line.destination_key, lang), dir }} />
          </div>
        </div>

        <div className="shrink-0 text-end space-y-0.5">
          <div className="text-[11px] font-semibold text-[#041626] dark:text-[#EFF6FA] tabular-nums flex items-center justify-end gap-1">
            <span dir="ltr">{formatMad(line.price_mad)}</span>
            <span className="text-[#526D82] dark:text-[#85A3BC] font-normal">
              {t.explorer.currency}
            </span>
          </div>
          <div className="text-[10px] text-[#7C97AE] dark:text-[#6B8BA5] tabular-nums flex items-center justify-end gap-1.5">
            {status && (
              <span
                title={
                  status.isActive
                    ? t.explorer.serviceActive
                    : `${t.explorer.serviceEnded} · ${t.explorer.serviceStarts} ${status.firstDeparture}`
                }
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  status.isActive ? 'bg-[#01A069] dark:bg-[#34D399]' : 'bg-[#94A3B8] dark:bg-[#475569]'
                }`}
              />
            )}
            <span dir="ltr">{line.frequency_mins}</span>
            <span>{t.explorer.minutesUnit}</span>
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={() => onToggleFavorite(line.id)}
        aria-pressed={isFavorite}
        aria-label={isFavorite ? t.explorer.removeFavoriteAria : t.explorer.addFavoriteAria}
        title={isFavorite ? t.explorer.removeFavoriteAria : t.explorer.addFavoriteAria}
        data-testid={`favorite-toggle-${line.id}`}
        className={`shrink-0 p-2 me-1.5 rounded-md transition-colors cursor-pointer ${
          isFavorite
            ? 'text-amber-500 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
            : 'text-[#85A3BC] dark:text-[#4A657A] hover:text-[#041626] dark:hover:text-[#EFF6FA] hover:bg-[#E6EFF5] dark:hover:bg-[#132E47]'
        }`}
      >
        <Star
          className={`w-3.5 h-3.5 ${isFavorite ? 'fill-current' : ''}`}
          strokeWidth={1.75}
        />
      </button>
    </div>
  );
}

export function LineExplorer({
  lang,
  lines,
  selectedLine,
  direction,
  favoriteIds,
  onToggleFavorite,
  onSelectLine,
  onChangeDirection,
  onFocusStop,
  onReportLine,
  onStartRideLine,
}: LineExplorerProps) {
  const t = TRANSLATIONS[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const [category, setCategory] = useState<LineCategoryFilter>('all');
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const counts = useMemo(() => {
    let urban = 0;
    let regional = 0;
    for (const l of lines) {
      if (l.category === 'urban') urban++;
      else regional++;
    }
    return { all: lines.length, urban, regional };
  }, [lines]);

  const filteredLines = useMemo(() => {
    const q = normalizeSearchText(query);
    return lines.filter((line) => {
      if (category !== 'all' && line.category !== category) {
        return false;
      }
      if (!q) return true;

      if (
        normalizeSearchText(line.number).includes(q) ||
        normalizeSearchText(line.id).includes(q)
      ) {
        return true;
      }

      const originEn = normalizeSearchText(resolveHubName(line.origin_key, 'en'));
      const originAr = normalizeSearchText(resolveHubName(line.origin_key, 'ar'));
      const destEn = normalizeSearchText(resolveHubName(line.destination_key, 'en'));
      const destAr = normalizeSearchText(resolveHubName(line.destination_key, 'ar'));
      if (
        originEn.includes(q) ||
        originAr.includes(q) ||
        destEn.includes(q) ||
        destAr.includes(q)
      ) {
        return true;
      }

      return line.stops.some((stop) => {
        const sEn = normalizeSearchText(stop.name_en);
        const sAr = normalizeSearchText(stop.name_ar);
        const hEn = stop.hub_key ? normalizeSearchText(resolveHubName(stop.hub_key, 'en')) : '';
        const hAr = stop.hub_key ? normalizeSearchText(resolveHubName(stop.hub_key, 'ar')) : '';
        return sEn.includes(q) || sAr.includes(q) || hEn.includes(q) || hAr.includes(q);
      });
    });
  }, [lines, category, query]);

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const { favoriteLines, regularLines } = useMemo(() => {
    const favs: BusLine[] = [];
    const regular: BusLine[] = [];
    for (const line of filteredLines) {
      if (favoriteSet.has(line.id)) {
        favs.push(line);
      } else {
        regular.push(line);
      }
    }
    return { favoriteLines: favs, regularLines: regular };
  }, [filteredLines, favoriteSet]);

  if (selectedLine) {
    const isSelectedFavorite = favoriteSet.has(selectedLine.id);
    const serviceStatus = getLineServiceStatus(
      selectedLine.first_departure,
      selectedLine.last_departure,
      now,
    );
    const orderedStops =
      direction === 'outbound' ? selectedLine.stops : [...selectedLine.stops].reverse();
    const startHubKey =
      direction === 'outbound' ? selectedLine.origin_key : selectedLine.destination_key;
    const endHubKey =
      direction === 'outbound' ? selectedLine.destination_key : selectedLine.origin_key;

    return (
      <div dir={dir} className="flex flex-col h-full">
        {/* Detail Header */}
        <div className="p-3.5 border-b border-[#DCE6EE] dark:border-[#183550] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onSelectLine(null)}
              data-testid="back-to-lines"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4A657A] dark:text-[#85A3BC] hover:text-[#041626] dark:hover:text-[#EFF6FA] cursor-pointer"
            >
              {lang === 'ar' ? (
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              ) : (
                <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
              )}
              <span>{t.explorer.backToAll}</span>
            </button>

            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <ShareButton
                lang={lang}
                label={t.explorer.shareLine}
                testId="share-line-btn"
                getSharePayload={() => ({
                  url: buildShareUrl({
                    lang,
                    mode: 'explorer',
                    selectedLine,
                    direction,
                    originPoint: null,
                    destinationPoint: null,
                    nearMePoint: null,
                    selectedItineraryIndex: 0,
                  }),
                  title: `${t.share.lineShareTitle} ${selectedLine.number}`,
                  text: `${t.share.lineShareText} ${selectedLine.number}: ${resolveHubName(startHubKey, lang)} - ${resolveHubName(endHubKey, lang)}`,
                })}
              />

              <button
                type="button"
                onClick={() => onReportLine(selectedLine)}
                data-testid="report-line-btn"
                title={t.explorer.reportError}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[#DCE6EE] dark:border-[#183550] bg-[#F4F8FB] dark:bg-[#0D2236] hover:border-amber-300 dark:hover:border-amber-700/60 text-[11px] font-medium text-[#4A657A] dark:text-[#85A3BC] hover:text-amber-700 dark:hover:text-amber-300 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                <Flag className="w-3 h-3 shrink-0" strokeWidth={1.75} />
                <span>{t.explorer.reportError}</span>
              </button>

              <span className="text-[11px] font-medium px-2 py-1 rounded-md bg-[#EEF5F9] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] text-[#0155A6] dark:text-[#38BDF8] whitespace-nowrap">
                {selectedLine.category === 'urban'
                  ? t.explorer.tabs.urban
                  : t.explorer.tabs.regional}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <LineBadge number={selectedLine.number} color={selectedLine.color} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-[#041626] dark:text-[#EFF6FA] leading-snug">
                <BidiText label={{ text: resolveHubName(startHubKey, lang), dir }} />
              </div>
              <div className="text-xs text-[#4A657A] dark:text-[#85A3BC] mt-0.5 flex items-center gap-1">
                <span>{lang === 'ar' ? '←' : '→'}</span>
                <BidiText label={{ text: resolveHubName(endHubKey, lang), dir }} />
              </div>
              {serviceStatus && (
                <div className="mt-1.5">
                  <span
                    data-testid="line-service-status"
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold tabular-nums ${
                      serviceStatus.isActive
                        ? 'bg-emerald-50 border-emerald-200 text-[#018A5B] dark:bg-emerald-950/60 dark:border-emerald-800/70 dark:text-[#34D399]'
                        : 'bg-[#F4F8FB] border-[#DCE6EE] text-[#526D82] dark:bg-[#0D2236] dark:border-[#183550] dark:text-[#85A3BC]'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        serviceStatus.isActive
                          ? 'bg-[#01A069] dark:bg-[#34D399]'
                          : 'bg-[#94A3B8] dark:bg-[#64748B]'
                      }`}
                    />
                    {serviceStatus.isActive ? (
                      <span>{t.explorer.serviceActive}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <span>{t.explorer.serviceEnded}</span>
                        <span>·</span>
                        <span>{t.explorer.serviceStarts}</span>
                        <span dir="ltr">{serviceStatus.firstDeparture}</span>
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onToggleFavorite(selectedLine.id)}
              aria-pressed={isSelectedFavorite}
              aria-label={
                isSelectedFavorite ? t.explorer.removeFavoriteAria : t.explorer.addFavoriteAria
              }
              title={
                isSelectedFavorite ? t.explorer.removeFavoriteAria : t.explorer.addFavoriteAria
              }
              data-testid="toggle-favorite-line"
              className={`shrink-0 p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isSelectedFavorite
                  ? 'bg-amber-50 border-amber-200 text-amber-500 dark:bg-amber-950/50 dark:border-amber-800/70 dark:text-amber-400'
                  : 'bg-[#F4F8FB] border-[#DCE6EE] text-[#85A3BC] hover:text-[#041626] dark:bg-[#0D2236] dark:border-[#183550] dark:text-[#6B8BA5] dark:hover:text-[#EFF6FA]'
              }`}
            >
              <Star
                className={`w-4 h-4 ${isSelectedFavorite ? 'fill-current' : ''}`}
                strokeWidth={1.75}
              />
            </button>
          </div>

          {/* Direction Switcher (Outbound / Inbound) */}
          <div className="flex items-center bg-[#F2F7FA] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => onChangeDirection('outbound')}
              data-testid="direction-outbound"
              className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                direction === 'outbound'
                  ? 'bg-white dark:bg-[#081828] text-[#041626] dark:text-[#EFF6FA] shadow-xs'
                  : 'text-[#526D82] dark:text-[#85A3BC] hover:text-[#041626] dark:hover:text-[#EFF6FA]'
              }`}
            >
              {t.explorer.outbound}
            </button>
            <ArrowLeftRight className="w-3.5 h-3.5 text-[#85A3BC] dark:text-[#4A657A] mx-1 shrink-0" strokeWidth={1.75} />
            <button
              type="button"
              onClick={() => onChangeDirection('inbound')}
              data-testid="direction-inbound"
              className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                direction === 'inbound'
                  ? 'bg-white dark:bg-[#081828] text-[#041626] dark:text-[#EFF6FA] shadow-xs'
                  : 'text-[#526D82] dark:text-[#85A3BC] hover:text-[#041626] dark:hover:text-[#EFF6FA]'
              }`}
            >
              {t.explorer.inbound}
            </button>
          </div>

          {/* Unified Hairline Metric Strip */}
          <div className="grid grid-cols-3 divide-x rtl:divide-x-reverse divide-[#DCE6EE] dark:divide-[#183550] border border-[#DCE6EE] dark:border-[#183550] rounded-lg bg-[#F4F8FB] dark:bg-[#0D2236]/80">
            <div className="px-2.5 py-2">
              <div className="text-[10px] text-[#526D82] dark:text-[#85A3BC] truncate">
                {t.explorer.hoursLabel}
              </div>
              <div
                dir="ltr"
                className="text-xs font-semibold text-[#041626] dark:text-[#EFF6FA] tabular-nums mt-0.5 whitespace-nowrap"
              >
                {`${selectedLine.first_departure} - ${selectedLine.last_departure}`}
              </div>
            </div>

            <div className="px-2.5 py-2">
              <div className="text-[10px] text-[#526D82] dark:text-[#85A3BC] truncate">
                {t.explorer.frequencyPrefix}
              </div>
              <div className="text-xs font-semibold text-[#041626] dark:text-[#EFF6FA] tabular-nums mt-0.5 flex items-center gap-1 whitespace-nowrap">
                <span dir="ltr">{selectedLine.frequency_mins}</span>
                <span>{t.explorer.minutesUnit}</span>
              </div>
            </div>

            <div className="px-2.5 py-2">
              <div className="text-[10px] text-[#526D82] dark:text-[#85A3BC] truncate">
                {t.explorer.fareLabel}
              </div>
              <div className="text-xs font-semibold text-[#041626] dark:text-[#EFF6FA] tabular-nums mt-0.5 flex items-center gap-1 whitespace-nowrap">
                <span dir="ltr">{formatMad(selectedLine.price_mad)}</span>
                <span>{t.explorer.currency}</span>
              </div>
            </div>
          </div>

          {orderedStops.length >= 2 && (
            <button
              type="button"
              onClick={() => onStartRideLine(selectedLine, direction)}
              data-testid="start-ride-line-btn"
              className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#0155A6] hover:bg-[#01468A] dark:bg-[#01A069] dark:hover:bg-[#018A5B] text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <Radio className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
              <span>{t.ride.startTripRideBtn}</span>
            </button>
          )}
        </div>

        {/* Vertical Stop Timeline */}
        <div className="flex-1 min-h-0 overflow-y-auto transit-scroll p-3.5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-xs font-semibold text-[#041626] dark:text-[#EFF6FA]">
              {t.explorer.stopTimelineTitle}
            </h3>
            <span className="text-[11px] text-[#526D82] dark:text-[#85A3BC] tabular-nums flex items-center gap-1">
              <span dir="ltr">{orderedStops.length}</span>
              <span>{t.explorer.stopsCount}</span>
            </span>
          </div>

          <p className="text-[11px] text-[#526D82] dark:text-[#85A3BC] mb-3">{t.explorer.zoomHint}</p>

          <div className="relative ps-5 space-y-0.5">
            <div
              className="absolute top-3 bottom-3 start-[9px] w-0.5 rounded-full opacity-45"
              style={{ backgroundColor: selectedLine.color }}
            />

            {orderedStops.map((stop, idx) => {
              const isTerminal = idx === 0 || idx === orderedStops.length - 1;
              const label = resolveStopLabel(stop, lang);
              const seqNumber = idx + 1;

              return (
                <button
                  key={`${stop.id}-${direction}`}
                  type="button"
                  onClick={() => onFocusStop(stop)}
                  className="group relative w-full flex items-center justify-between gap-2 text-start py-2 px-2 rounded-md hover:bg-[#F2F7FA] dark:hover:bg-[#0D2236] transition-colors cursor-pointer"
                >
                  <span
                    className={`absolute -start-[17px] rounded-full border-2 transition-transform group-hover:scale-125 ${
                      isTerminal ? 'w-3.5 h-3.5 -start-[18px]' : 'w-2.5 h-2.5 -start-[16px]'
                    }`}
                    style={{
                      backgroundColor: isTerminal ? selectedLine.color : 'var(--popup-bg)',
                      borderColor: selectedLine.color,
                    }}
                  />

                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <span
                      dir="ltr"
                      className="text-[11px] font-mono tabular-nums text-[#7C97AE] dark:text-[#6B8BA5] w-5 shrink-0"
                    >
                      {seqNumber}
                    </span>
                    <BidiText
                      label={label}
                      className={`text-xs truncate ${
                        isTerminal
                          ? 'font-semibold text-[#041626] dark:text-[#EFF6FA]'
                          : 'font-normal text-[#2D475D] dark:text-[#C8DBE8]'
                      }`}
                    />
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {stop.hub_key && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#EEF5F9] dark:bg-[#0D2236] text-[#0155A6] dark:text-[#38BDF8]">
                        {t.explorer.hubStopBadge}
                      </span>
                    )}
                    <MapPin
                      className="w-3.5 h-3.5 text-[#526D82] dark:text-[#85A3BC] opacity-0 group-hover:opacity-100 transition-opacity"
                      strokeWidth={1.75}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir={dir} className="flex flex-col h-full">
      {/* Search & Filter Header */}
      <div className="p-3.5 border-b border-[#DCE6EE] dark:border-[#183550] space-y-2.5">
        <div className="relative">
          <Search
            className="w-4 h-4 text-[#7C97AE] dark:text-[#6B8BA5] absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none"
            strokeWidth={1.75}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.explorer.searchPlaceholder}
            data-testid="line-search-input"
            className="w-full bg-[#F4F8FB] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] focus:border-[#0155A6] dark:focus:border-[#34D399] focus:outline-none rounded-lg ps-9 pe-8 py-2 text-xs text-[#041626] dark:text-[#EFF6FA] placeholder-[#7C97AE] dark:placeholder-[#6B8BA5] transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t.explorer.clearSearch}
              className="absolute top-1/2 -translate-y-1/2 end-2.5 text-[#526D82] hover:text-[#041626] dark:hover:text-[#EFF6FA] p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          )}
        </div>

        {/* Clean Segmented Tabs */}
        <div className="grid grid-cols-3 gap-1 bg-[#F2F7FA] dark:bg-[#0D2236] p-0.5 rounded-lg border border-[#DCE6EE] dark:border-[#183550]">
          {(
            [
              { key: 'all', label: t.explorer.tabs.all, count: counts.all },
              { key: 'urban', label: t.explorer.tabs.urban, count: counts.urban },
              { key: 'regional', label: t.explorer.tabs.regional, count: counts.regional },
            ] as const
          ).map((tab) => {
            const active = category === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setCategory(tab.key)}
                data-testid={`tab-${tab.key}`}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-white dark:bg-[#081828] text-[#041626] dark:text-[#EFF6FA] shadow-xs'
                    : 'text-[#526D82] dark:text-[#85A3BC] hover:text-[#041626] dark:hover:text-[#EFF6FA]'
                }`}
              >
                <span className="truncate">{tab.label}</span>
                <span
                  dir="ltr"
                  className={`tabular-nums text-[11px] ${
                    active
                      ? 'text-[#01A069] dark:text-[#34D399] font-semibold'
                      : 'text-[#7C97AE] dark:text-[#6B8BA5]'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Flush Hairline Timetable Rows */}
      <div className="flex-1 min-h-0 overflow-y-auto transit-scroll divide-y divide-[#E6EFF5] dark:divide-[#152D44]">
        {filteredLines.length === 0 ? (
          <div className="text-center py-10 px-4 space-y-2">
            <p className="text-xs text-[#526D82] dark:text-[#85A3BC]">{t.explorer.noResults}</p>
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-xs font-medium text-[#0155A6] dark:text-[#34D399] hover:underline cursor-pointer"
              >
                {t.explorer.clearSearch}
              </button>
            )}
          </div>
        ) : (
          <>
            {favoriteLines.length > 0 && (
              <>
                <div
                  data-testid="favorites-section-header"
                  className="px-3.5 py-1.5 bg-[#F8FBFD] dark:bg-[#061321] flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Star className="w-3 h-3 fill-current shrink-0" strokeWidth={1.75} />
                    <span>{t.explorer.favoritesSection}</span>
                  </span>
                  <span dir="ltr" className="tabular-nums">
                    {favoriteLines.length}
                  </span>
                </div>
                {favoriteLines.map((line) => (
                  <LineListRow
                    key={line.id}
                    line={line}
                    lang={lang}
                    now={now}
                    isFavorite
                    onSelectLine={onSelectLine}
                    onToggleFavorite={onToggleFavorite}
                  />
                ))}
                {regularLines.length > 0 && (
                  <div className="px-3.5 py-1.5 bg-[#F8FBFD] dark:bg-[#061321] text-[10px] font-semibold uppercase tracking-wider text-[#526D82] dark:text-[#85A3BC]">
                    {t.explorer.allLinesSection}
                  </div>
                )}
              </>
            )}

            {regularLines.map((line) => (
              <LineListRow
                key={line.id}
                line={line}
                lang={lang}
                now={now}
                isFavorite={false}
                onSelectLine={onSelectLine}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
