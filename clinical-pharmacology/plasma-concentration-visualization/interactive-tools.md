# JSX and CodeSandbox Projects

This section contains interactive projects built with JSX in CodeSandbox.
Projects may include biomedical dashboards, data visualisations, educational
tools, and frontend prototypes.

## Project map

| Project | Purpose | Main technologies | Status |
| --- | --- | --- | --- |
| [Plasma concentration visualization by dose timing](plasma-concentration-visualization/README.md) | Explore repeated-dose plasma concentration profiles | JSX, React, Recharts | Runnable Vite app |

## Recommended project structure

For each CodeSandbox project, add a short entry here and document the public
CodeSandbox link.

## Plasma concentration visualization by dose timing

This interactive component models plasma concentration using a one-compartment
model with first-order absorption and elimination. It supports repeated doses,
two-drug comparison, adjustable pharmacokinetic parameters, missed doses, and
double doses. The chart is rendered with Recharts.

- [Open the project README](plasma-concentration-visualization/README.md)
- [Open the JSX component](plasma-concentration-visualization/src/PlasmaConcentrationChart.jsx)

```text
project-name/
├── README.md
├── src/
├── public/
├── package.json
└── sandbox.config.json
```

Each project README should include:

- the purpose of the application;
- a live CodeSandbox link;
- the main user interaction or workflow;
- the data source and whether it is synthetic or public;
- setup and run instructions;
- screenshots or other visual outputs where useful.

Do not include private CodeSandbox data, API keys, patient information, or
identifiable clinical data in a public project.