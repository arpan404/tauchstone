# Real exploratory run report

The run took 65.96 seconds and produced 13 fitted signatures and 11 insufficient-donor signatures. GSE272082 starts with 3 control and 3 sEOAD donors per region. The README documents the inferred donor IDs and platform exclusions. GSE175814 starts with 2 per group. The counts below are after QC and the 20-nucleus pseudobulk gate.

| Signature | Control / AD donors | Nuclei | FDR < 0.05 genes |
| --- | --- | --- | --- |
| GSE272082|PFC|excitatory_neurons | 3 / 3 | 2708 | 8 |
| GSE272082|PFC|inhibitory_neurons | 3 / 3 | 1535 | 1238 |
| GSE272082|PFC|astrocytes | 3 / 3 | 1635 | 0 |
| GSE272082|PFC|microglia | 2 / 3 | 781 | not fitted |
| GSE272082|PFC|oligodendrocytes | 3 / 3 | 6117 | 0 |
| GSE272082|PFC|opc | 3 / 3 | 1119 | 2 |
| GSE272082|EC|excitatory_neurons | 3 / 2 | 1687 | not fitted |
| GSE272082|EC|inhibitory_neurons | 3 / 3 | 1118 | 9 |
| GSE272082|EC|astrocytes | 3 / 3 | 2416 | 0 |
| GSE272082|EC|microglia | 3 / 3 | 893 | 4 |
| GSE272082|EC|oligodendrocytes | 3 / 3 | 11208 | 1 |
| GSE272082|EC|opc | 3 / 3 | 1753 | 62 |
| GSE272082|HIP|excitatory_neurons | 0 / 2 | 276 | not fitted |
| GSE272082|HIP|inhibitory_neurons | 2 / 2 | 554 | not fitted |
| GSE272082|HIP|astrocytes | 3 / 3 | 3417 | 0 |
| GSE272082|HIP|microglia | 2 / 3 | 548 | not fitted |
| GSE272082|HIP|oligodendrocytes | 3 / 3 | 15666 | 0 |
| GSE272082|HIP|opc | 3 / 3 | 1748 | 0 |
| GSE175814|excitatory_neurons | 2 / 2 | 4123 | not fitted |
| GSE175814|inhibitory_neurons | 2 / 2 | 1818 | not fitted |
| GSE175814|astrocytes | 2 / 2 | 4390 | not fitted |
| GSE175814|microglia | 1 / 2 | 1591 | not fitted |
| GSE175814|oligodendrocytes | 2 / 2 | 5832 | not fitted |
| GSE175814|opc | 2 / 2 | 1395 | not fitted |

Astrocyte GFAP is positive in PFC, EC and HIP, with t=4.82/3.42/0.26 and FDR=0.213/0.216/0.963. PFC inhibitory SST and VGF are negative, with FDR=0.021/0.015. These descriptive sign checks agree with the contrast direction. They do not validate the annotation or show a general disease pattern. Twelve queries use the FDR fallback.

The 20 drugs have mixed directions across fitted signatures. A negative consensus indicates expression reversal only. No candidate selection or benchmark conclusion follows from it.

| Pool rank | Compound | Negative consensus / 13 |
| --- | --- | --- |
| 1 | tienilic-acid | 6 |
| 2 | nepafenac | 11 |
| 3 | cholic-acid | 8 |
| 4 | bavisant | 10 |
| 5 | piperacillin | 8 |
| 6 | busulfan | 9 |
| 7 | LY-2886721 | 8 |
| 8 | cefotetan | 5 |
| 9 | ostarine | 7 |
| 10 | CPI-1189 | 7 |
| 11 | granisetron | 8 |
| 12 | brinzolamide | 5 |
| 13 | cromoglicic-acid | 7 |
| 14 | ioxaglic-acid | 7 |
| 15 | fludarabine-phosphate | 9 |
| 16 | tramiprosate | 7 |
| 17 | levamisole | 5 |
| 18 | methyldopa | 6 |
| 19 | oxprenolol | 11 |
| 20 | acetazolamide | 12 |

## Verification

- Final make test: 172 passed, 5 skipped; web typecheck passed.
- Singlecell real-output tests: 6 passed. Data-marked suite: 32 passed and 1 skipped before panel generation. The panel test passed after that.
- make test-r: 37 passed, with the existing SummarizedExperiment import replacement warning.
- Web install, build, typecheck, lint, test and check:api passed, with 48 tests. Existing lint and Vite warnings remain.
- Real API on port 8200: HTTP 200, 24 signatures and 20 drugs. The server was stopped after the check.
- No frozen files or contracts changed. No data committed.

Inferred donor IDs, marker annotation, thresholds and claim wording still need human scientific sign-off. Small sample sizes, crude marker typing and unmodelled covariates limit interpretation. These results are exploratory and not part of the preregistered benchmark.
