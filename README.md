# Clinical Pharmacology

This repository contains clinical pharmacology analyses and tools focused on
pharmacokinetics, pharmacodynamics, ECG measurements, and exposure-response
relationships.

## Biological overview

Metoprolol is a beta-1 adrenergic receptor blocker. By reducing the effects of
sympathetic stimulation on the heart, it can lower heart rate and blood
pressure. The amount of metoprolol in the body depends partly on metabolism
by the CYP2D6 enzyme, so differences in CYP2D6 activity can contribute to
variation in drug exposure and response.

These analyses connect that pathway to clinical measurements: they examine
metoprolol exposure, blood-pressure response, and QT intervals on the ECG.
Because the QT interval varies with heart rate, the primary analysis uses
QTcF, a heart-rate-corrected measure, when comparing metoprolol with placebo.
The concentration visualization provides a separate, interactive illustration
of how repeated dosing and altered doses can affect modeled plasma levels.

## Projects

| Project | Focus | Technology |
| --- | --- | --- |
| [Metoprolol analysis](clinical-pharmacology/metoprolol-analysis/README.md) | QTcF, CYP2D6-stratified PK/PD, and blood-pressure analyses | R |
| [Plasma concentration visualization](clinical-pharmacology/plasma-concentration-visualization/README.md) | Interactive repeated-dose profiles, including missed and doubled doses | React, Recharts, Vite |

See the [clinical pharmacology overview](clinical-pharmacology/README.md) for
project details and analysis notes.

## Repository structure

```text
clinical-pharmacology/
├── README.md
├── metoprolol-analysis/
│   ├── README.md
│   ├── metoprolol.r
│   ├── qt-correction/
│   ├── cyp2d6-pkpd/
│   └── systolic-bp-concentration/
└── plasma-concentration-visualization/
    ├── README.md
    ├── package.json
    └── src/
```

## Data requirements

The R analyses require `AnalysisSet.Rdata` in the working directory. This
dataset and generated output are intentionally excluded because the data may
contain personal information.
