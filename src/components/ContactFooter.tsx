import { Flag, Mail } from 'lucide-react';
import { getDir, TRANSLATIONS } from '../i18n';
import type { Lang } from '../types/transit';

const CONTACT_EMAIL = 'abdelwahab.kahoch@gmail.com';
const GITHUB_URL = 'https://github.com/evile92';

interface ContactFooterProps {
  lang: Lang;
  onOpenReport: () => void;
  className?: string;
}

/** Slim architectural footer bar for desktop sidebar and open mobile sheet. */
export function ContactFooter({ lang, onOpenReport, className = '' }: ContactFooterProps) {
  const t = TRANSLATIONS[lang];
  const dir = getDir(lang);

  return (
    <footer
      dir={dir}
      data-testid="contact-footer"
      className={`shrink-0 px-3.5 py-2 border-t border-[#DCE6EE] dark:border-[#183550] bg-[#F8FBFD] dark:bg-[#061321] flex items-center justify-between gap-2 ${className}`.trim()}
    >
      <span
        data-testid="dataset-updated-label"
        className="text-[11px] font-medium text-[#526D82] dark:text-[#85A3BC] truncate tabular-nums"
      >
        {t.footer.updatedLabel}
      </span>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onOpenReport}
          data-testid="footer-report-btn"
          className="h-7 px-2 rounded-md border border-[#DCE6EE] dark:border-[#183550] bg-white dark:bg-[#081828] text-[11px] font-medium text-[#4A657A] dark:text-[#85A3BC] hover:text-amber-700 dark:hover:text-amber-300 hover:border-amber-300 dark:hover:border-amber-700/60 transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
        >
          <Flag className="w-3 h-3 shrink-0" strokeWidth={1.75} />
          <span>{t.footer.reportBtn}</span>
        </button>

        <a
          href={`mailto:${CONTACT_EMAIL}`}
          aria-label={t.footer.emailAria}
          title={CONTACT_EMAIL}
          data-testid="contact-email"
          className="w-7 h-7 rounded-md border border-[#DCE6EE] dark:border-[#183550] bg-white dark:bg-[#081828] text-[#4A657A] dark:text-[#85A3BC] hover:text-[#0155A6] dark:hover:text-[#34D399] hover:border-[#0155A6]/40 dark:hover:border-[#34D399]/40 transition-colors inline-flex items-center justify-center"
        >
          <Mail className="w-3.5 h-3.5" strokeWidth={1.75} />
        </a>

        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t.footer.githubAria}
          title={GITHUB_URL}
          data-testid="contact-github"
          className="w-7 h-7 rounded-md border border-[#DCE6EE] dark:border-[#183550] bg-white dark:bg-[#081828] text-[#4A657A] dark:text-[#85A3BC] hover:text-[#041626] dark:hover:text-[#EFF6FA] hover:border-[#0155A6]/40 dark:hover:border-[#38BDF8]/40 transition-colors inline-flex items-center justify-center"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-3.5 h-3.5"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
        </a>
      </div>
    </footer>
  );
}
