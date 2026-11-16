import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const standaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = (window.navigator as NavigatorWithStandalone).standalone === true;
  return standaloneMedia || iosStandalone;
}

function detectIos(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const isAppleHandheld = /iPad|iPhone|iPod/.test(ua);
  const isIpadOsDesktopUa =
    window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1;
  return isAppleHandheld || isIpadOsDesktopUa;
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(detectStandalone);
  const [isIos] = useState<boolean>(detectIos);
  const [showGuideModal, setShowGuideModal] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(display-mode: standalone)');

    const handleDisplayModeChange = (event: MediaQueryListEvent) => {
      const iosStandalone = (window.navigator as NavigatorWithStandalone).standalone === true;
      setIsStandalone(event.matches || iosStandalone);
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      setShowGuideModal(false);
    };

    mediaQuery.addEventListener('change', handleDisplayModeChange);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      mediaQuery.removeEventListener('change', handleDisplayModeChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const triggerNativeInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice.outcome === 'accepted') {
        setShowGuideModal(false);
      }
      return choice.outcome === 'accepted';
    } catch {
      setDeferredPrompt(null);
      setShowGuideModal(true);
      return false;
    }
  }, [deferredPrompt]);

  const handleInstallClick = useCallback(() => {
    if (deferredPrompt) {
      void triggerNativeInstall();
      return;
    }
    setShowGuideModal(true);
  }, [deferredPrompt, triggerNativeInstall]);

  const closeGuideModal = useCallback(() => {
    setShowGuideModal(false);
  }, []);

  return {
    isStandalone,
    isIos,
    canPromptInstall: deferredPrompt !== null,
    showGuideModal,
    handleInstallClick,
    triggerNativeInstall,
    closeGuideModal,
  };
}
