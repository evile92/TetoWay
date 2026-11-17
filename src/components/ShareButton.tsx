import { Check, Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { TRANSLATIONS } from '../i18n';
import type { Lang } from '../types/transit';
import { shareTransitLink } from '../utils/deepLink';

interface ShareButtonProps {
  lang: Lang;
  label: string;
  getSharePayload: () => { url: string; title: string; text: string };
  testId?: string;
}

/** One-tap native share / clipboard copy button for lines and trip routes. */
export function ShareButton({ lang, label, getSharePayload, testId }: ShareButtonProps) {
  const t = TRANSLATIONS[lang];
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  async function handleShareClick() {
    const payload = getSharePayload();
    const outcome = await shareTransitLink(payload);
    if (outcome === 'copied') {
      setCopied(true);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        setCopied(false);
        timerRef.current = null;
      }, 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleShareClick()}
      data-testid={testId}
      title={copied ? t.share.copied : label}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
        copied
          ? 'bg-emerald-50 border-emerald-200 text-[#018A5B] dark:bg-emerald-950/60 dark:border-emerald-800/70 dark:text-[#34D399]'
          : 'bg-[#F4F8FB] border-[#DCE6EE] hover:border-[#B6CBD9] text-[#041626] dark:bg-[#0D2236] dark:border-[#183550] dark:hover:border-[#254E74] dark:text-[#EFF6FA]'
      }`}
    >
      {copied ? (
        <>
          <Check className="w-3 h-3 shrink-0" strokeWidth={2} />
          <span>{t.share.copied}</span>
        </>
      ) : (
        <>
          <Share2 className="w-3 h-3 shrink-0 text-[#0155A6] dark:text-[#38BDF8]" strokeWidth={1.75} />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
