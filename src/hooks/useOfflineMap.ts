import { useCallback, useEffect, useState } from 'react';
import {
  clearOfflineMapCache,
  downloadOfflineMap,
  isOfflineMapCached,
  supportsOfflineMapCache,
} from '../utils/offlineMapCache';

export function useOfflineMap() {
  const [supported] = useState<boolean>(supportsOfflineMapCache);
  const [isCached, setIsCached] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    isOfflineMapCached().then((cached) => {
      if (active) {
        setIsCached(cached);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const openModal = useCallback(() => {
    setError(false);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  const startDownload = useCallback(async () => {
    if (isDownloading || !supported) return;
    setIsDownloading(true);
    setProgress(0);
    setError(false);
    try {
      await downloadOfflineMap((pct) => setProgress(pct));
      setIsCached(true);
      setProgress(100);
    } catch {
      setError(true);
    } finally {
      setIsDownloading(false);
    }
  }, [isDownloading, supported]);

  const removeCache = useCallback(async () => {
    if (isDownloading) return;
    await clearOfflineMapCache();
    setIsCached(false);
    setProgress(0);
    setError(false);
  }, [isDownloading]);

  return {
    supported,
    isCached,
    isDownloading,
    progress,
    error,
    modalOpen,
    openModal,
    closeModal,
    startDownload,
    removeCache,
  };
}
