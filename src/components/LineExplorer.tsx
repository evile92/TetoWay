import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  MapPin,
  Search,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatMad, resolveHubName, resolveStopLabel, TRANSLATIONS } from '../i18n';
import type {
  BusLine,
  BusStop,
  DirectionMode,
  Lang,
  LineCategoryFilter,
} from '../types/transit';
import { BidiText, LineBadge } from './BidiText';

interface LineExplorerProps {
  lang: Lang;
  lines: BusLine[];
  selectedLine: BusLine | null;
  direction: DirectionMode;
  onSelectLine: (line: BusLine | null) => void;
  onChangeDirection: (dir: DirectionMode) => void;
  onFocusStop: (stop: BusStop) => void;
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')
    .toLowerCase()
    .trim();
}

export function LineExplorer({
  lang,
  lines,
  selectedLine,
  direction,
  onSelectLine,
  onChangeDirection,
  onFocusStop,
}: LineExplorerProps) {
  const t = TRANSLATIONS[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const [category, setCategory] = useState<LineCategoryFilter>('all');
  const [query, setQuery] = useState('');

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
    const q = normalizeSearch(query);
    return lines.filter((line) => {
      if (category !== 'all' && line.category !== category) {
        return false;
      }
      if (!q) return true;

      if (
        normalizeSearch(line.number).includes(q) ||
        normalizeSearch(line.id).includes(q)
      ) {
        return true;
      }

      const originEn = normalizeSearch(resolveHubName(line.origin_key, 'en'));
      const originAr = normalizeSearch(resolveHubName(line.origin_key, 'ar'));
      const destEn = normalizeSearch(resolveHubName(line.destination_key, 'en'));
      const destAr = normalizeSearch(resolveHubName(line.destination_key, 'ar'));
      if (
        originEn.includes(q) ||
        originAr.includes(q) ||
        destEn.includes(q) ||
        destAr.includes(q)
      ) {
        return true;
      }

      return line.stops.some((stop) => {
        const sEn = normalizeSearch(stop.name_en);
        const sAr = normalizeSearch(stop.name_ar);
        const hEn = stop.hub_key ? normalizeSearch(resolveHubName(stop.hub_key, 'en')) : '';
        const hAr = stop.hub_key ? normalizeSearch(resolveHubName(stop.hub_key, 'ar')) : '';
        return sEn.includes(q) || sAr.includes(q) || hEn.includes(q) || hAr.includes(q);
      });
    });
  }, [lines, category, query]);

  if (selectedLine) {
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

            <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-[#EEF5F9] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] text-[#0155A6] dark:text-[#38BDF8]">
              {selectedLine.category === 'urban'
                ? t.explorer.tabs.urban
                : t.explorer.tabs.regional}
            </span>
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
            </div>
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
          filteredLines.map((line) => (
            <button
              key={line.id}
              type="button"
              onClick={() => onSelectLine(line)}
              data-testid={`line-card-${line.id}`}
              className="w-full text-start flex items-center gap-3 px-3.5 py-2.5 hover:bg-[#F4F8FB] dark:hover:bg-[#0D2236] transition-colors cursor-pointer"
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
                <div className="text-[10px] text-[#7C97AE] dark:text-[#6B8BA5] tabular-nums flex items-center justify-end gap-1">
                  <span dir="ltr">{line.frequency_mins}</span>
                  <span>{t.explorer.minutesUnit}</span>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
