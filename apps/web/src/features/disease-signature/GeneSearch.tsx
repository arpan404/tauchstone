import { useState } from 'react';
import type { Schema } from '@/api/types';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function GeneSearch({ genes }: { genes: Schema<'GeneStat'>[] }) {
  const [query, setQuery] = useState('');
  const matches = query.trim() ? genes.filter(g => g.symbol.toLowerCase().includes(query.trim().toLowerCase()) || g.entrez_id.includes(query.trim())) : [];
  return <section className="space-y-3" aria-label="Inspect signature genes">
    <div className="flex flex-wrap items-center gap-3"><label htmlFor="signature-gene" className="text-sm font-medium">Inspect a gene</label><Input id="signature-gene" placeholder="Symbol or Entrez ID" value={query} onChange={e => setQuery(e.target.value)} className="w-full sm:w-64" /></div>
    {query.trim() && <><p role="status" className="text-xs text-muted-foreground">{matches.length} matching genes{matches.length > 50 ? ', showing first 50' : ''}</p><Table aria-label="Matching signature genes"><TableHeader><TableRow><TableHead>Gene</TableHead><TableHead>Entrez ID</TableHead><TableHead>log2FC, AD minus control</TableHead><TableHead>FDR</TableHead></TableRow></TableHeader><TableBody>{matches.slice(0, 50).map(g => <TableRow key={g.entrez_id}><TableCell>{g.symbol}</TableCell><TableCell>{g.entrez_id}</TableCell><TableCell className="font-mono">{g.log2fc.toFixed(3)}</TableCell><TableCell className="font-mono">{g.fdr.toExponential(2)}</TableCell></TableRow>)}</TableBody></Table></>}
  </section>;
}
