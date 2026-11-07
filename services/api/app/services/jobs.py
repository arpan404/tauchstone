"""Serial live-screen worker with durable state and periodic SSE snapshots."""
import logging
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import pandas as pd
from fastapi import HTTPException

from app.services import projects as store
from app.settings import settings

executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='screen')
lock = threading.RLock()
started = {}


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


def hits(frame):
    return [dict(rank=int(r.pool_rank), drug_id=r.pert_id, name=r.drug_name,
                 consensus=float(r.consensus_median)) for r in frame.head(10).itertuples()]


def submit(project_id, signature_id=None, signature=None):
    store.get('project', project_id)
    if signature is None and signature_id not in ('GSE132903', 'GSE173955'):
        raise HTTPException(422, 'Unknown built-in signature_id')
    # Only the original, unmodified primary project is preregistered.
    prereg = project_id == 'GSE132903' and signature_id == 'GSE132903' and signature is None
    ident = str(uuid.uuid4())
    if signature is not None:
        store.save_frame(signature, store.root() / f'{ident}-signature.parquet', 'screen_upload')
        store.save_frame(signature, store.root() / f'{project_id}-signature.parquet', 'project_upload')
    obj = dict(id=ident, project_id=project_id, signature_id=signature_id, status='queued',
               n_signatures=0, n_scored=0, elapsed_s=0, preregistered=prereg, top=[])
    store.put('screen', obj)
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
                update(ident, n_scored=11331*i, top=top)
            update(ident, status='aggregating')
            time.sleep(.5)
            n = len(rows)
        else:
            from pipelines.lincs.screen_job import clinical_pool, run_screen
            if signature is None:
                signature = pd.read_parquet(store.base() / f"signatures/{obj['signature_id']}__main.parquet")
            update(ident, status='scoring', n_genes_mapped=len(signature))

            def progress(n, total, top):
                update(ident, n_scored=n, n_signatures=total, top=hits(top))

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
            project.update(last_screen_id=ident, n_ranked=n, preregistered=obj['preregistered'],
                           n_attack_ready=len(store.attack_ids()))
            store.put('project', project)
            update(ident, status='done', n_ranked=n)
    except Exception as exc:
        logging.getLogger(__name__).exception('Screen %s failed', ident)
        update(ident, status='failed', error=str(exc))
    finally:
        started.pop(ident, None)
