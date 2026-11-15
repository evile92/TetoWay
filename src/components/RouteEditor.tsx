import {
  ArrowDown,
  ArrowUp,
  Download,
  MapPinPlus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { EXPORT_FILENAME, resolveHubName, TRANSLATIONS } from '../i18n';
import type { BusLine, BusStop, Lang, MapPickMode } from '../types/transit';
import { resnapStopsWithOsrm } from '../utils/transitGeo';
import { BidiText, LineBadge } from './BidiText';

interface RouteEditorProps {
  lang: Lang;
  lines: BusLine[];
  selectedLine: BusLine;
  onSelectLine: (line: BusLine) => void;
  onUpdateLine: (updated: BusLine) => void;
  pickMode: MapPickMode;
  onSetPickMode: (mode: MapPickMode) => void;
  onFocusStop: (stop: BusStop) => void;
}

export function RouteEditor({
  lang,
  lines,
  selectedLine,
  onSelectLine,
  onUpdateLine,
  pickMode,
  onSetPickMode,
  onFocusStop,
}: RouteEditorProps) {
  const t = TRANSLATIONS[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  const [resnapping, setResnapping] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  function renumberStops(stops: BusStop[]): BusStop[] {
    return stops.map((stop, idx) => ({
      ...stop,
      order: idx + 1,
      id: `${selectedLine.id}_S${idx + 1}`,
    }));
  }

  function handleStopFieldChange(index: number, field: 'name_en' | 'name_ar', value: string) {
    const nextStops = selectedLine.stops.map((s, idx) =>
      idx === index ? { ...s, [field]: value } : s,
    );
    onUpdateLine({ ...selectedLine, stops: nextStops });
  }

  function handleMoveStop(index: number, delta: -1 | 1) {
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= selectedLine.stops.length) return;
    const copy = [...selectedLine.stops];
    const [item] = copy.splice(index, 1);
    copy.splice(targetIdx, 0, item);
    onUpdateLine({ ...selectedLine, stops: renumberStops(copy) });
  }

  function handleDeleteStop(index: number) {
    if (selectedLine.stops.length <= 2) {
      setStatusMsg({ type: 'err', text: t.editor.minStopsWarning });
      return;
    }
    const nextStops = selectedLine.stops.filter((_, idx) => idx !== index);
    onUpdateLine({ ...selectedLine, stops: renumberStops(nextStops) });
    setStatusMsg(null);
  }

  async function handleResnapOsrm() {
    if (selectedLine.stops.length < 2) {
      setStatusMsg({ type: 'err', text: t.editor.minStopsWarning });
      return;
    }

    setResnapping(true);
    setStatusMsg(null);
    try {
      const geometry = await resnapStopsWithOsrm(selectedLine.stops);
      onUpdateLine({ ...selectedLine, geometry });
      setStatusMsg({ type: 'ok', text: t.editor.resnapSuccess });
    } catch {
      setStatusMsg({ type: 'err', text: t.editor.resnapError });
    } finally {
      setResnapping(false);
    }
  }

  function handleExportJson() {
    const payload = JSON.stringify(lines, null, 2);
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = EXPORT_FILENAME;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const isAddingStop = pickMode === 'editor_add_stop';

  return (
    <div dir={dir} className="flex flex-col h-full bg-white dark:bg-[#081828]">
      {/* Studio Controls Header */}
      <div className="p-3.5 border-b border-[#DCE6EE] dark:border-[#183550] space-y-3">
        <div className="border-s-2 border-[#01A069] dark:border-[#34D399] ps-2.5">
          <div className="text-xs font-semibold text-[#041626] dark:text-[#EFF6FA]">
            {t.editor.bannerTitle}
          </div>
          <div className="text-[11px] text-[#526D82] dark:text-[#85A3BC] mt-0.5">
            {t.editor.bannerSubtitle}
          </div>
        </div>

        {/* Select Line */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-[#526D82] dark:text-[#85A3BC] block">
            {t.editor.selectLine}
          </label>
          <div className="flex items-center gap-2">
            <LineBadge number={selectedLine.number} color={selectedLine.color} size="md" />
            <select
              value={selectedLine.id}
              onChange={(e) => {
                const found = lines.find((l) => l.id === e.target.value);
                if (found) onSelectLine(found);
                setStatusMsg(null);
              }}
              data-testid="editor-line-select"
              className="flex-1 min-w-0 bg-[#F4F8FB] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] focus:border-[#0155A6] dark:focus:border-[#34D399] focus:outline-none rounded-md px-2.5 py-2 text-xs text-[#041626] dark:text-[#EFF6FA]"
            >
              {lines.map((line) => (
                <option key={line.id} value={line.id}>
                  {`${line.number} · ${resolveHubName(line.origin_key, lang)} - ${resolveHubName(line.destination_key, lang)}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Add Stop Toggle + Re-Snap + Export */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => onSetPickMode(isAddingStop ? 'none' : 'editor_add_stop')}
            data-testid="editor-add-stop-toggle"
            className={`w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
              isAddingStop
                ? 'bg-[#0098C8] border-[#0098C8] text-white'
                : 'bg-[#F4F8FB] border-[#DCE6EE] hover:border-[#B6CBD9] text-[#041626] dark:bg-[#0D2236] dark:border-[#183550] dark:hover:border-[#254E74] dark:text-[#EFF6FA]'
            }`}
          >
            <MapPinPlus className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            <span>{t.editor.addStopToggle}</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleResnapOsrm}
              disabled={resnapping}
              data-testid="editor-resnap-osrm"
              className="inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-md text-xs font-semibold bg-[#01A069] hover:bg-[#018A5B] text-white disabled:opacity-60 transition-colors cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 shrink-0 ${resnapping ? 'animate-spin' : ''}`}
                strokeWidth={1.75}
              />
              <span className="truncate">
                {resnapping ? t.editor.resnapping : t.editor.resnapBtn}
              </span>
            </button>

            <button
              type="button"
              onClick={handleExportJson}
              data-testid="editor-export-json"
              className="inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-md text-xs font-medium bg-[#F4F8FB] hover:bg-[#E6EFF5] dark:bg-[#0D2236] dark:hover:bg-[#132F4B] border border-[#DCE6EE] dark:border-[#183550] text-[#041626] dark:text-[#EFF6FA] transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 shrink-0 text-[#0155A6] dark:text-[#38BDF8]" strokeWidth={1.75} />
              <span className="truncate">{t.editor.exportBtn}</span>
            </button>
          </div>

          <div className="flex items-center justify-between text-[10px] text-[#526D82] dark:text-[#85A3BC]">
            <span>{t.editor.dragHint}</span>
            <code dir="ltr" className="text-[#041626] dark:text-[#C8DBE8] font-mono">
              {EXPORT_FILENAME}
            </code>
          </div>

          {statusMsg && (
            <div
              className={`text-[11px] px-2.5 py-1.5 rounded-md border ${
                statusMsg.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/50 dark:border-emerald-800/70 dark:text-emerald-300'
                  : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/50 dark:border-rose-800/70 dark:text-rose-300'
              }`}
            >
              {statusMsg.text}
            </div>
          )}
        </div>
      </div>

      {/* Editable Stops List */}
      <div className="flex-1 min-h-0 overflow-y-auto transit-scroll">
        <div className="px-3.5 py-2 border-b border-[#DCE6EE] dark:border-[#183550] flex items-center justify-between bg-[#F4F8FB] dark:bg-[#0D2236]/70">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#526D82] dark:text-[#85A3BC]">
            {t.editor.stopsEditorTitle}
          </h3>
          <span dir="ltr" className="text-[11px] font-mono tabular-nums text-[#526D82] dark:text-[#85A3BC]">
            {selectedLine.stops.length}
          </span>
        </div>

        <div className="divide-y divide-[#E6EFF5] dark:divide-[#152D44]">
          {selectedLine.stops.map((stop, idx) => (
            <div key={stop.id} className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onFocusStop(stop)}
                  className="flex items-center gap-2 text-start min-w-0 cursor-pointer hover:opacity-80"
                >
                  <span
                    dir="ltr"
                    className="w-5 h-5 rounded text-[11px] font-bold tabular-nums inline-flex items-center justify-center shrink-0 bg-[#EEF5F9] text-[#041626] border border-[#DCE6EE] dark:bg-[#0D2236] dark:text-[#EFF6FA] dark:border-[#183550]"
                  >
                    {idx + 1}
                  </span>
                  <BidiText
                    label={{
                      text:
                        lang === 'ar'
                          ? stop.name_ar || stop.name_en
                          : stop.name_en || stop.name_ar,
                      dir: lang === 'ar' && stop.name_ar ? 'rtl' : 'ltr',
                    }}
                    className="text-xs font-medium text-[#041626] dark:text-[#EFF6FA] truncate"
                  />
                </button>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleMoveStop(idx, -1)}
                    disabled={idx === 0}
                    title={t.editor.moveUp}
                    className="p-1 rounded text-[#526D82] hover:text-[#041626] hover:bg-[#F2F7FA] dark:text-[#85A3BC] dark:hover:text-[#EFF6FA] dark:hover:bg-[#0D2236] disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowUp className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveStop(idx, 1)}
                    disabled={idx === selectedLine.stops.length - 1}
                    title={t.editor.moveDown}
                    className="p-1 rounded text-[#526D82] hover:text-[#041626] hover:bg-[#F2F7FA] dark:text-[#85A3BC] dark:hover:text-[#EFF6FA] dark:hover:bg-[#0D2236] disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowDown className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteStop(idx)}
                    title={t.editor.deleteStop}
                    className="p-1 rounded text-rose-600/80 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400/80 dark:hover:text-rose-300 dark:hover:bg-rose-950/50 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-1.5">
                <div className="space-y-0.5">
                  <label className="text-[10px] font-medium text-[#526D82] dark:text-[#85A3BC] block">
                    {t.editor.nameEnLabel}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={stop.name_en}
                    onChange={(e) => handleStopFieldChange(idx, 'name_en', e.target.value)}
                    className="w-full bg-[#F4F8FB] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] focus:border-[#0155A6] dark:focus:border-[#34D399] focus:outline-none rounded px-2 py-1.5 text-xs text-[#041626] dark:text-[#EFF6FA]"
                  />
                </div>

                <div className="space-y-0.5">
                  <label className="text-[10px] font-medium text-[#526D82] dark:text-[#85A3BC] block">
                    {t.editor.nameArLabel}
                  </label>
                  <input
                    type="text"
                    dir="rtl"
                    value={stop.name_ar}
                    onChange={(e) => handleStopFieldChange(idx, 'name_ar', e.target.value)}
                    className="w-full bg-[#F4F8FB] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] focus:border-[#0155A6] dark:focus:border-[#34D399] focus:outline-none rounded px-2 py-1.5 text-xs text-[#041626] dark:text-[#EFF6FA]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-[#526D82] dark:text-[#85A3BC]">
                <span>{t.editor.coordinatesLabel}</span>
                <span dir="ltr" className="font-mono tabular-nums">
                  {`${stop.lat.toFixed(5)}, ${stop.lng.toFixed(5)}`}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
