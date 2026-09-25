# B3Z T-cell Activation Plate Configurator

An interactive React component for configuring an 8 x 12 assay plate and
generating a reproducible R analysis script for B3Z T-cell activation data.

## What it does

- displays a 96-well plate layout;
- supports medium, positive, and negative controls;
- creates sample groups with custom concentrations;
- creates pasted or serial-dilution concentration series;
- lets you paint, drag across, or erase well assignments;
- generates an R script for ANOVA/Tukey or pairwise t-tests with BH correction;
- creates bar charts, dose-response plots, and an Excel output workbook.

The component is implemented in [T-cell-activation.jsx](T-cell-activation.jsx).

## Biological relevance

B3Z is a reporter T-cell assay used to study antigen-dependent T-cell
activation. In an experimental plate, differences in reporter signal can
reflect differences in antigen presentation and downstream T-cell receptor
signalling under the tested conditions.

The plate configurator supports concentration series, controls, and replicate
wells so that activation can be compared across formulations or treatment
conditions. The generated background-corrected summaries and dose-response
plots can help identify concentration-dependent activity and distinguish a
biological signal from plate background or control behaviour. Interpretation
still depends on the assay design, controls, replicates, and the specific B3Z
readout used in the experiment; the configurator does not establish mechanism
by itself.

## Run in CodeSandbox

1. Create a new **React** sandbox.
2. Copy `T-cell-activation.jsx` into `src/B3ZConfigurator.jsx`.
3. Replace `src/App.jsx` with:

```jsx
import B3ZConfigurator from "./B3ZConfigurator";

export default function App() {
  return <B3ZConfigurator />;
}
```

4. Start the preview. The component only requires React; it has no additional
   npm dependency.

## Use the configurator

1. Set the CSV input filename and Excel output filename.
2. Choose `ANOVA + Tukey` or `Pairwise t-tests`.
3. Add or edit control conditions.
4. Add each experimental group and enter concentrations, or use the dilution
   series controls.
5. Select a condition and click or drag across the appropriate wells.
6. Verify the coloured well counts and click **Generate R Script**.
7. Copy the generated script into a file such as `b3z_analysis.R` and run it
   with R.

## Expected CSV format

The generated R script expects a semicolon-delimited CSV with a plate layout:

- first column: row labels `A` through `H`;
- next twelve columns: wells `1` through `12`;
- numeric values: OD596 measurements;
- decimal mark: comma by default.

The input file and the generated Excel/PNG outputs can be changed in the
configurator before the script is generated.

## Run the generated R script

The generated script installs or loads these packages:

`tidyverse`, `readr`, `ggplot2`, `writexl`, `rstatix`, and `ggpubr`.

Then run:

```bash
Rscript b3z_analysis.R
```

It performs medium-background subtraction, condition summaries, statistical
testing, and exports `b3z_results.xlsx`, `b3z_all_conditions.png`, and
`b3z_dose_response.png`.

## Data protection

Do not commit raw assay data, patient or donor identifiers, API keys, or
generated result files. Use anonymised or synthetic data in a public demo.