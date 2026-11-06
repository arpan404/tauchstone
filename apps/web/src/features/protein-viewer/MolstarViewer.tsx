import { useEffect, useRef, useState } from 'react';
import molstarUrl from 'molstar/build/viewer/molstar.js?url';
import 'molstar/build/viewer/molstar.css';

interface MolstarViewerInstance {
  loadStructureFromUrl: (url: string, format: string, isBinary: boolean) => Promise<void>;
  dispose?: () => void;
}

declare global {
  interface Window {
    molstar?: {
      Viewer: {
        create: (element: string | HTMLElement, opts: Record<string, unknown>) => Promise<MolstarViewerInstance>;
      };
    };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadMolstarScript(): Promise<void> {
  if (window.molstar?.Viewer) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = molstarUrl;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        scriptPromise = null;
        reject(new Error('Mol* script failed to load.'));
      };
      document.head.appendChild(el);
    });
  }
  return scriptPromise;
}

/**
 * Minimal Mol* viewer. Loads a structure from a local URL (works offline —
 * the file is served by the API / public dir). Lazy-loaded via React.lazy so
 * Mol* does not bloat first paint.
 */
export function MolstarViewer({ url }: { url: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<MolstarViewerInstance | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    async function init() {
      try {
        await loadMolstarScript();
        const host = hostRef.current;
        if (disposed || !window.molstar?.Viewer || !host) return;
        const viewer = await window.molstar.Viewer.create(host, {
          layoutIsExpanded: false,
          viewportBackgroundColor: '#182125',
          layoutShowControls: false,
          viewportShowExpand: false,
          collapseLeftPanel: true,
        });
        if (disposed) {
          viewer.dispose?.();
          return;
        }
        viewerRef.current = viewer;
        await viewer.loadStructureFromUrl(url, 'mmcif', false);
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : 'Failed to load structure.');
      }
    }
    void init();
    return () => {
      disposed = true;
      try {
        viewerRef.current?.dispose?.();
      } catch {
        /* ignore teardown errors */
      }
      viewerRef.current = null;
    };
  }, [url]);

  if (error) {
    return (
      <div
        role="alert"
        className="flex h-[320px] flex-col items-center justify-center gap-1 rounded border border-neutral-200 bg-neutral-50 p-4 text-center"
      >
        <p className="text-sm font-medium text-neutral-700">3D viewer unavailable</p>
        <p className="max-w-md text-xs text-neutral-500">{error}</p>
        <a className="mt-1 text-xs text-teal-800 underline" href={url} target="_blank" rel="noreferrer">
          Download structure file
        </a>
      </div>
    );
  }
  return (
    <div
      ref={hostRef}
      role="img"
      aria-label="3D protein structure viewer"
      style={{ width: '100%', height: 320, position: 'relative', overflow: 'hidden' }}
      className="rounded border border-neutral-200"
    />
  );
}
