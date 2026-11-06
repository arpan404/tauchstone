"""Validate raw metadata before analysis; fail closed on missing donor identity."""
import json

from pipelines.common.paths import RAW
from pipelines.singlecell.prepare import series_samples


def main():
    samples = []
    for cohort in ('GSE272082', 'GSE175814'):
        for path in sorted((RAW / 'geo' / cohort).glob('*series_matrix*')):
            for sample in series_samples(path):
                if cohort == 'GSE272082' and 'GEX' not in sample['title']:
                    continue
                samples.append({'cohort': cohort, **sample})
    if not samples:
        raise SystemExit('No raw series matrices found')
    print(json.dumps(samples, indent=2))
    raise SystemExit('Analysis blocked: verified donor mapping required; no processed output written')


if __name__ == '__main__':
    main()
