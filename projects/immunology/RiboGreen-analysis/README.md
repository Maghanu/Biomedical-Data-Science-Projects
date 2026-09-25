# RiboGreen Assay Plate Configurator

An interactive React component for assigning an 8 x 12 fluorescence plate and
generating an R script for RiboGreen RNA quantification and encapsulation
efficiency analysis.

The component is implemented in
[RiboGreen-assay-script.jsx](RiboGreen-assay-script.jsx).

## What it does

- assigns PBS and Triton calibration standards;
- assigns up to three sample groups with separate PBS and Triton curves;
- assigns control wells for empty-liposome plus mRNA spike-in samples;
- configures loaded mRNA maxima and control concentrations;
- lets you paint, drag across, and erase wells on a 96-well plate;
- generates an R script with calibration models and back-calculation;
- calculates free, total, and encapsulated mRNA;
- calculates encapsulation efficiency and recovery;
- exports calibration statistics, sample replicates, EE results, recovery, and
  concentration summaries to Excel.

## Biological relevance

RiboGreen assays provide a fluorescence-based way to quantify RNA in samples
such as liposomes or lipid nanoparticles. Comparing a non-disrupted condition
with a Triton-disrupted condition helps distinguish RNA that is accessible
outside the formulation from the total RNA measured after disruption.

This distinction is biologically relevant when evaluating RNA delivery
systems: total RNA describes the amount present, while the difference between
total and free RNA is used as an estimate of encapsulated RNA. Encapsulation
efficiency and recovery can therefore help assess formulation quality and
whether an experimental delivery system is suitable for downstream cell or
immune-response studies. The assay is a quantification and quality-control
readout; it does not by itself demonstrate cellular uptake or biological
activity.

## Run in CodeSandbox

1. Create a new **React** sandbox.
2. Copy `RiboGreen-assay-script.jsx` into `src/RiboGreenConfigurator.jsx`.
3. Replace `src/App.jsx` with:

```jsx
import RiboGreenConfigurator from "./RiboGreenConfigurator";

export default function App() {
  return <RiboGreenConfigurator />;
}
```

4. Start the preview. The component only requires React and has no additional
   npm dependency.

## Configure an assay

1. Set the plate CSV filename and Excel output filename.
2. Paint the PBS and Triton calibration-standard wells.
3. Enter the standard concentrations. The defaults are `1000`, `500`, `100`,
   `20`, and `0` ng/mL.
4. Paint PBS and Triton wells for each sample and set the sample labels.
5. Enter the loaded mRNA maxima for each sample.
6. Optionally assign control PBS/Triton wells and their spike-in concentrations.
7. Click **Generate R Config**.
8. Copy the generated R code into a file such as `ribogreen_analysis.R`.

## Expected CSV format

The generated R script expects a semicolon-delimited CSV containing an 8 x 12
plate:

- first column: row labels `A` through `H`;
- next twelve columns: wells `1` through `12`;
- numeric values: fluorescence measurements;
- decimal mark: comma by default.

The default input filename is `your_plate_data.csv` and the default output is
`ribogreen_results.xlsx`; both can be changed in the interface.

## Run the generated R script

The generated script installs or loads:

`tidyverse`, `readr`, `ggplot2`, `writexl`, and `broom`.

Run it with:

```bash
Rscript ribogreen_analysis.R
```

The analysis creates PBS and Triton calibration curves, an encapsulation
efficiency plot, recovery plots, a concentration plot, and an Excel workbook
with calibration, replicate, EE, recovery, and control-recovery sheets.

## Interpretation notes

PBS is used to estimate free RNA, while Triton is used to estimate total RNA
after disruption of the formulation. Encapsulated RNA is calculated as total
RNA minus free RNA, and encapsulation efficiency is calculated as:

```text
EE (%) = encapsulated RNA / total RNA * 100
```

Calibration quality, replicate variability, and the number of assigned wells
should be checked before interpreting the generated results.

## Data protection

Do not commit raw fluorescence data, donor or patient identifiers, or generated
Excel and image outputs. Use anonymised or synthetic data in a public demo.