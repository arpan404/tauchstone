"""Offline report presentation. Only public DrugDetail fields enter the template."""
from __future__ import annotations

import importlib
import json
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
        try:
            module = importlib.import_module('app.services.drug_detail')
        except ModuleNotFoundError as exc:
            if exc.name != 'app.services.drug_detail':
                raise
        else:
            return module.get_drug_detail(drug_id, project_id)
        if not settings.mock:
            raise DetailUnavailableError('Drug detail service unavailable; mock fallback disabled')
        # Explicit allowlist also prevents path traversal. Projects cannot silently reuse fixtures.
        if project_id not in (None, 'builtin-gse132903'):
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


def render_html(detail: dict, project_id: str | None = None, *, fallback: bool = False) -> str:
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
    view['signature'] = project_id or 'GSE132903'
    view['hash'] = sha256((ROOT / 'data/manifests/preregistration.yaml').read_bytes()).hexdigest()[:8]
    env = Environment(loader=FileSystemLoader(APP / 'templates'), autoescape=select_autoescape(['html']))
    return env.get_template('report.html').render(report=view, boundary=BOUNDARY, fallback=fallback)


def render_pdf(html: str) -> bytes:
    from weasyprint import HTML

    def deny_network(url: str, **kwargs):
        raise ValueError('External resources are disabled in offline reports')

    return HTML(string=html, url_fetcher=deny_network).write_pdf()
