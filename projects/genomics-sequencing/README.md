# Genomics and Sequencing Projects

This section contains genomics and sequencing projects involving quality
control, differential expression, pathway analysis, and reproducible reports.

## Suggested project map

| Project | Data type | Main methods | Status |
| --- | --- | --- | --- |
| Add project name | RNA-seq / single-cell / other | QC, differential expression, enrichment | Planned |

## Recommended project structure

```text
project-name/
├── README.md
├── data/          # Keep raw and sensitive data out of Git
├── scripts/
├── results/
├── reports/
└── renv.lock      # Optional: reproducible R environment
```

For each project, document the data source, preprocessing, quality control,
statistical model, visualisations, and the main biological conclusion.