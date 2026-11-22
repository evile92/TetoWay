import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CloudUpload,
  Download,
  ExternalLink,
  KeyRound,
  Lock,
  MapPinPlus,
  Megaphone,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { EXPORT_FILENAME, resolveHubName, TRANSLATIONS } from '../i18n';
import type {
  AnnouncementType,
  BusLine,
  BusStop,
  Lang,
  LineCategory,
  MapPickMode,
  SiteConfig,
} from '../types/transit';
import {
  clearAdminToken,
  publishAdminChangesToGithub,
  readStoredAdminToken,
  saveAdminToken,
  verifyGithubAdminToken,
} from '../utils/githubAdmin';
import { resnapStopsWithOsrm } from '../utils/transitGeo';
import { BidiText, LineBadge } from './BidiText';

type AdminTab = 'stops' | 'settings' | 'banner';

interface RouteEditorProps {
  lang: Lang;
  lines: BusLine[];
  selectedLine: BusLine;
  siteConfig: SiteConfig;
  isUnlocked: boolean;
  onUnlockChange: (unlocked: boolean) => void;
  hasUnsavedLines: boolean;
  onMarkLinesSaved: () => void;
  onSelectLine: (line: BusLine) => void;
  onUpdateLine: (updated: BusLine) => void;
  onAddLine: (newLine: BusLine) => void;
  onDeleteLine: (lineId: string) => void;
  onUpdateSiteConfig: (nextConfig: SiteConfig) => void;
  pickMode: MapPickMode;
  onSetPickMode: (mode: MapPickMode) => void;
  onFocusStop: (stop: BusStop) => void;
  onExitAdmin: () => void;
}

export function RouteEditor({
  lang,
  lines,
  selectedLine,
  siteConfig,
  isUnlocked,
  onUnlockChange,
  hasUnsavedLines,
  onMarkLinesSaved,
  onSelectLine,
  onUpdateLine,
  onAddLine,
  onDeleteLine,
  onUpdateSiteConfig,
  pickMode,
  onSetPickMode,
  onFocusStop,
  onExitAdmin,
}: RouteEditorProps) {
  const t = TRANSLATIONS[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const hubKeys = Object.keys(t.hubs);

  const [token, setToken] = useState<string>(() => readStoredAdminToken());
  const [tokenInput, setTokenInput] = useState<string>(() => readStoredAdminToken());
  const [verifying, setVerifying] = useState<boolean>(() => !isUnlocked && Boolean(readStoredAdminToken()));
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<AdminTab>('stops');
  const [hasUnsavedBanner, setHasUnsavedBanner] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [confirmingDeleteLine, setConfirmingDeleteLine] = useState(false);

  const [resnapping, setResnapping] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Auto-verify stored token on mount
  useEffect(() => {
    if (isUnlocked) return;
    const initial = readStoredAdminToken();
    if (!initial) return;
    let active = true;
    verifyGithubAdminToken(initial)
      .then((res) => {
        if (!active) return;
        if (res.ok) {
          setToken(initial);
          onUnlockChange(true);
          setAuthError(null);
        } else {
          clearAdminToken();
          setToken('');
          onUnlockChange(false);
        }
      })
      .finally(() => {
        if (active) setVerifying(false);
      });
    return () => {
      active = false;
    };
  }, [isUnlocked, onUnlockChange]);

  async function handleUnlockSubmit(e: FormEvent) {
    e.preventDefault();
    const candidate = tokenInput.trim();
    if (!candidate) return;

    setVerifying(true);
    setAuthError(null);
    const res = await verifyGithubAdminToken(candidate);
    setVerifying(false);

    if (res.ok) {
      saveAdminToken(candidate);
      setToken(candidate);
      onUnlockChange(true);
      return;
    }

    if (res.error === 'no_write_access') {
      setAuthError(t.editor.errNoWriteAccess);
    } else if (res.error === 'network_error') {
      setAuthError(t.editor.errNetwork);
    } else {
      setAuthError(t.editor.errInvalidToken);
    }
  }

  function handleLockPanel() {
    clearAdminToken();
    setToken('');
    setTokenInput('');
    onUnlockChange(false);
    onSetPickMode('none');
    onExitAdmin();
  }

  function markLineUpdated(updated: BusLine) {
    onUpdateLine(updated);
  }

  function renumberStops(stops: BusStop[], lineId = selectedLine.id): BusStop[] {
    return stops.map((stop, idx) => ({
      ...stop,
      order: idx + 1,
      id: `${lineId}_S${idx + 1}`,
    }));
  }

  function handleStopFieldChange(index: number, field: 'name_en' | 'name_ar', value: string) {
    const nextStops = selectedLine.stops.map((s, idx) =>
      idx === index ? { ...s, [field]: value } : s,
    );
    markLineUpdated({ ...selectedLine, stops: nextStops });
  }

  function handleMoveStop(index: number, delta: -1 | 1) {
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= selectedLine.stops.length) return;
    const copy = [...selectedLine.stops];
    const [item] = copy.splice(index, 1);
    copy.splice(targetIdx, 0, item);
    markLineUpdated({ ...selectedLine, stops: renumberStops(copy) });
  }

  function handleDeleteStop(index: number) {
    if (selectedLine.stops.length <= 2) {
      setStatusMsg({ type: 'err', text: t.editor.minStopsWarning });
      return;
    }
    const nextStops = selectedLine.stops.filter((_, idx) => idx !== index);
    markLineUpdated({ ...selectedLine, stops: renumberStops(nextStops) });
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
      markLineUpdated({ ...selectedLine, geometry });
      setStatusMsg({ type: 'ok', text: t.editor.resnapSuccess });
    } catch {
      setStatusMsg({ type: 'err', text: t.editor.resnapError });
    } finally {
      setResnapping(false);
    }
  }

  function handleCreateNewLine() {
    const existingNums = new Set(lines.map((l) => Number.parseInt(l.number, 10)));
    let nextNum = 37;
    while (existingNums.has(nextNum)) {
      nextNum += 1;
    }
    const newId = `L${nextNum}`;
    const newLine: BusLine = {
      id: newId,
      number: String(nextNum),
      category: 'urban',
      color: '#0284C7',
      price_mad: 3.5,
      first_departure: '06:00',
      last_departure: '22:00',
      frequency_mins: 15,
      origin_key: 'dar_takafa',
      destination_key: 'rommana',
      stops: [
        {
          id: `${newId}_S1`,
          order: 1,
          hub_key: 'dar_takafa',
          name_en: resolveHubName('dar_takafa', 'en'),
          name_ar: resolveHubName('dar_takafa', 'ar'),
          lat: 35.57058,
          lng: -5.383003,
        },
        {
          id: `${newId}_S2`,
          order: 2,
          hub_key: 'rommana',
          name_en: resolveHubName('rommana', 'en'),
          name_ar: resolveHubName('rommana', 'ar'),
          lat: 35.56549,
          lng: -5.39242,
        },
      ],
      geometry: {
        type: 'LineString',
        coordinates: [
          [-5.383003, 35.57058],
          [-5.39242, 35.56549],
        ],
      },
    };
    setConfirmingDeleteLine(false);
    onAddLine(newLine);
    setActiveTab('settings');
  }

  function handleConfirmDeleteLine() {
    if (lines.length <= 1) {
      setStatusMsg({ type: 'err', text: t.editor.minLinesWarning });
      setConfirmingDeleteLine(false);
      return;
    }
    setConfirmingDeleteLine(false);
    onDeleteLine(selectedLine.id);
  }

  async function handlePublishToGithub() {
    if (!token) return;
    setPublishing(true);
    setStatusMsg(null);
    try {
      await publishAdminChangesToGithub({
        token,
        lines: hasUnsavedLines || !hasUnsavedBanner ? lines : undefined,
        siteConfig: hasUnsavedBanner ? siteConfig : undefined,
        commitNote: `Line ${selectedLine.number}`,
      });
      onMarkLinesSaved();
      setHasUnsavedBanner(false);
      setStatusMsg({ type: 'ok', text: t.editor.publishSuccess });
    } catch {
      setStatusMsg({ type: 'err', text: t.editor.publishError });
    } finally {
      setPublishing(false);
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

  // 1. Owner Lock Screen (blocks any visitor without push access to evile92/TetoWay)
  if (!isUnlocked) {
    return (
      <div
        dir={dir}
        data-testid="admin-lock-screen"
        className="flex flex-col h-full overflow-y-auto transit-scroll bg-white dark:bg-[#081828] p-4 space-y-4"
      >
        <div className="rounded-xl border border-[#DCE6EE] dark:border-[#183550] bg-[#F4F8FB] dark:bg-[#0D2236] p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#0155A6] dark:bg-[#01A069] text-white inline-flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-bold text-[#041626] dark:text-[#EFF6FA]">
                {t.editor.lockTitle}
              </h2>
              <p className="text-[11px] text-[#526D82] dark:text-[#85A3BC] leading-snug mt-0.5">
                {t.editor.lockSubtitle}
              </p>
            </div>
          </div>

          <form onSubmit={(e) => void handleUnlockSubmit(e)} className="space-y-2.5">
            <div className="space-y-1">
              <label
                htmlFor="admin-pat-input"
                className="text-[11px] font-medium text-[#041626] dark:text-[#EFF6FA] flex items-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5 text-[#0155A6] dark:text-[#34D399]" strokeWidth={1.75} />
                <span>{t.editor.tokenLabel}</span>
              </label>
              <input
                id="admin-pat-input"
                type="password"
                dir="ltr"
                autoComplete="off"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder={t.editor.tokenPlaceholder}
                data-testid="admin-token-input"
                className="w-full bg-white dark:bg-[#081828] border border-[#DCE6EE] dark:border-[#183550] focus:border-[#0155A6] dark:focus:border-[#34D399] focus:outline-none rounded-lg px-3 py-2 text-xs font-mono text-[#041626] dark:text-[#EFF6FA]"
              />
            </div>

            {authError && (
              <div
                data-testid="admin-auth-error"
                className="text-[11px] px-2.5 py-2 rounded-md border bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/50 dark:border-rose-800/70 dark:text-rose-300"
              >
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={verifying || !tokenInput.trim()}
              data-testid="admin-unlock-btn"
              className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#0155A6] hover:bg-[#01468A] dark:bg-[#01A069] dark:hover:bg-[#018A5B] text-white text-xs font-semibold disabled:opacity-60 transition-colors cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
              <span>{verifying ? t.editor.verifyingBtn : t.editor.unlockBtn}</span>
            </button>
          </form>
        </div>

        <div className="rounded-xl border border-[#DCE6EE] dark:border-[#183550] p-3.5 space-y-2.5 text-[11px] text-[#4A657A] dark:text-[#85A3BC]">
          <a
            href="https://github.com/settings/tokens/new?scopes=repo&description=TetoWay+Admin"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-semibold text-[#0155A6] dark:text-[#38BDF8] hover:underline"
          >
            <span>{t.editor.createTokenLink}</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
          </a>
          <ul className="space-y-1.5 leading-relaxed">
            <li>{t.editor.tokenStep1}</li>
            <li>{t.editor.tokenStep2}</li>
            <li>{t.editor.tokenStep3}</li>
          </ul>
        </div>
      </div>
    );
  }

  const isAddingStop = pickMode === 'editor_add_stop';
  const hasUnsaved = hasUnsavedLines || hasUnsavedBanner;

  return (
    <div dir={dir} data-testid="admin-control-panel" className="flex flex-col h-full bg-white dark:bg-[#081828]">
      {/* Top Admin Control Header + One-Click GitHub Publisher */}
      <div className="p-3.5 border-b border-[#DCE6EE] dark:border-[#183550] space-y-2.5 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="border-s-2 border-[#01A069] dark:border-[#34D399] ps-2.5 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-[#041626] dark:text-[#EFF6FA] truncate">
                {t.editor.bannerTitle}
              </span>
              {hasUnsaved && (
                <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
                  {t.editor.unsavedBadge}
                </span>
              )}
            </div>
            <div className="text-[11px] text-[#526D82] dark:text-[#85A3BC] truncate mt-0.5">
              {t.editor.bannerSubtitle}
            </div>
          </div>

          <button
            type="button"
            onClick={handleLockPanel}
            data-testid="admin-lock-btn"
            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[#DCE6EE] dark:border-[#183550] bg-[#F4F8FB] dark:bg-[#0D2236] hover:border-rose-300 dark:hover:border-rose-700 text-[11px] font-medium text-[#4A657A] dark:text-[#85A3BC] hover:text-rose-600 dark:hover:text-rose-300 transition-colors cursor-pointer"
          >
            <Lock className="w-3 h-3 shrink-0" strokeWidth={1.75} />
            <span>{t.editor.lockBtn}</span>
          </button>
        </div>

        {/* Direct GitHub Publish & Export Row */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void handlePublishToGithub()}
            disabled={publishing}
            data-testid="admin-publish-btn"
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#01A069] hover:bg-[#018A5B] text-white text-xs font-semibold disabled:opacity-60 transition-colors cursor-pointer"
          >
            <CloudUpload
              className={`w-3.5 h-3.5 shrink-0 ${publishing ? 'animate-bounce' : ''}`}
              strokeWidth={1.75}
            />
            <span className="truncate">
              {publishing ? t.editor.publishingBtn : t.editor.publishBtn}
            </span>
          </button>

          <button
            type="button"
            onClick={handleExportJson}
            data-testid="editor-export-json"
            title={t.editor.exportBtn}
            className="shrink-0 inline-flex items-center justify-center gap-1 py-2 px-2.5 rounded-lg text-xs font-medium bg-[#F4F8FB] hover:bg-[#E6EFF5] dark:bg-[#0D2236] dark:hover:bg-[#132F4B] border border-[#DCE6EE] dark:border-[#183550] text-[#041626] dark:text-[#EFF6FA] transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 shrink-0 text-[#0155A6] dark:text-[#38BDF8]" strokeWidth={1.75} />
            <span>{t.editor.exportBtn}</span>
          </button>
        </div>

        {statusMsg && (
          <div
            data-testid="admin-status-msg"
            className={`text-[11px] px-2.5 py-1.5 rounded-md border flex items-center gap-1.5 ${
              statusMsg.type === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/50 dark:border-emerald-800/70 dark:text-emerald-300'
                : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/50 dark:border-rose-800/70 dark:text-rose-300'
            }`}
          >
            {statusMsg.type === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Segmented Admin Mode Tabs */}
        <div className="grid grid-cols-3 gap-1 bg-[#F2F7FA] dark:bg-[#0D2236] p-0.5 rounded-lg border border-[#DCE6EE] dark:border-[#183550]">
          <button
            type="button"
            onClick={() => setActiveTab('stops')}
            data-testid="admin-tab-stops"
            className={`inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
              activeTab === 'stops'
                ? 'bg-white dark:bg-[#081828] text-[#041626] dark:text-[#EFF6FA] shadow-xs'
                : 'text-[#526D82] dark:text-[#85A3BC]'
            }`}
          >
            <MapPinPlus className="w-3 h-3 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{t.editor.tabStops}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            data-testid="admin-tab-settings"
            className={`inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-white dark:bg-[#081828] text-[#041626] dark:text-[#EFF6FA] shadow-xs'
                : 'text-[#526D82] dark:text-[#85A3BC]'
            }`}
          >
            <SlidersHorizontal className="w-3 h-3 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{t.editor.tabSettings}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('banner')}
            data-testid="admin-tab-banner"
            className={`inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
              activeTab === 'banner'
                ? 'bg-white dark:bg-[#081828] text-[#041626] dark:text-[#EFF6FA] shadow-xs'
                : 'text-[#526D82] dark:text-[#85A3BC]'
            }`}
          >
            <Megaphone className="w-3 h-3 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{t.editor.tabBanner}</span>
          </button>
        </div>

        {/* Active Line Selector (Shown on Stops & Line Settings tabs) */}
        {activeTab !== 'banner' && (
          <div className="space-y-1 pt-0.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-[#526D82] dark:text-[#85A3BC]">
                {t.editor.selectLine}
              </label>
              <button
                type="button"
                onClick={handleCreateNewLine}
                data-testid="admin-new-line-btn"
                className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#0155A6] dark:text-[#34D399] hover:underline cursor-pointer"
              >
                <Plus className="w-3 h-3" strokeWidth={2} />
                <span>{t.editor.newLineBtn.replace(/^\+\s*/, '')}</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <LineBadge number={selectedLine.number} color={selectedLine.color} size="md" />
              <select
                value={selectedLine.id}
                onChange={(e) => {
                  const found = lines.find((l) => l.id === e.target.value);
                  if (found) onSelectLine(found);
                  setConfirmingDeleteLine(false);
                  setStatusMsg(null);
                }}
                data-testid="editor-line-select"
                className="flex-1 min-w-0 bg-[#F4F8FB] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] focus:border-[#0155A6] dark:focus:border-[#34D399] focus:outline-none rounded-md px-2.5 py-1.5 text-xs text-[#041626] dark:text-[#EFF6FA]"
              >
                {lines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {`${line.number} · ${resolveHubName(line.origin_key, lang)} - ${resolveHubName(line.destination_key, lang)}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Tab 1: Route & Stops Visual Editor */}
      {activeTab === 'stops' && (
        <>
          <div className="px-3.5 py-2.5 border-b border-[#DCE6EE] dark:border-[#183550] space-y-2 shrink-0 bg-[#F8FBFD] dark:bg-[#061321]">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onSetPickMode(isAddingStop ? 'none' : 'editor_add_stop')}
                data-testid="editor-add-stop-toggle"
                className={`inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                  isAddingStop
                    ? 'bg-[#0098C8] border-[#0098C8] text-white'
                    : 'bg-white border-[#DCE6EE] hover:border-[#B6CBD9] text-[#041626] dark:bg-[#0D2236] dark:border-[#183550] dark:hover:border-[#254E74] dark:text-[#EFF6FA]'
                }`}
              >
                <MapPinPlus className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                <span className="truncate">{t.editor.addStopToggle}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleResnapOsrm()}
                disabled={resnapping}
                data-testid="editor-resnap-osrm"
                className="inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-md text-xs font-semibold bg-[#0155A6] hover:bg-[#01468A] text-white disabled:opacity-60 transition-colors cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 shrink-0 ${resnapping ? 'animate-spin' : ''}`}
                  strokeWidth={1.75}
                />
                <span className="truncate">
                  {resnapping ? t.editor.resnapping : t.editor.resnapBtn}
                </span>
              </button>
            </div>

            <div className="flex items-center justify-between text-[10px] text-[#526D82] dark:text-[#85A3BC]">
              <span>{t.editor.dragHint}</span>
              <span dir="ltr" className="font-mono tabular-nums">
                {`${selectedLine.stops.length} ${t.explorer.stopsCount}`}
              </span>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto transit-scroll divide-y divide-[#E6EFF5] dark:divide-[#152D44]">
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
        </>
      )}

      {/* Tab 2: Line Metadata, Fare, Schedule & Color Settings */}
      {activeTab === 'settings' && (
        <div className="flex-1 min-h-0 overflow-y-auto transit-scroll p-3.5 space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#526D82] dark:text-[#85A3BC] block">
                {t.editor.lineNumberLabel}
              </label>
              <input
                type="text"
                dir="ltr"
                value={selectedLine.number}
                onChange={(e) =>
                  markLineUpdated({ ...selectedLine, number: e.target.value.trim() })
                }
                data-testid="admin-line-number-input"
                className="w-full bg-[#F4F8FB] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] rounded-md px-2.5 py-1.5 text-xs font-bold tabular-nums text-[#041626] dark:text-[#EFF6FA]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#526D82] dark:text-[#85A3BC] block">
                {t.editor.categoryLabel}
              </label>
              <select
                value={selectedLine.category}
                onChange={(e) =>
                  markLineUpdated({
                    ...selectedLine,
                    category: e.target.value as LineCategory,
                  })
                }
                data-testid="admin-line-category-select"
                className="w-full bg-[#F4F8FB] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] rounded-md px-2.5 py-1.5 text-xs text-[#041626] dark:text-[#EFF6FA]"
              >
                <option value="urban">{t.explorer.tabs.urban}</option>
                <option value="regional">{t.explorer.tabs.regional}</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#526D82] dark:text-[#85A3BC] block">
                {t.editor.priceMadLabel}
              </label>
              <input
                type="number"
                dir="ltr"
                step="0.5"
                min="1"
                max="50"
                value={selectedLine.price_mad}
                onChange={(e) => {
                  const val = Number.parseFloat(e.target.value);
                  if (Number.isFinite(val) && val > 0) {
                    markLineUpdated({ ...selectedLine, price_mad: val });
                  }
                }}
                data-testid="admin-line-price-input"
                className="w-full bg-[#F4F8FB] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] rounded-md px-2.5 py-1.5 text-xs font-semibold tabular-nums text-[#041626] dark:text-[#EFF6FA]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#526D82] dark:text-[#85A3BC] block">
                {t.editor.frequencyLabel}
              </label>
              <input
                type="number"
                dir="ltr"
                step="1"
                min="3"
                max="180"
                value={selectedLine.frequency_mins}
                onChange={(e) => {
                  const val = Number.parseInt(e.target.value, 10);
                  if (Number.isFinite(val) && val > 0) {
                    markLineUpdated({ ...selectedLine, frequency_mins: val });
                  }
                }}
                data-testid="admin-line-freq-input"
                className="w-full bg-[#F4F8FB] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] rounded-md px-2.5 py-1.5 text-xs font-semibold tabular-nums text-[#041626] dark:text-[#EFF6FA]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#526D82] dark:text-[#85A3BC] block">
                {t.editor.firstDepLabel}
              </label>
              <input
                type="time"
                dir="ltr"
                value={selectedLine.first_departure}
                onChange={(e) =>
                  markLineUpdated({ ...selectedLine, first_departure: e.target.value })
                }
                className="w-full bg-[#F4F8FB] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] rounded-md px-2.5 py-1.5 text-xs tabular-nums text-[#041626] dark:text-[#EFF6FA]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#526D82] dark:text-[#85A3BC] block">
                {t.editor.lastDepLabel}
              </label>
              <input
                type="time"
                dir="ltr"
                value={selectedLine.last_departure}
                onChange={(e) =>
                  markLineUpdated({ ...selectedLine, last_departure: e.target.value })
                }
                className="w-full bg-[#F4F8FB] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] rounded-md px-2.5 py-1.5 text-xs tabular-nums text-[#041626] dark:text-[#EFF6FA]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[#526D82] dark:text-[#85A3BC] block">
              {t.editor.colorLabel}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={selectedLine.color}
                onChange={(e) => markLineUpdated({ ...selectedLine, color: e.target.value })}
                className="w-9 h-8 rounded border border-[#DCE6EE] dark:border-[#183550] cursor-pointer bg-transparent"
              />
              <input
                type="text"
                dir="ltr"
                value={selectedLine.color}
                onChange={(e) => markLineUpdated({ ...selectedLine, color: e.target.value })}
                className="flex-1 bg-[#F4F8FB] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] rounded-md px-2.5 py-1.5 text-xs font-mono text-[#041626] dark:text-[#EFF6FA]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[#526D82] dark:text-[#85A3BC] block">
              {t.editor.originHubLabel}
            </label>
            <select
              value={selectedLine.origin_key}
              onChange={(e) =>
                markLineUpdated({ ...selectedLine, origin_key: e.target.value })
              }
              className="w-full bg-[#F4F8FB] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] rounded-md px-2.5 py-1.5 text-xs text-[#041626] dark:text-[#EFF6FA]"
            >
              {hubKeys.map((key) => (
                <option key={key} value={key}>
                  {resolveHubName(key, lang)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[#526D82] dark:text-[#85A3BC] block">
              {t.editor.destHubLabel}
            </label>
            <select
              value={selectedLine.destination_key}
              onChange={(e) =>
                markLineUpdated({ ...selectedLine, destination_key: e.target.value })
              }
              className="w-full bg-[#F4F8FB] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] rounded-md px-2.5 py-1.5 text-xs text-[#041626] dark:text-[#EFF6FA]"
            >
              {hubKeys.map((key) => (
                <option key={key} value={key}>
                  {resolveHubName(key, lang)}
                </option>
              ))}
            </select>
          </div>

          {/* Delete Line Control */}
          <div className="pt-3 border-t border-[#DCE6EE] dark:border-[#183550]">
            {!confirmingDeleteLine ? (
              <button
                type="button"
                onClick={() => setConfirmingDeleteLine(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-md border border-rose-200 dark:border-rose-800/70 bg-rose-50/70 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/70 text-xs font-medium transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                <span>{t.editor.deleteLineBtn}</span>
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleConfirmDeleteLine}
                  className="py-2 px-2.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                >
                  {t.editor.confirmDeleteLineBtn}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDeleteLine(false)}
                  className="py-2 px-2.5 rounded-md border border-[#DCE6EE] dark:border-[#183550] bg-[#F4F8FB] dark:bg-[#0D2236] text-xs font-medium text-[#041626] dark:text-[#EFF6FA] cursor-pointer"
                >
                  {t.editor.cancelDeleteBtn}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Public Announcement Banner Control */}
      {activeTab === 'banner' && (
        <div className="flex-1 min-h-0 overflow-y-auto transit-scroll p-3.5 space-y-3">
          <label className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-[#DCE6EE] dark:border-[#183550] bg-[#F4F8FB] dark:bg-[#0D2236] cursor-pointer">
            <span className="text-xs font-semibold text-[#041626] dark:text-[#EFF6FA]">
              {t.editor.bannerEnableLabel}
            </span>
            <input
              type="checkbox"
              checked={siteConfig.announcement.enabled}
              onChange={(e) => {
                setHasUnsavedBanner(true);
                onUpdateSiteConfig({
                  ...siteConfig,
                  announcement: {
                    ...siteConfig.announcement,
                    enabled: e.target.checked,
                  },
                });
              }}
              data-testid="admin-banner-enable-checkbox"
              className="w-4 h-4 accent-[#01A069] cursor-pointer"
            />
          </label>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[#526D82] dark:text-[#85A3BC] block">
              {t.editor.bannerTypeLabel}
            </label>
            <select
              value={siteConfig.announcement.type}
              onChange={(e) => {
                setHasUnsavedBanner(true);
                onUpdateSiteConfig({
                  ...siteConfig,
                  announcement: {
                    ...siteConfig.announcement,
                    type: e.target.value as AnnouncementType,
                  },
                });
              }}
              className="w-full bg-[#F4F8FB] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] rounded-md px-2.5 py-1.5 text-xs text-[#041626] dark:text-[#EFF6FA]"
            >
              <option value="info">{t.editor.bannerTypeInfo}</option>
              <option value="success">{t.editor.bannerTypeSuccess}</option>
              <option value="warning">{t.editor.bannerTypeWarning}</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[#526D82] dark:text-[#85A3BC] block">
              {t.editor.bannerTextArLabel}
            </label>
            <textarea
              dir="rtl"
              rows={2}
              value={siteConfig.announcement.text_ar}
              placeholder={t.editor.bannerPlaceholderAr}
              onChange={(e) => {
                setHasUnsavedBanner(true);
                onUpdateSiteConfig({
                  ...siteConfig,
                  announcement: {
                    ...siteConfig.announcement,
                    text_ar: e.target.value,
                  },
                });
              }}
              data-testid="admin-banner-ar-input"
              className="w-full bg-[#F4F8FB] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] rounded-md px-2.5 py-2 text-xs text-[#041626] dark:text-[#EFF6FA] resize-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[#526D82] dark:text-[#85A3BC] block">
              {t.editor.bannerTextEnLabel}
            </label>
            <textarea
              dir="ltr"
              rows={2}
              value={siteConfig.announcement.text_en}
              placeholder={t.editor.bannerPlaceholderEn}
              onChange={(e) => {
                setHasUnsavedBanner(true);
                onUpdateSiteConfig({
                  ...siteConfig,
                  announcement: {
                    ...siteConfig.announcement,
                    text_en: e.target.value,
                  },
                });
              }}
              data-testid="admin-banner-en-input"
              className="w-full bg-[#F4F8FB] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] rounded-md px-2.5 py-2 text-xs text-[#041626] dark:text-[#EFF6FA] resize-none"
            />
          </div>

          {(siteConfig.announcement.text_ar.trim() || siteConfig.announcement.text_en.trim()) && (
            <div className="space-y-1 pt-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#526D82] dark:text-[#85A3BC]">
                {t.editor.bannerPreviewTitle}
              </div>
              <div
                className={`rounded-lg border px-3 py-2 text-xs font-medium flex items-center gap-2 ${
                  siteConfig.announcement.type === 'warning'
                    ? 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-200'
                    : siteConfig.announcement.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-200'
                      : 'bg-sky-50 border-sky-200 text-sky-900 dark:bg-sky-950/50 dark:border-sky-800 dark:text-sky-200'
                }`}
              >
                <Megaphone className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                <span>
                  {lang === 'ar'
                    ? siteConfig.announcement.text_ar || siteConfig.announcement.text_en
                    : siteConfig.announcement.text_en || siteConfig.announcement.text_ar}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
