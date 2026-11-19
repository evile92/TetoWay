import { Landmark, MapPin, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getDir, TRANSLATIONS } from '../i18n';
import type { GeoPoint, Lang } from '../types/transit';
import {
  formatSelectedPointLabel,
  searchOfflinePlaces,
  type SearchablePlace,
} from '../utils/stopSearch';
import { BidiText } from './BidiText';

interface StopSearchInputProps {
  lang: Lang;
  value: GeoPoint | null;
  places: SearchablePlace[];
  placeholder: string;
  testId: string;
  onSelectPoint: (pt: GeoPoint | null) => void;
}

/** Accessible offline autocomplete combobox for hubs, stops, and Tetouan landmarks. */
export function StopSearchInput({
  lang,
  value,
  places,
  placeholder,
  testId,
  onSelectPoint,
}: StopSearchInputProps) {
  const t = TRANSLATIONS[lang];
  const dir = getDir(lang);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedLabel = useMemo(
    () => formatSelectedPointLabel(places, value),
    [places, value],
  );

  const results = useMemo(() => searchOfflinePlaces(places, query, 28), [places, query]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  function handleOpen() {
    setQuery('');
    setActiveIndex(0);
    setIsOpen(true);
  }

  function handlePickPlace(place: SearchablePlace) {
    onSelectPoint(place.point);
    setQuery('');
    setIsOpen(false);
    inputRef.current?.blur();
  }

  function handleClear() {
    setQuery('');
    setIsOpen(false);
    onSelectPoint(null);
  }

  const kindLabel = (kind: SearchablePlace['kind']): string => {
    if (kind === 'hub') return t.planner.kindHub;
    if (kind === 'landmark') return t.planner.kindLandmark;
    return t.planner.kindStop;
  };

  return (
    <div ref={containerRef} dir={dir} className="relative flex-1 min-w-0">
      <div className="relative">
        <Search
          className="w-3.5 h-3.5 text-[#7C97AE] dark:text-[#6B8BA5] absolute top-1/2 -translate-y-1/2 start-2.5 pointer-events-none"
          strokeWidth={1.75}
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          value={isOpen ? query : selectedLabel}
          placeholder={isOpen && selectedLabel ? selectedLabel : placeholder}
          onFocus={handleOpen}
          onClick={() => {
            if (!isOpen) handleOpen();
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
            if (!isOpen) setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsOpen(false);
              setQuery('');
              inputRef.current?.blur();
              return;
            }
            if (!isOpen || results.length === 0) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex((prev) => (prev + 1) % results.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((prev) => (prev - 1 + results.length) % results.length);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const target = results[activeIndex] ?? results[0];
              if (target) handlePickPlace(target);
            }
          }}
          data-testid={testId}
          className="w-full bg-[#F4F8FB] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] focus:border-[#0155A6] dark:focus:border-[#34D399] focus:outline-none rounded-md ps-8 pe-7 py-2 text-xs text-[#041626] dark:text-[#EFF6FA] placeholder-[#7C97AE] dark:placeholder-[#6B8BA5] transition-colors truncate"
        />

        {(value || (isOpen && query)) && (
          <button
            type="button"
            onClick={handleClear}
            aria-label={t.planner.clearPoint}
            title={t.planner.clearPoint}
            data-testid={`${testId}-clear`}
            className="absolute top-1/2 -translate-y-1/2 end-2 text-[#7C97AE] hover:text-[#041626] dark:text-[#6B8BA5] dark:hover:text-[#EFF6FA] p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
        )}
      </div>

      {isOpen && (
        <div
          role="listbox"
          data-testid={`${testId}-listbox`}
          className="absolute start-0 end-0 top-[calc(100%+4px)] z-30 max-h-56 overflow-y-auto transit-scroll rounded-lg border border-[#DCE6EE] dark:border-[#183550] bg-white dark:bg-[#081828] shadow-lg divide-y divide-[#E6EFF5] dark:divide-[#142B42]"
        >
          {results.length === 0 ? (
            <div className="px-3 py-3 text-[11px] text-[#526D82] dark:text-[#85A3BC] text-center">
              {t.planner.noMatchingPlaces}
            </div>
          ) : (
            results.map((place, idx) => {
              const highlighted = idx === activeIndex;
              return (
                <button
                  key={place.id}
                  type="button"
                  role="option"
                  aria-selected={highlighted}
                  onClick={() => handlePickPlace(place)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`w-full text-start px-3 py-2 flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                    highlighted
                      ? 'bg-[#EEF5F9] dark:bg-[#0D2236]'
                      : 'hover:bg-[#F4F8FB] dark:hover:bg-[#0D2236]/70'
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    {place.kind === 'landmark' ? (
                      <Landmark
                        className="w-3.5 h-3.5 mt-0.5 text-[#01A069] dark:text-[#34D399] shrink-0"
                        strokeWidth={1.75}
                      />
                    ) : (
                      <MapPin
                        className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                          place.kind === 'hub'
                            ? 'text-[#0155A6] dark:text-[#38BDF8]'
                            : 'text-[#7C97AE] dark:text-[#6B8BA5]'
                        }`}
                        strokeWidth={1.75}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-[#041626] dark:text-[#EFF6FA] truncate">
                        <BidiText label={{ text: place.label, dir: place.dir }} />
                      </div>
                      {place.secondaryLabel && (
                        <div className="text-[10px] text-[#526D82] dark:text-[#85A3BC] truncate">
                          <BidiText
                            label={{ text: place.secondaryLabel, dir: place.secondaryDir }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {place.lineNumbers.slice(0, 3).map((num) => (
                      <span
                        key={num}
                        dir="ltr"
                        className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded bg-[#F2F7FA] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] text-[#041626] dark:text-[#EFF6FA]"
                      >
                        {num}
                      </span>
                    ))}
                    {place.lineNumbers.length > 3 && (
                      <span
                        dir="ltr"
                        className="text-[10px] tabular-nums text-[#526D82] dark:text-[#85A3BC]"
                      >
                        {`+${place.lineNumbers.length - 3}`}
                      </span>
                    )}
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-[#EEF5F9] dark:bg-[#0B2D48] text-[#4A657A] dark:text-[#85A3BC]">
                      {kindLabel(place.kind)}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
