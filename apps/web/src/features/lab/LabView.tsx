import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BookOpen, BrainCircuit, Check, Download, FileText, LoaderCircle, MessageSquare, Play, Send } from 'lucide-react';
import { api } from '@/api/client';
import { useCandidates } from '@/api/hooks';
import { useUi } from '@/store/ui';
import { BoundaryBanner } from '@/components/BoundaryBanner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import './lab.css';

type Report = {
  run_id: string; created_at: string; algorithm: string; task: string; seed: number;
  n_train: number; n_test: number; n_excluded: number; split: unknown; feature_count: number;
  metrics: { mae: number; baseline_mae: number; r2: number | null; spearman: number | null };
  training_sources: string[]; limitations: string[]; provenance: object;
};
type Model = { status: 'not_trained' | 'training' | 'ready' | 'failed'; report?: Report; error?: string };
type Source = { id: string; title: string; excerpt: string; source_url?: string };
type Answer = { answer: string; citations: Source[]; provider: string; model: string; mode: 'generated' | 'evidence_search'; boundary: string };
type Turn = { question: string; result: Answer };
type Status = { copilot: { provider: string; model: string; ready: boolean; detail: string }; model: Model };
const post = <T,>(path: string, body: object) => api<T>(path, { method: 'POST', body: JSON.stringify(body) });
const number = (value: number | null) => value == null ? 'Unavailable' : value.toFixed(3);

export function useLabModel() {
  return useQuery({ queryKey: ['lab-model'], queryFn: () => api<Model>('/lab/model'), refetchInterval: query => query.state.data?.status === 'training' ? 2000 : false });
}

function Copilot({ candidateId, sessionId }: { candidateId: string; sessionId: string | null }) {
  const client = useQueryClient();
  const key = ['lab-conversation', candidateId];
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Turn[]>(() => client.getQueryData<Turn[]>(key) ?? []);
  const [source, setSource] = useState<Source | null>(null);
  const chat = useMutation({
    mutationFn: (question: string) => post<Answer>('/lab/chat', { question, candidate_id: candidateId, ...(sessionId ? { session_id: sessionId } : {}) }),
    onSuccess: (result, question) => {
      setTurns(previous => {
        const next = [...previous.slice(-4), { question, result }];
        client.setQueryData(key, next);
        return next;
      });
      setSource(result.citations[0] ?? null);
    },
  });
  function clear() { setTurns([]); setSource(null); client.setQueryData(key, []); }
  return (
    <div className="copilot-workspace">
      <section className="copilot-conversation" aria-label="Research conversation">
        <div className="copilot-transcript" aria-live="polite">
          {!turns.length && <div className="copilot-empty">
            <span className="copilot-icon"><MessageSquare className="size-6" strokeWidth={1.5} /></span>
            <h2>What do you want to investigate?</h2>
            <p>Ask about the discovery signal, target context or evidence gaps. Every answer comes with excerpts you can inspect.</p>
          </div>}
          {turns.map((turn, index) => <article key={index} className="copilot-turn">
            <h3>{turn.question}</h3>
            <p className="copilot-answer-label">{turn.result.mode === 'evidence_search' ? 'Evidence search' : 'AI-selected evidence'}</p>
            <p className="copilot-answer">{turn.result.answer}</p>
            <div className="flex flex-wrap gap-2">{turn.result.citations.map(citation => <Button variant={source?.id === citation.id && source.excerpt === citation.excerpt ? 'secondary' : 'outline'} size="sm" key={citation.id} onClick={() => setSource(citation)} aria-label={`${citation.id}: ${citation.title}`}><FileText className="size-3.5" />{citation.id}: {citation.title}</Button>)}</div>
          </article>)}
          {chat.isPending && <p role="status" className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Reading candidate evidence. Local generation may take several seconds.</p>}
        </div>
        <div className="copilot-composer">
          <div className="mb-3 flex flex-wrap gap-1">{['What supports this discovery signal?', 'What evidence is missing?'].map(question => <Button key={question} variant="ghost" size="sm" onClick={() => setDraft(question)}>{question}<ArrowRight className="size-3" /></Button>)}</div>
          <form onSubmit={event => { event.preventDefault(); if (draft.trim() && !chat.isPending) chat.mutate(draft.trim()); }}>
            <label htmlFor="lab-question" className="sr-only">Research question</label>
            <Textarea id="lab-question" value={draft} maxLength={2000} onChange={event => setDraft(event.target.value)} placeholder="Ask a question about this candidate…" className="min-h-24 resize-none border-0 bg-transparent p-3 shadow-none focus-visible:ring-0" />
            <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2"><span className="text-[10px] text-muted-foreground">Collected evidence and committed results only</span><Button disabled={!draft.trim() || chat.isPending} type="submit" size="sm">{chat.isError ? 'Retry question' : 'Send question'}<Send className="size-3.5" /></Button></div>
          </form>
          {chat.isError && <Alert role="alert" className="mt-3">The research service could not answer. Your draft is preserved; retry when the service is available.</Alert>}
          {!!turns.length && <Button variant="ghost" size="xs" onClick={clear} className="mt-2 text-muted-foreground">Clear conversation</Button>}
        </div>
      </section>
      <aside className="copilot-sources" aria-label="Source notebook">
        <div className="mb-6 flex items-center gap-2"><BookOpen className="size-4 text-muted-foreground" /><h2 className="text-sm font-medium">Source notebook</h2></div>
        {source ? <><Badge variant="secondary" className="mb-3">{source.id}</Badge><h3 className="mb-3 text-sm font-medium">{source.title}</h3><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{source.excerpt}</p>{source.source_url && /^https?:\/\//.test(source.source_url) && <Button variant="link" className="mt-4 px-0" render={<a href={source.source_url} target="_blank" rel="noreferrer" />}>Open source<ArrowRight className="size-3.5" /></Button>}</> : <p className="text-sm leading-relaxed text-muted-foreground">Select a citation to inspect its source excerpt.</p>}
        <p className="mt-8 border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">Exact excerpts from collected evidence. Unrevealed experiment outcomes stay hidden.</p>
      </aside>
    </div>
  );
}

function Studio({ candidateId }: { candidateId: string | null }) {
  const client = useQueryClient();
  const model = useLabModel();
  const train = useMutation({ mutationFn: () => post<Model>('/lab/model/train', { algorithm: 'random_forest', seed: 20261105 }), onSuccess: result => { client.setQueryData(['lab-model'], result); void client.invalidateQueries({ queryKey: ['lab-model'] }); } });
  const predict = useMutation({ mutationFn: (id: string) => post<{ candidate_id: string; prediction: number; training_membership: string; run_id: string }>('/lab/model/predict', { candidate_id: id }) });
  const report = model.data?.report;
  const training = model.data?.status === 'training' || train.isPending;
  function download() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `tauchstone-model-${report.run_id}.json`; anchor.click(); URL.revokeObjectURL(url);
  }
  return <section className="model-studio">
    <div className="studio-intro"><span className="copilot-icon"><BrainCircuit className="size-6" strokeWidth={1.5} /></span><div><h2>Train a model from our discovery data.</h2><p>Can chemical structure predict expression reversal? Train a random forest, test it on different chemical scaffolds and compare it with a simple baseline.</p></div></div>
    <div className="studio-training-plan">
      <div><span>Input</span><strong>Molecular structure</strong><small>1,024 Morgan fingerprint features</small></div><ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" /><div><span>Learn</span><strong>Discovery reversal score</strong><small>GSE132903 ranking contexts only</small></div><ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" /><div><span>Evaluate</span><strong>Different chemical scaffolds</strong><small>Fixed internal split and baseline</small></div>
    </div>
    <div className="flex flex-wrap items-center gap-4 border-b border-border pb-6"><Button onClick={() => train.mutate()} disabled={model.isPending || training}>{training ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}Train random forest</Button><p role="status" className="text-xs text-muted-foreground">{model.isPending ? 'Reading model status…' : training ? 'Training job running. Checking the server every 2 seconds.' : model.data?.status === 'ready' ? 'Trained model ready' : model.data?.status === 'failed' ? 'Training failed' : 'Ready to train'}</p>{!!report && <Button variant="ghost" onClick={download} size="sm" className="ml-auto"><Download className="size-4" />Download report</Button>}</div>
    {(model.isError || train.isError || predict.isError) && <Alert role="alert" className="mt-4">The model service could not complete this action. Retry when it is available.</Alert>}
    {model.isError && <Button variant="outline" onClick={() => void model.refetch()} className="mt-3">Retry model status</Button>}
    {model.data?.error && <Alert role="alert" className="mt-4">{model.data.error}</Alert>}
    {report && <div className="studio-results">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3>Internal test results</h3><Badge variant="outline">Exploratory model</Badge></div>
      <p className="mt-2 text-sm text-muted-foreground">{report.n_train.toLocaleString()} training compounds; {report.n_test.toLocaleString()} internal test compounds; {report.n_excluded} excluded.</p>
      <dl className="studio-metrics">{[['Model MAE', report.metrics.mae], ['Training mean baseline MAE', report.metrics.baseline_mae], ['R²', report.metrics.r2], ['Spearman correlation', report.metrics.spearman]].map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{number(value as number | null)}</dd></div>)}</dl>
      <p className="text-sm leading-relaxed text-muted-foreground">{report.metrics.mae < report.metrics.baseline_mae ? 'Test MAE is below the training mean baseline.' : 'Test MAE does not improve on the training mean baseline.'} {report.metrics.r2 !== null && report.metrics.r2 < 0 ? 'Negative R² means this model performs worse than a constant test mean predictor.' : 'Internal evaluation is a first check, not evidence of external generalization.'}</p>
      <div className="studio-predict"><div><h3>Try the selected candidate</h3><p>This estimate is separate from the official ranking. No prediction interval is supplied.</p></div><Button variant="outline" disabled={!candidateId || predict.isPending || model.data?.status !== 'ready'} onClick={() => candidateId && predict.mutate(candidateId)}>{predict.isPending && <LoaderCircle className="size-4 animate-spin" />}Predict selected candidate</Button></div>
      {!candidateId && <p className="text-xs text-muted-foreground">Choose a candidate to try the trained model.</p>}
      {predict.data?.candidate_id === candidateId && <div className="rounded-lg border border-border bg-card p-4 text-sm"><strong>Predicted discovery consensus: {number(predict.data.prediction)}</strong><p className="mt-2 text-muted-foreground">Dataset membership: {predict.data.training_membership.replaceAll('_', ' ')}. A negative score indicates discovery expression reversal.</p></div>}
      <details className="studio-details"><summary>Limitations, data sources and run provenance</summary><p>No prediction interval is supplied. The model never changes official rankings or benchmark decisions.</p><ul>{report.limitations.map(item => <li key={item}>{item}</li>)}</ul><p>Training sources: {report.training_sources.join(', ')}</p><p>Seed {report.seed}. Run {report.run_id}.</p><pre>{JSON.stringify(report, null, 2)}</pre></details>
    </div>}
  </section>;
}

export function LabView() {
  const { selectedCandidateId, sessionId, setStep } = useUi();
  const candidates = useCandidates();
  const status = useQuery({ queryKey: ['lab-status'], queryFn: () => api<Status>('/lab/status'), refetchInterval: 15000 });
  const candidate = candidates.data?.candidates.find(item => item.id === selectedCandidateId);
  return <div className="research-lab flex h-full min-h-0 flex-col"><BoundaryBanner />
    <div className="lab-page-heading"><div><h1>AI lab</h1><p>{candidate?.name ?? selectedCandidateId ?? 'Choose a candidate to start a conversation.'}</p></div><Button variant="outline" size="sm" onClick={() => setStep('candidates')}>Choose candidate<ArrowRight className="size-3.5" /></Button></div>
    <Tabs defaultValue="copilot" className="lab-page-tabs"><div className="lab-tab-toolbar"><TabsList variant="line"><TabsTrigger value="copilot"><MessageSquare className="size-4" />Research copilot</TabsTrigger><TabsTrigger value="studio"><BrainCircuit className="size-4" />Model studio</TabsTrigger></TabsList><span role="status" className="lab-provider-status">{status.data?.copilot.ready && <Check className="size-3.5" />}{status.isPending ? 'Checking local copilot…' : status.isError ? 'Copilot status unavailable' : status.data?.copilot.ready ? `Local model ready: ${status.data.copilot.model}` : 'Local model unavailable. Evidence search remains available.'}</span></div>
      <TabsContent value="copilot" className="min-h-0">{selectedCandidateId ? <Copilot key={`${selectedCandidateId}:${sessionId}`} candidateId={selectedCandidateId} sessionId={sessionId} /> : <div className="lab-no-candidate"><MessageSquare className="size-8 text-primary" /><h2>Start with a candidate.</h2><Alert>Select a candidate before sending a research question.</Alert><Button onClick={() => setStep('candidates')}>Explore candidates<ArrowRight className="size-4" /></Button></div>}</TabsContent>
      <TabsContent value="studio" className="min-h-0 overflow-auto"><Studio candidateId={selectedCandidateId} /></TabsContent>
    </Tabs>
  </div>;
}
