import pandas as pd
from pipelines.evidence.lookup import load_ot_molecule, normalize
ot = load_ot_molecule()
print(ot.shape, ot.dtypes)
for name in ['DONEPEZIL','RIVASTIGMINE','GALANTAMINE','MEMANTINE','DONEPEZIL HYDROCHLORIDE','RIVASTIGMINE TARTRATE','GALANTAMINE HYDROBROMIDE','MEMANTINE HYDROCHLORIDE']:
    r = ot[ot['name']==name]
    for rec in r.itertuples():
        print(name, rec.id, rec.parentId)
        print('  syn', list(rec.synonyms)[:40] if rec.synonyms is not None else None)
        print('  trade', list(rec.tradeNames)[:40] if rec.tradeNames is not None else None)
