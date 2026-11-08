"""Offline report presentation. Only public DrugDetail fields enter the template."""
from __future__ import annotations

import base64
import importlib
import json
from functools import lru_cache
import re
import unicodedata
from datetime import date
from hashlib import sha256
from pathlib import Path
from typing import Protocol

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.services.repository import NotFoundError
from app.settings import settings

ROOT = Path(__file__).resolve().parents[4]
APP = Path(__file__).resolve().parents[1]
BOUNDARY = 'Research use only. Not clinical evidence. A structure is target context, never binding evidence.'


class DrugDetail(Protocol):
    def get_drug_detail(self, drug_id: str, project_id: str | None) -> dict: ...


class DetailUnavailableError(Exception):
    """Real detail service has not been installed."""


class DefaultDrugDetail:
    def get_drug_detail(self, drug_id: str, project_id: str | None) -> dict:
        if not settings.mock:
            module = importlib.import_module('app.services.drug_detail')
            return module.get_drug_detail(drug_id, project_id)
        if not settings.mock:
            raise DetailUnavailableError('Drug detail service unavailable; mock fallback disabled')
        # Explicit allowlist also prevents path traversal. Projects cannot silently reuse fixtures.
        if project_id not in (None, 'builtin-gse132903', 'GSE132903'):
            raise NotFoundError('Mock report project not found')
        if drug_id.lower() not in {'piperacillin', 'brinzolamide'}:
            raise NotFoundError('Mock report drug not found')
        return json.loads((APP / 'fixtures' / 'reports' / f'{drug_id.lower()}.json').read_text())


def get_drug_detail_provider() -> DrugDetail:
    return DefaultDrugDetail()


def next_experiment(gaps: dict) -> str:
    if not gaps.get('brain_cells'):
        return 'Test reversal in a neural model across a concentration range'
    if not gaps.get('exposure', {}).get('measured_available'):
        return 'Measure brain exposure'
    if not gaps.get('has_targets'):
        return 'Measure target engagement'
    if len(gaps.get('times_h', [])) < 2:
        return 'Test reversal at an additional time point'
    return 'Replicate reversal in an independent neural model'


VERDICT_LABEL = {
    'SUPPORTED_SO_FAR': 'SUPPORTED SO FAR',
    'FRAGILE_CONTEXT_DEPENDENT': 'FRAGILE / CONTEXT-DEPENDENT',
    'INSUFFICIENT_EVIDENCE': 'INSUFFICIENT EVIDENCE',
}
TYPE_LABEL = {
    'held_out_cohort': 'Held-out cohort',
    'composition_adjusted': 'Composition-adjusted',
    'lincs_context': 'LINCS held-out',
    'brain_exposure': 'Brain exposure',
    'cell_type': 'Cell type',
}


def _num(value: object) -> float | None:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def session_snapshot(state: dict, preregistered: bool = True) -> dict:
    """Report view of an attack session: revealed tests in reveal order, hidden tests as a count.

    Built from the engine's public state(); every field is allowlisted, so an unrevealed
    outcome, value or label can never reach the template.
    """
    history = list(state.get('history') or [])
    revealed = []
    for h in history:
        value, threshold = _num(h.get('value')), _num(h.get('threshold'))
        revealed.append({
            'label': re.sub(r'(\d)\s*uM\b', r'\1 µM', str(h.get('label', 'unspecified'))),
            'type': TYPE_LABEL.get(str(h.get('type')), str(h.get('type', 'unspecified'))),
            'outcome': 'Survived' if h.get('outcome') == 'survive' else 'Failed',
            'value': value, 'threshold': threshold,
            'rule': str(h.get('rule') or '') if threshold is None else '',
            'before': _num(h.get('belief_before')), 'after': _num(h.get('belief_after')),
        })
    current = _num((state.get('belief') or {}).get('p_claim_holds'))
    start = revealed[0]['before'] if revealed and revealed[0]['before'] is not None else current
    contexts = state.get('contexts') or []
    budget = int(state.get('budget') or 0)
    return {
        'verdict': VERDICT_LABEL.get(str(state.get('verdict')), 'INSUFFICIENT EVIDENCE'),
        'claim': (state.get('claim') or {}).get('text'),
        'p_start': start, 'p_current': current,
        'budget': budget, 'budget_used': budget - int(state.get('budget_remaining') or 0),
        'revealed': revealed,
        'n_hidden': sum(1 for c in contexts if c.get('status') == 'hidden'),
        'preregistered': preregistered,
    }


def slug(name: object) -> str:
    ascii_name = unicodedata.normalize('NFKD', str(name or '')).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', ascii_name.lower()).strip('-') or 'drug'


def report_filename(detail: dict, drug_id: str, today: date | None = None) -> str:
    """tauchstone-<drug-name-slug>-<YYYY-MM-DD>, without extension."""
    return f'tauchstone-{slug(detail.get("name") or drug_id)}-{(today or date.today()).isoformat()}'


def withdrawn_label(approval: dict) -> str | None:
    """'withdrawn 1980', or 'withdrawn in Vietnam 2000' for a single-country withdrawal (ChEMBL 37)."""
    if not approval.get('withdrawn'):
        return None
    countries = [c.strip() for c in str(approval.get('withdrawn_country') or '').split(';') if c.strip()]
    where = f' in {countries[0]}' if len(countries) == 1 and countries[0].lower() != 'worldwide' else ''
    year = approval.get('withdrawn_year')
    return f'withdrawn{where}{f" {int(year)}" if year else ""}'


def render_html(detail: dict, project_id: str | None = None, *, fallback: bool = False,
                session: dict | None = None, title: str | None = None) -> str:
    gaps = detail.get('gaps', {})
    provenance = detail.get('provenance') or {}
    # Never pass the original detail object: hidden fields and arbitrary nested data stay out.
    view = {key: detail.get(key) for key in (
        'name', 'pool_rank', 'consensus', 'n_contexts', 'approval_status',
        'n_hidden_tests', 'attack_ready', 'preregistered',
    )}
    view['cells'] = ', '.join(dict.fromkeys(str(c.get('cell_id', 'unspecified'))
                                          for c in detail.get('contexts', []))) or 'unspecified'
    view['concentrations'] = ', '.join(f'{v} µM' for v in gaps.get('doses_um', [])) or 'unspecified'
    view['times'] = ', '.join(f'{v} h' for v in gaps.get('times_h', [])) or 'unspecified'
    labels = []
    if not gaps.get('brain_cells'):
        labels.append('No brain-cell data')
    if gaps.get('cancer_lines_only'):
        labels.append('Cancer lines only')
    if len(gaps.get('doses_um', [])) == 1:
        labels.append(f'{view["concentrations"]} only')
    exposure = gaps.get('exposure', {})
    level = exposure.get('level')
    label = exposure.get('label', 'unspecified')
    labels.append(f'Brain exposure: {level} {label}' if level in {'measured', 'curated', 'predicted'}
                  and not label.startswith(level) else f'Brain exposure: {label}')
    view['gaps'] = labels
    view['targets'] = [{k: target.get(k, 'unspecified') for k in
                        ('symbol', 'uniprot', 'action_type', 'ad_association_score')}
                       for target in detail.get('targets', [])]
    view['next'] = next_experiment(gaps)
    datasets = provenance.get('dataset_accession', 'unspecified')
    view['datasets'] = ', '.join(datasets) if isinstance(datasets, list) else datasets
    view['commit'] = provenance.get('git_commit', 'unspecified')
    view['processing'] = provenance.get('processing_version', 'unspecified')
    view['timestamp'] = provenance.get('timestamp', 'unspecified')
    view['mock'] = str(view['processing']).startswith('mock') or view['commit'] == 'mock'
    # Drug detail always comes from the frozen GSE132903 ranking, whatever project is open.
    view['signature'] = 'GSE132903'
    approval = detail.get('approval_status')
    if isinstance(approval, dict):
        phase = approval.get('max_phase')
        view['approval_status'] = ' · '.join(str(v) for v in (
            approval.get('status'), f'phase {phase:g}' if isinstance(phase, (int, float)) else None,
            withdrawn_label(approval)) if v)
    view['project'] = project_id
    view['hash'] = sha256((ROOT / 'data/manifests/preregistration.yaml').read_bytes()).hexdigest()[:8]
    env = Environment(loader=FileSystemLoader(APP / 'templates'), autoescape=select_autoescape(['html']))
    view['title'] = title or f'{view["name"]} | Tauchstone evidence report'
    return env.get_template('report.html').render(report=view, boundary=BOUNDARY, fallback=fallback, fonts=font_faces_css(),
                                                  session=session)


FONTS = APP / 'static' / 'fonts'
_FACES = (
    ('Instrument Sans', 400, 'instrument-sans-latin-400-normal'),
    ('Instrument Sans', 500, 'instrument-sans-latin-500-normal'),
    ('Instrument Sans', 600, 'instrument-sans-latin-600-normal'),
    ('Geist Mono', 400, 'geist-mono-latin-400-normal'),
    ('Geist Mono', 500, 'geist-mono-latin-500-normal'),
)


@lru_cache(maxsize=1)
def font_faces_css() -> str:
    """@font-face rules with the fonts embedded as data URLs, so reports render offline
    (browser and PDF) without any font request. Fonts: SIL OFL 1.1 (static/fonts/LICENSE-*)."""
    rules = []
    for family, weight, stem in _FACES:
        path = FONTS / f'{stem}.woff2'
        if not path.exists():
            continue
        data = base64.b64encode(path.read_bytes()).decode()
        rules.append(f"@font-face{{font-family:'{family}';font-style:normal;font-weight:{weight};"
                     f"src:url(data:font/woff2;base64,{data}) format('woff2')}}")
    return '\n'.join(rules)


def render_pdf(html: str) -> bytes:
    from weasyprint import HTML
    from weasyprint.urls import URLFetcher

    # Offline by construction: only data: URLs (the embedded fonts) may load; http(s), file
    # and everything else are refused.
    fetcher = URLFetcher(allowed_protocols={'data'})
    return HTML(string=html, url_fetcher=fetcher).write_pdf()
