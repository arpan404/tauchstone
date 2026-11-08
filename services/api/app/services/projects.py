"""Persistent project index and upload validation. Hidden outcomes are never loaded."""
import io
import json
import logging
import sqlite3
import threading
import uuid
from datetime import UTC, datetime

import numpy as np
import pandas as pd
from fastapi import HTTPException

from app.services.repository import MOCK_WORLD_PATH, display_name
from app.settings import settings
from pipelines.common.provenance import Provenance

log = logging.getLogger(__name__)
_lock = threading.RLock()
_warned = False


def base():
    return settings.data_dir / 'processed'


def root():
    path = settings.data_dir / 'app' / ('mock' if settings.mock else 'live')
    path.mkdir(parents=True, exist_ok=True)
    return path


def db():
    conn = sqlite3.connect(root() / 'projects.sqlite')
    conn.execute('CREATE TABLE IF NOT EXISTS records (kind TEXT, id TEXT, body TEXT, PRIMARY KEY(kind,id))')
    return conn


def put(kind, obj):
    with _lock, db() as conn:
        conn.execute('INSERT OR REPLACE INTO records VALUES (?,?,?)', (kind, obj['id'], json.dumps(obj)))
    return obj


def get(kind, ident):
    with db() as conn:
        row = conn.execute('SELECT body FROM records WHERE kind=? AND id=?', (kind, ident)).fetchone()
    if not row:
        raise HTTPException(404, f'{kind} not found')
    return json.loads(row[0])


def all_records(kind):
    with db() as conn:
        return [json.loads(r[0]) for r in conn.execute('SELECT body FROM records WHERE kind=? ORDER BY rowid', (kind,))]


def attack_ids():
    if settings.mock:
        return set(json.loads(MOCK_WORLD_PATH.read_text())['truth'])
    path = base() / 'tauchstone/truth_table.parquet'
    return set(pd.read_parquet(path, columns=['candidate_id'])['candidate_id'].astype(str)) if path.exists() else set()


BUILTIN = ('GSE132903', 'GSE173955')
FROZEN = 'GSE132903'


def create(name, signature_id=None, ident=None):
    if signature_id not in (None, *BUILTIN):
        raise HTTPException(422, 'Unknown built-in signature_id')
    if not isinstance(name, str) or not name.strip():
        raise HTTPException(422, 'name is required')
    if signature_id and ident is None:
        # Each built-in signature has exactly one project; reuse it instead of duplicating.
        return get('project', signature_id)
    return put('project', dict(id=ident or str(uuid.uuid4()), name=name.strip(),
        kind='builtin' if signature_id else 'upload', signature_id=signature_id,
        preregistered=ident == 'GSE132903', created_at=datetime.now(UTC).isoformat(),
        n_ranked=None, n_attack_ready=None, last_screen_id=None))


def delete(project_id, with_screens=True):
    """Remove an upload project, its screens and its saved signature. Built-ins are permanent."""
    p = get('project', project_id)
    if p.get('kind') == 'builtin':
        raise HTTPException(403, 'Built-in projects cannot be deleted')
    with _lock, db() as conn:
        screens = [s['id'] for s in map(json.loads, (r[0] for r in conn.execute(
            'SELECT body FROM records WHERE kind=?', ('screen',))))
            if with_screens and s.get('project_id') == project_id]
        conn.execute('DELETE FROM records WHERE kind=? AND id=?', ('project', project_id))
        for sid in screens:
            conn.execute('DELETE FROM records WHERE kind=? AND id=?', ('screen', sid))
    for stem in [project_id + '-signature', *screens, *(s + '-signature' for s in screens)]:
        for path in (root() / f'{stem}.parquet', root() / f'{stem}.parquet.provenance.json'):
            path.unlink(missing_ok=True)
    return dict(id=project_id, deleted=True)


def template_csv():
    """Example upload CSV: a curated example if one is installed, else landmark genes at zero."""
    from app.services.repository import REPO_ROOT
    for path in (settings.data_dir / 'example_signature.csv', REPO_ROOT / 'data/demo/example_signature.csv'):
        if path.is_file():
            content = path.read_bytes()
            try:
                parse_csv(content)
                return content
            except HTTPException:
                log.warning('Example signature %s fails validation; using the generated template', path)
    genes = _genes()
    genes = genes[genes.is_landmark.astype(bool)].dropna(subset=['symbol'])
    genes = genes.drop_duplicates('symbol').head(60)
    lines = ['gene,log2fc,stat,fdr'] + [f'{s},0,0,1' for s in genes.symbol.astype(str)]
    content = ('\n'.join(lines) + '\n').encode()
    parse_csv(content)
    return content


def _genes():
    if settings.mock:
        world = json.loads(MOCK_WORLD_PATH.read_text())
        genes = pd.DataFrame(world['signatures']['GSE132903__main']['genes'])
        genes['is_landmark'] = True
        return genes
    return pd.read_parquet(base() / 'lincs/genes.parquet')


def seed():
    for sid, tissue in [('GSE132903', 'middle temporal gyrus'), ('GSE173955', 'hippocampus')]:
        try:
            get('project', sid)
            continue
        except HTTPException:
            pass
        p = create("Alzheimer's · " + tissue, sid, sid)
        if sid == 'GSE132903':
            rows = mock_candidates() if settings.mock else pd.read_parquet(
                base() / 'scores/GSE132903__main__candidate_pool.parquet').to_dict('records')
            p.update(n_ranked=len(rows), n_attack_ready=len(attack_ids()), last_screen_id='frozen-GSE132903')
            put('project', p)
            put('screen', dict(id=p['last_screen_id'], project_id=sid, signature_id=sid,
                status='done', n_signatures=113310, n_scored=113310, elapsed_s=0,
                n_ranked=len(rows), preregistered=True, top=[]))


def save_frame(frame, path, step, **params):
    frame.to_parquet(path, index=False)
    Provenance(step=step, dataset_accession=params.pop('signature_id', 'upload'),
               parameters=params, random_seed=20261105).write(path)


def parse_csv(content, genes=None):
    try:
        frame = pd.read_csv(io.BytesIO(content), dtype={'gene': str})
        frame.columns = frame.columns.str.strip().str.lower()
        if not {'gene', 'log2fc', 'fdr'} <= set(frame.columns):
            raise ValueError('Required columns: gene, log2fc, fdr; stat is optional')
        if genes is None:
            genes = _genes()
        genes = genes.copy()
        genes['entrez_id'] = genes.entrez_id.astype(str)
        symbols = genes.drop_duplicates('symbol').set_index('symbol').entrez_id
        names = frame.gene.astype(str).str.strip()
        mapped = names.where(names.isin(genes.entrez_id), names.str.upper().map(symbols))
        frame['entrez_id'] = mapped
        for col in ['log2fc', 'fdr'] + (['stat'] if 'stat' in frame else []):
            frame[col] = pd.to_numeric(frame[col], errors='raise')
            if not np.isfinite(frame[col]).all():
                raise ValueError(f'{col} must contain finite numbers')
        if not frame.fdr.between(0, 1).all():
            raise ValueError('fdr must be between 0 and 1')
        if 'stat' not in frame:
            frame['stat'] = frame.log2fc
        frame = frame[frame.entrez_id.notna()].drop_duplicates('entrez_id')
        landmarks = set(genes.loc[genes.is_landmark.astype(bool), 'entrez_id'])
        n = frame.entrez_id.isin(landmarks).sum()
        if n < 50:
            raise ValueError(f'Only {n} landmark genes mapped; at least 50 required')
        return frame
    except (ValueError, KeyError, UnicodeError, pd.errors.ParserError) as exc:
        raise HTTPException(422, str(exc)) from exc


def mock_candidates():
    return json.loads(MOCK_WORLD_PATH.read_text())['candidates']


def candidates(project_id, approved=None, brain_cells=None, penetrant=None, min_contexts=None, limit=100):
    global _warned
    p = get('project', project_id)
    sid = p.get('last_screen_id')
    if not sid:
        raise HTTPException(409, 'Project not screened')
    if settings.mock:
        rows = [dict(c) for c in mock_candidates()]
    else:
        path = (base() / 'scores/GSE132903__main__candidate_pool.parquet' if sid.startswith('frozen-')
                else root() / f'{sid}.parquet')
        rows = []
        for r in pd.read_parquet(path).to_dict('records'):
            rows.append(dict(id=r['pert_id'], rank=int(r['pool_rank']), name=display_name(r['drug_name']),
                consensus=r['consensus_median'], consensus_iqr=[r['consensus_q25'], r['consensus_q75']],
                n_ranking_contexts=int(r['n_ranking_contexts']),
                scores={k: r[f'z_{k}_median'] for k in ['wtcs', 'ks', 'cosine']}, by_cell_line=[],
                approval_status={'status': 'approved' if r['max_clinical_stage'] == 'APPROVAL' else 'investigational'}))
    gap_path = base() / 'evidence/gaps.parquet'
    gaps = {}
    if gap_path.exists() and not settings.mock:
        gaps = {r['pert_id']: r for r in pd.read_parquet(gap_path).to_dict('records')}
    elif not _warned:
        log.warning('Evidence gaps unavailable; gap fields default to false/unknown')
        _warned = True
    ready = attack_ids()
    for c in rows:
        g = gaps.get(c['id'], {})
        exp = g.get('exposure', {})
        if isinstance(exp, str):
            exp = json.loads(exp)
        label = g.get('exposure_label', exp.get('label', 'unspecified'))
        neural = g.get('brain_cells', g.get('brain_cells_json', []))
        if isinstance(neural, str):
            neural = json.loads(neural)
        penetration = g.get('penetrant')
        if penetration is None and label.startswith('predicted '):
            if 'penetrant' in label:
                penetration = True
            elif 'low' in label:
                penetration = False
        c.update(brain_cells=len(neural) > 0, penetrant=penetration,
                 exposure_label=label, cancer_lines_only=bool(g.get('cancer_lines_only', False)),
                 attack_ready=p['preregistered'] and c['id'] in ready,
                 preregistered=p['preregistered'])
    total = len(rows)
    rows = [c for c in rows if
            (approved is None or (c.get('approval_status', {}).get('status') == 'approved') == approved)
            and (brain_cells is None or c['brain_cells'] == brain_cells)
            and (penetrant is None or c['penetrant'] == penetrant)
            and (min_contexts is None or c['n_ranking_contexts'] >= min_contexts)]
    return dict(project_id=project_id, screen_id=sid, n_ranked=total, n_total_eligible=len(rows),
                preregistered=p['preregistered'], candidates=rows[:limit])
