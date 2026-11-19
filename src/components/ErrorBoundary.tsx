import { AlertTriangle, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Component } from 'react';
import { getDir, TRANSLATIONS } from '../i18n';
import type { Lang } from '../types/transit';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

function detectActiveLang(): Lang {
  try {
    if (document.documentElement.lang === 'ar') return 'ar';
    if (window.localStorage.getItem('tetoway-lang') === 'ar') return 'ar';
  } catch {
    // Fallback to English if storage or DOM inspection fails
  }
  return 'en';
}

/** Top-level crash boundary preventing blank white screens on unexpected runtime errors. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const lang = detectActiveLang();
    const dir = getDir(lang);
    const t = TRANSLATIONS[lang];

    return (
      <div
        dir={dir}
        data-testid="app-error-boundary"
        className="w-full h-[100dvh] flex items-center justify-center p-6 bg-[#F2F7FA] dark:bg-[#05101C] text-[#041626] dark:text-[#EFF6FA]"
      >
        <div className="w-full max-w-sm rounded-xl border border-[#DCE6EE] dark:border-[#183550] bg-white dark:bg-[#081828] p-6 text-center space-y-4 shadow-sm">
          <div className="mx-auto w-10 h-10 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/50 inline-flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-300" strokeWidth={1.75} />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-sm font-bold">{t.app.unexpectedErrorTitle}</h1>
            <p className="text-xs text-[#526D82] dark:text-[#85A3BC] leading-relaxed">
              {t.app.unexpectedErrorDesc}
            </p>
          </div>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#0155A6] hover:bg-[#01468A] dark:bg-[#01A069] dark:hover:bg-[#018A5B] text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
            <span>{t.app.reloadBtn}</span>
          </button>
        </div>
      </div>
    );
  }
}
