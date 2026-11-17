import { Check, Copy, ExternalLink, Flag, Mail } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getDir, resolveHubName, resolveStopLabel, TRANSLATIONS } from '../i18n';
import type { BusLine, Lang } from '../types/transit';
import { copyTextToClipboard } from '../utils/deepLink';
import { BidiText, LineBadge } from './BidiText';
import { ModalShell } from './ModalShell';

const REPORT_EMAIL = 'abdelwahab.kahoch@gmail.com';
const GITHUB_ISSUES_URL = 'https://github.com/evile92/TetoWay/issues/new';

type IssueType = 'route' | 'location' | 'schedule' | 'other';

interface ReportIssueModalProps {
  open: boolean;
  lang: Lang;
  line: BusLine | null;
  onClose: () => void;
}

interface ReportIssueFormProps {
  lang: Lang;
  line: BusLine | null;
}

function ReportIssueForm({ lang, line }: ReportIssueFormProps) {
  const t = TRANSLATIONS[lang];
  const dir = getDir(lang);
  const [issueType, setIssueType] = useState<IssueType>('route');
  const [selectedStopId, setSelectedStopId] = useState('');
  const [details, setDetails] = useState('');
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const issueOptions: ReadonlyArray<{ id: IssueType; label: string }> = [
    { id: 'route', label: t.report.typeRoute },
    { id: 'location', label: t.report.typeLocation },
    { id: 'schedule', label: t.report.typeSchedule },
    { id: 'other', label: t.report.typeOther },
  ];

  const selectedIssueLabel =
    issueOptions.find((opt) => opt.id === issueType)?.label ?? t.report.typeOther;

  const pickedStop = line?.stops.find((s) => s.id === selectedStopId) ?? null;
  const lineSummary = line
    ? `Line ${line.number}: ${resolveHubName(line.origin_key, 'en')} -> ${resolveHubName(line.destination_key, 'en')}`
    : 'General Network';

  const subject = line
    ? `[TetoWay Data] Line ${line.number} - ${selectedIssueLabel}`
    : `[TetoWay Data] ${selectedIssueLabel}`;

  const cleanPageUrl = (() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('editor');
    return url.toString();
  })();

  const bodyLines = [
    `Scope: ${lineSummary}`,
    pickedStop
      ? `Stop (#${pickedStop.order}): ${pickedStop.name_en}${pickedStop.name_ar ? ` (${pickedStop.name_ar})` : ''} [${pickedStop.lat.toFixed(5)}, ${pickedStop.lng.toFixed(5)}]`
      : null,
    `Issue: ${selectedIssueLabel}`,
    details.trim() ? `Details: ${details.trim()}` : null,
    `Page: ${cleanPageUrl}`,
  ].filter((entry): entry is string => Boolean(entry));

  const reportBody = bodyLines.join('\n');
  const mailtoHref = `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(reportBody)}`;
  const githubHref = `${GITHUB_ISSUES_URL}?title=${encodeURIComponent(subject)}&body=${encodeURIComponent(reportBody)}`;

  async function handleCopyReport() {
    const ok = await copyTextToClipboard(`${subject}\n\n${reportBody}`);
    if (ok) {
      setCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 2000);
    }
  }

  return (
    <div dir={dir} className="space-y-3">
      {/* Context Card */}
      <div className="rounded-lg border border-[#DCE6EE] dark:border-[#183550] bg-[#F4F8FB] dark:bg-[#0D2236]/80 px-3 py-2.5">
        {line ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <LineBadge number={line.number} color={line.color} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-medium text-[#526D82] dark:text-[#85A3BC]">
                {t.report.lineContextLabel}
              </div>
              <div className="text-xs font-semibold text-[#041626] dark:text-[#EFF6FA] truncate flex items-center gap-1">
                <BidiText label={{ text: resolveHubName(line.origin_key, lang), dir }} />
                <span className="text-[#85A3BC] shrink-0">{lang === 'ar' ? '←' : '→'}</span>
                <BidiText label={{ text: resolveHubName(line.destination_key, lang), dir }} />
              </div>
            </div>
          </div>
        ) : (
          <div className="text-xs font-medium text-[#041626] dark:text-[#EFF6FA]">
            {t.report.generalContext}
          </div>
        )}
      </div>

      {/* Optional Stop Picker */}
      {line && line.stops.length > 0 && (
        <div className="space-y-1">
          <label
            htmlFor="report-stop-select"
            className="block text-[11px] font-medium text-[#4A657A] dark:text-[#85A3BC]"
          >
            {t.report.stopLabel}
          </label>
          <select
            id="report-stop-select"
            value={selectedStopId}
            onChange={(e) => setSelectedStopId(e.target.value)}
            data-testid="report-stop-select"
            className="w-full bg-[#F4F8FB] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] focus:border-[#0155A6] dark:focus:border-[#34D399] focus:outline-none rounded-md px-2.5 py-2 text-xs text-[#041626] dark:text-[#EFF6FA]"
          >
            <option value="">{t.report.anyStopOption}</option>
            {line.stops.map((stop) => {
              const label = resolveStopLabel(stop, lang);
              return (
                <option key={stop.id} value={stop.id}>
                  {`${stop.order}. ${label.text}`}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {/* Issue Category */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-medium text-[#4A657A] dark:text-[#85A3BC]">
          {t.report.issueTypeLabel}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {issueOptions.map((opt) => {
            const active = issueType === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setIssueType(opt.id)}
                data-testid={`report-type-${opt.id}`}
                className={`text-start px-2.5 py-2 rounded-md border text-[11px] font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#E6F4FA] dark:bg-[#0B2D48] border-[#0155A6] dark:border-[#38BDF8] text-[#0155A6] dark:text-[#38BDF8]'
                    : 'bg-[#F4F8FB] dark:bg-[#0D2236]/60 border-[#DCE6EE] dark:border-[#183550] text-[#041626] dark:text-[#EFF6FA] hover:border-[#B6CBD9] dark:hover:border-[#254E74]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Optional Free Text Details */}
      <div className="space-y-1">
        <label
          htmlFor="report-details-input"
          className="block text-[11px] font-medium text-[#4A657A] dark:text-[#85A3BC]"
        >
          {t.report.detailsLabel}
        </label>
        <textarea
          id="report-details-input"
          rows={2}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder={t.report.detailsPlaceholder}
          data-testid="report-details-input"
          className="w-full bg-[#F4F8FB] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] focus:border-[#0155A6] dark:focus:border-[#34D399] focus:outline-none rounded-md px-2.5 py-2 text-xs text-[#041626] dark:text-[#EFF6FA] placeholder-[#7C97AE] dark:placeholder-[#6B8BA5] resize-none"
        />
      </div>

      {/* Action Buttons */}
      <div className="space-y-2 pt-1">
        <a
          href={mailtoHref}
          data-testid="report-send-email"
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-[#0155A6] hover:bg-[#01468A] dark:bg-[#01A069] dark:hover:bg-[#018A5B] text-white text-xs font-semibold transition-colors"
        >
          <Mail className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          <span>{t.report.sendEmailBtn}</span>
        </a>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handleCopyReport()}
            data-testid="report-copy-btn"
            className="inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg border border-[#DCE6EE] dark:border-[#183550] bg-[#F4F8FB] dark:bg-[#0D2236] hover:border-[#B6CBD9] dark:hover:border-[#254E74] text-xs font-medium text-[#041626] dark:text-[#EFF6FA] transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#01A069] dark:text-[#34D399] shrink-0" strokeWidth={2} />
                <span>{t.report.copiedNotice}</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                <span>{t.report.copyDetailsBtn}</span>
              </>
            )}
          </button>

          <a
            href={githubHref}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="report-github-link"
            className="inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg border border-[#DCE6EE] dark:border-[#183550] bg-[#F4F8FB] dark:bg-[#0D2236] hover:border-[#B6CBD9] dark:hover:border-[#254E74] text-xs font-medium text-[#041626] dark:text-[#EFF6FA] transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
            <span>{t.report.openGithubBtn}</span>
          </a>
        </div>
      </div>
    </div>
  );
}

/** Accessible dialog for reporting inaccurate stops, routes, fares, or schedules. */
export function ReportIssueModal({ open, lang, line, onClose }: ReportIssueModalProps) {
  const t = TRANSLATIONS[lang];

  return (
    <ModalShell
      open={open}
      lang={lang}
      titleId="report-issue-modal-title"
      title={t.report.modalTitle}
      subtitle={t.report.modalSubtitle}
      icon={
        <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 flex items-center justify-center shrink-0">
          <Flag className="w-4 h-4 text-amber-700 dark:text-amber-300" strokeWidth={1.75} />
        </div>
      }
      testId="report-issue-modal"
      onClose={onClose}
    >
      {open && <ReportIssueForm key={line?.id ?? 'general'} lang={lang} line={line} />}
    </ModalShell>
  );
}
