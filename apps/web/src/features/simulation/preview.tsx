// Dev preview for Track C components. Not wired into App.tsx; open
// /src/features/simulation/preview.html on the Vite dev server, or import SimulationPreview.
import { useEffect, useRef, useState } from 'react';
import caffeine from '../molecule/__fixtures__/caffeine.BRD-K02404261.json';
import piperacillin from '../molecule/__fixtures__/piperacillin.BRD-K86873305.json';
import type { Molecule3D } from '../molecule/geometry';
import { MoleculeViewer } from '../molecule/MoleculeViewer';
import { CellSimulation } from './CellSimulation';
import { TestCellGlyph, type TestCellState } from './TestCellGlyph';

const MOLECULES: Record<string, Molecule3D | null> = {
  'piperacillin BRD-K86873305': piperacillin as Molecule3D,
  'caffeine BRD-K02404261': caffeine as Molecule3D,
  none: null,
};
const GLYPHS: TestCellState[] = ['pending', 'next', 'running', 'survive', 'fail'];

function useFps(): number {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    const s = { raf: 0, frames: 0, t0: performance.now() };
    const tick = (t: number) => {
      s.frames++;
      if (t - s.t0 >= 1000) { setFps(Math.round((s.frames * 1000) / (t - s.t0))); s.frames = 0; s.t0 = t; }
      s.raf = requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(s.raf);
  }, []);
  return fps;
}

export function SimulationPreview() {
  const [state, setState] = useState<'idle' | 'scoring' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  const [auto, setAuto] = useState(false);
  const [molKey, setMolKey] = useState('piperacillin BRD-K86873305');
  const [custom, setCustom] = useState<Molecule3D | null>(null);
  const fps = useFps();
  const t0 = useRef(0);

  // "Run screen": scoring 0 -> 1 over 8 s, then done.
  useEffect(() => {
    if (!auto) return;
    t0.current = performance.now();
    const id = window.setInterval(() => {
      const k = Math.min(1, (performance.now() - t0.current) / 8000);
      setProgress(k);
      if (k >= 1) { setState('done'); setAuto(false); }
    }, 100);
    return () => window.clearInterval(id);
  }, [auto]);

  const molecule = custom ?? MOLECULES[molKey] ?? null;
  return (
    <div className="min-h-screen bg-[#f6f5f1] p-6 font-sans text-[#14131a]">
      <div className="mx-auto grid max-w-6xl gap-6">
        <header className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Track C preview</h1>
          <span className="rounded-md bg-white px-2 py-1 font-mono text-sm shadow-sm" data-testid="fps">{fps} fps</span>
        </header>

        <section className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {(['idle', 'scoring', 'done'] as const).map((s) => (
              <button key={s} onClick={() => { setAuto(false); setState(s); }} className={`rounded-md border px-3 py-1 ${state === s ? 'border-primary bg-primary text-white' : 'border-[#e6e2d8] bg-white'}`}>{s}</button>
            ))}
            <button onClick={() => { setProgress(0); setState('scoring'); setAuto(true); }} className="rounded-md border border-[#12a36a] bg-white px-3 py-1 text-[#12a36a]">run screen</button>
            <label className="ml-2 flex items-center gap-2">progress
              <input type="range" min={0} max={1} step={0.01} value={progress} onChange={(e) => setProgress(Number(e.target.value))} />
              <span className="w-10 font-mono">{progress.toFixed(2)}</span>
            </label>
          </div>
          <CellSimulation state={state} progress={progress} height={320} />
          <div className="grid grid-cols-3 gap-3">
            <CellSimulation state="idle" height={150} />
            <CellSimulation state="scoring" progress={0.7} height={150} />
            <CellSimulation state="done" height={150} />
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-[2fr_1fr]">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {Object.keys(MOLECULES).map((k) => (
                <button key={k} onClick={() => { setCustom(null); setMolKey(k); }} className={`rounded-md border px-3 py-1 ${!custom && molKey === k ? 'border-primary bg-primary text-white' : 'border-[#e6e2d8] bg-white'}`}>{k}</button>
              ))}
              <label className="rounded-md border border-dashed border-[#a3a0a8] bg-white px-3 py-1">load JSON
                <input type="file" accept="application/json" className="hidden" onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setCustom(JSON.parse(await f.text()) as Molecule3D);
                }} />
              </label>
            </div>
            <MoleculeViewer molecule={molecule} height={360} />
          </div>
          <div className="grid content-start gap-3">
            <MoleculeViewer molecule={null} height={170} />
            <MoleculeViewer molecule={caffeine as Molecule3D} height={170} />
          </div>
        </section>

        <section className="flex flex-wrap items-end gap-6 rounded-[14px] border border-[#e6e2d8] bg-white p-4">
          {GLYPHS.map((s) => (
            <div key={s} className="grid justify-items-center gap-1 text-xs text-[#6c6a74]">
              <TestCellGlyph state={s} />
              <TestCellGlyph state={s} size={24} />
              <span className="font-mono">{s}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
