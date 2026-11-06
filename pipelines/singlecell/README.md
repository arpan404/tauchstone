# Exploratory single-cell pipeline

This module never feeds the preregistered benchmark. Raw files are read-only.
The API reads only `processed/singlecell/panel.json`; mock mode reads the synthetic
contract fixture. Missing real output returns 404.

Preparation uses raw counts, at least 200 detected genes and at most 5% mitochondrial
UMIs per nucleus. Each nucleus receives the type with the largest mean count over
that type's canonical marker genes, provided the mean is at least 1 UMI and at least
1.5 times the runner-up; other nuclei are excluded. This simple annotation needs human
review. No random operation is used; the planned seed is 20261105.
Pseudobulks with fewer than 20 retained nuclei are excluded.

## Current scientific blocker

GSE272082 series matrices identify region samples, not donors. Matching age, sex and
PMI suggest NIH01–03, NIH04–06, NIH10–12, NIH13–15, NIH16–18 and NIH28–30 are
repeated region samples from six donors, but this is not verified donor metadata.
Do not treat the 21 RNA samples as 21 independent donors. A verified donor mapping
is required before donor aggregation or fitting. GSE175814 has only two AD and two
control samples, so no signature may be fitted or scored there.

No real panel has been generated. The limma-voom, gene mapping, LINCS scoring and
provenance output stages remain pending. Do not substitute the synthetic fixture
for real data. No frozen outputs or contracts have been changed.
