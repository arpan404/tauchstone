"""Serial live-screen worker with durable state and periodic SSE snapshots."""
import logging
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import pandas as pd
from fastapi import HTTPException

from app.services import projects as store
from app.services.drug_detail import _NEURAL_CELLS
from app.services.repository import display_name
from app.settings import settings

executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='screen')
lock = threading.RLock()
started = {}
# Projects created together with an upload; removed again if their first screen fails.
pending = set()


def snapshot(ident):
    obj = store.get('screen', ident)
    if obj['status'] not in ('done', 'failed') and ident in started:
        obj['elapsed_s'] = time.monotonic() - started[ident]
    return obj


def update(ident, **fields):
    with lock:
        obj = snapshot(ident)
        obj.update(fields)
        store.put('screen', obj)


MAX_CELL_LINES = 24
# Mock mode only: real per-line gold signature counts with synthetic scores, so the
# offline demo fills the panel the same way a real screen does.
_MOCK_CELLS = [
    ('MCF7', 14690, -4.31), ('VCAP', 11966, -3.87), ('PC3', 10576, -4.02), ('A375', 9165, -3.66),
    ('HA1E', 8182, -3.94), ('A549', 7695, -3.71), ('HT29', 7476, -3.58), ('HCC515', 4399, -3.42),
    ('HEPG2', 3720, -3.29), ('HELA', 3393, -3.35), ('YAPC', 3004, -3.12), ('NPC', 2314, -3.48),
    ('SKBR3', 1725, -2.97), ('HS578T', 1656, -2.88), ('MDAMB231', 1594, -2.91), ('MCF10A', 1592, -2.84),
    ('BT20', 1575, -2.79), ('ASC', 1327, -2.66), ('NEU', 1171, -3.05), ('HME1', 1137, -2.58),
    ('SKB', 870, -2.41), ('CD34', 745, -2.37), ('PHH', 744, -2.29), ('ASC.C', 635, -2.18),
]


def cell_lines(frame):
    """The MAX_CELL_LINES lines with the most signatures scored so far, for the live panel."""
    rows = frame.sort_values(['n_scored', 'cell_id'], ascending=[False, True]).head(MAX_CELL_LINES)
    return [dict(cell_id=str(r.cell_id), n_scored=int(r.n_scored),
                 best_consensus=None if pd.isna(r.best_consensus) else float(r.best_consensus),
                 neural=str(r.cell_id) in _NEURAL_CELLS) for r in rows.itertuples()]


def mock_cell_lines(fraction):
    rows = [dict(cell_id=c, n_scored=int(n * fraction), best_consensus=b) for c, n, b in _MOCK_CELLS]
    return cell_lines(pd.DataFrame(rows))


def hits(frame):
    return [dict(rank=int(r.pool_rank), drug_id=r.pert_id, name=display_name(r.drug_name),
                 consensus=float(r.consensus_median)) for r in frame.head(10).itertuples()]


def submit(project_id, signature_id=None, signature=None, new_project=False):
    store.get('project', project_id)
    if signature is None and signature_id not in store.BUILTIN:
        raise HTTPException(422, 'Unknown built-in signature_id')
    # Only the original, unmodified primary project is preregistered.
    prereg = project_id == 'GSE132903' and signature_id == 'GSE132903' and signature is None
    ident = str(uuid.uuid4())
    if signature is not None:
        store.save_frame(signature, store.root() / f'{ident}-signature.parquet', 'screen_upload')
        store.save_frame(signature, store.root() / f'{project_id}-signature.parquet', 'project_upload')
    obj = dict(id=ident, project_id=project_id, signature_id=signature_id, status='queued',
               n_signatures=0, n_scored=0, elapsed_s=0, preregistered=prereg, top=[],
               cell_lines=[], n_cell_lines=None)
    store.put('screen', obj)
    if new_project:
        pending.add(project_id)
    executor.submit(run, ident, signature)
    return obj


def run(ident, signature):
    started[ident] = time.monotonic()
    try:
        update(ident, status='mapping')
        obj = snapshot(ident)
        if settings.mock:
            time.sleep(.5)
            rows = store.mock_candidates()
            top = [dict(rank=r['rank'], drug_id=r['id'], name=r['name'], consensus=r['consensus'])
                   for r in rows[:10]]
            update(ident, status='scoring', n_signatures=113310)
            for i in range(1, 11):
                time.sleep(.5)
                update(ident, n_scored=11331*i, top=top, cell_lines=mock_cell_lines(i / 10),
                       n_cell_lines=83)
            update(ident, status='aggregating')
            time.sleep(.5)
            n = len(rows)
        else:
            from pipelines.lincs.screen_job import clinical_pool, run_screen
            if signature is None:
                signature = pd.read_parquet(store.base() / f"signatures/{obj['signature_id']}__main.parquet")
            update(ident, status='scoring', n_genes_mapped=len(signature))

            def progress(n, total, top, cells):
                update(ident, n_scored=n, n_signatures=total, top=hits(top),
                       cell_lines=cell_lines(cells), n_cell_lines=len(cells))

            ranking = run_screen(signature, progress)
            update(ident, status='aggregating')
            pool = clinical_pool(ranking)
            store.save_frame(pool, store.root() / f'{ident}.parquet', 'live_screen',
                             signature_id=obj['signature_id'] or 'upload', gold_only=True,
                             standardisation='ranking-gold-only', min_contexts=3)
            n = len(pool)
            update(ident, top=hits(pool))
        with lock:
            project = store.get('project', obj['project_id'])
            # The preregistered project keeps its frozen run: a live re-screen is shown on
            # the Screen page but never replaces the frozen candidates or n_ranked.
            if not str(project.get('last_screen_id') or '').startswith('frozen-'):
                project.update(last_screen_id=ident, n_ranked=n, preregistered=obj['preregistered'],
                               n_attack_ready=len(store.attack_ids()) if obj['preregistered'] else None)
                store.put('project', project)
            update(ident, status='done', n_ranked=n)
        pending.discard(obj['project_id'])
    except Exception as exc:
        logging.getLogger(__name__).exception('Screen %s failed', ident)
        update(ident, status='failed', error=str(exc))
        _discard_pending(store.get('screen', ident).get('project_id'))
    finally:
        started.pop(ident, None)


def _discard_pending(project_id):
    """Delete a project created for an upload whose first screen failed."""
    if project_id not in pending:
        return
    pending.discard(project_id)
    try:
        # Keep the failed screen record so its stream still reports the error.
        store.delete(project_id, with_screens=False)
    except Exception:
        logging.getLogger(__name__).exception('Could not discard project %s', project_id)
