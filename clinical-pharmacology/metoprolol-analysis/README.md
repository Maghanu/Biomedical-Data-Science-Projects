# Metoprolol Analysis

This level-1 project contains the primary metoprolol QTcF analysis and related
clinical pharmacology subanalyses.

## Primary analysis

- [Metoprolol QTcF script](metoprolol.r)

## Subanalyses

| Subanalysis | Question | Entry point |
| --- | --- | --- |
| QT correction | How do QTcF and derived QTcB differ when heart rate changes? | [QT correction README](qt-correction/README.md) |
| CYP2D6-stratified PK/PD | Do exposure and treatment responses differ by metaboliser phenotype? | [CYP2D6 README](cyp2d6-pkpd/README.md) |
| Systolic BP versus concentration | How does plasma concentration relate to supine systolic BP? | [Blood-pressure README](systolic-bp-concentration/README.md) |

All analyses expect `AnalysisSet.Rdata`, which is not included because it
contains personal data.# Metoprolol QTcF Analysis

This analysis tests whether metoprolol changes QTcF compared with placebo in a
crossover study. It summarises repeated QTcF measurements to one
change-from-baseline value per subject and compares treatments with a paired
t-test.

## Run

The script expects `AnalysisSet.Rdata` in the working directory.

```bash
Rscript metoprolol.r
```

The script also creates a time-course visualisation of individual subjects and
treatment-arm means.