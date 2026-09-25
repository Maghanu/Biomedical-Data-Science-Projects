import { useState, useCallback } from "react";

const ROWS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const COLS = Array.from({ length: 12 }, (_, i) => i + 1);

const ASSIGN_TYPES = [
  {
    id: "empty",
    label: "Empty",
    color: "#1e2535",
    border: "#2e3a52",
    text: "#4a5568",
  },
  {
    id: "std_pbs",
    label: "STD PBS",
    color: "#0d3b6e",
    border: "#1a6bbf",
    text: "#90caf9",
  },
  {
    id: "std_tri",
    label: "STD Triton",
    color: "#6e0d0d",
    border: "#bf1a1a",
    text: "#f9a0a0",
  },
  {
    id: "s1_pbs",
    label: "S1 PBS",
    color: "#0d5c3a",
    border: "#1abf7a",
    text: "#86efca",
  },
  {
    id: "s1_tri",
    label: "S1 Triton",
    color: "#5c3a0d",
    border: "#bf7a1a",
    text: "#fcd19a",
  },
  {
    id: "s2_pbs",
    label: "S2 PBS",
    color: "#3a0d5c",
    border: "#7a1abf",
    text: "#d4a0f9",
  },
  {
    id: "s2_tri",
    label: "S2 Triton",
    color: "#0d4a5c",
    border: "#1aa8bf",
    text: "#a0e8f9",
  },
  {
    id: "s3_pbs",
    label: "S3 PBS",
    color: "#5c0d3a",
    border: "#bf1a7a",
    text: "#f9a0d4",
  },
  {
    id: "s3_tri",
    label: "S3 Triton",
    color: "#3a5c0d",
    border: "#7abf1a",
    text: "#d4f9a0",
  },
  {
    id: "ctrl_pbs",
    label: "CTRL PBS",
    color: "#3d3000",
    border: "#c8a000",
    text: "#ffe066",
  },
  {
    id: "ctrl_tri",
    label: "CTRL Triton",
    color: "#2a1a00",
    border: "#e07000",
    text: "#ffb347",
  },
];

const TYPE_MAP = Object.fromEntries(ASSIGN_TYPES.map((t) => [t.id, t]));

const DEFAULT_LAYOUT = () => {
  const grid = {};
  ROWS.forEach((r) => {
    COLS.forEach((c) => {
      grid[`${r}${c}`] = "empty";
    });
  });
  return grid;
};

const STD_CONC_DEFAULT = [1000, 500, 100, 20, 0];

function generateRConfig(
  layout,
  samples,
  stdConcs,
  loadedConcs,
  ctrlConcs,
  csvFile,
  outputFile
) {
  const byType = {};
  ASSIGN_TYPES.forEach((t) => {
    byType[t.id] = [];
  });
  Object.entries(layout).forEach(([well, type]) => {
    const row = well[0];
    const col = parseInt(well.slice(1));
    byType[type].push({ row, col, well });
  });

  const rowsFor = (typeId) =>
    [...new Set(byType[typeId].map((w) => w.row))].sort();
  const colsFor = (typeId) =>
    [...new Set(byType[typeId].map((w) => w.col))].sort((a, b) => a - b);
  const fmtRows = (rows) =>
    rows.length ? `c("${rows.join('", "')}")` : "character(0)";
  const fmtCols = (cols) =>
    cols.length ? `c(${cols.join(", ")})` : "integer(0)";

  const stdColsPBS = colsFor("std_pbs");
  const stdConcAssign = stdColsPBS
    .map((col, i) => `${stdConcs[i] ?? "NA"}`)
    .join(", ");

  const sampleBlocks = [1, 2, 3]
    .map((n) => {
      const pbsRows = rowsFor(`s${n}_pbs`);
      const pbsCols = colsFor(`s${n}_pbs`);
      const triRows = rowsFor(`s${n}_tri`);
      const triCols = colsFor(`s${n}_tri`);
      const label = samples[n - 1]?.label || `Sample_${n}`;
      if (!pbsCols.length && !triCols.length) return null;
      return `
  # --- ${label} ---
  plate_long %>%
    filter(Row %in% ${fmtRows(pbsRows)}, Col %in% ${fmtCols(pbsCols)}) %>%
    mutate(Sample = sample_labels[${n}], Curve = "PBS",
           Conc_ngml = back_calculate(Fluorescence, pbs_model)),
  plate_long %>%
    filter(Row %in% ${fmtRows(triRows)}, Col %in% ${fmtCols(triCols)}) %>%
    mutate(Sample = sample_labels[${n}], Curve = "Triton",
           Conc_ngml = back_calculate(Fluorescence, triton_model))`;
    })
    .filter(Boolean);

  const ctrlPbsCols = colsFor("ctrl_pbs");
  const ctrlTriCols = colsFor("ctrl_tri");
  const hasCtrl = ctrlPbsCols.length > 0 || ctrlTriCols.length > 0;

  const ctrlBlock = hasCtrl
    ? `

# --- Control sample extraction (empty liposome + mRNA) ---
# Known concentrations: ${ctrlConcs.map((c) => c + " ng/mL").join(", ")}
# Each control column corresponds to a known spike-in concentration
ctrl_conc_lookup <- tibble(
  Col = ${fmtCols(ctrlPbsCols.length ? ctrlPbsCols : ctrlTriCols)},
  Known_Conc_ngml = c(${ctrlConcs
    .slice(0, Math.max(ctrlPbsCols.length, ctrlTriCols.length))
    .join(", ")})
)

ctrl_raw <- bind_rows(
  plate_long %>%
    filter(Row %in% ${fmtRows(rowsFor("ctrl_pbs"))}, Col %in% ${fmtCols(
        ctrlPbsCols
      )}) %>%
    left_join(ctrl_conc_lookup, by = "Col") %>%
    mutate(Sample = "Control", Curve = "PBS",
           Conc_ngml = back_calculate(Fluorescence, pbs_model)),
  plate_long %>%
    filter(Row %in% ${fmtRows(rowsFor("ctrl_tri"))}, Col %in% ${fmtCols(
        ctrlTriCols
      )}) %>%
    left_join(ctrl_conc_lookup, by = "Col") %>%
    mutate(Sample = "Control", Curve = "Triton",
           Conc_ngml = back_calculate(Fluorescence, triton_model))
)

# Control recovery: measured / known * 100
ctrl_summary <- ctrl_raw %>%
  group_by(Curve, Known_Conc_ngml) %>%
  summarise(
    Mean_Conc_ngml = mean(Conc_ngml),
    SD_Conc_ngml   = sd(Conc_ngml),
    .groups = "drop"
  ) %>%
  mutate(Recovery_pct = Mean_Conc_ngml / Known_Conc_ngml * 100)

cat("\\n===== Control Sample Recovery =====\\n")
print(ctrl_summary)`
    : "";

  const sampleColoursR = `sample_colours <- c(
${samples
  .map((s, i) => {
    const cols = ["#4dac26", "#b8e186", "#d01c8b"];
    return `  "${s.label || `Sample_${i + 1}`}" = "${cols[i] || "#999999"}"`;
  })
  .join(",\n")}
)`;

  const sampleXLabels = samples
    .map(
      (s, i) =>
        `  "${s.label || `Sample_${i + 1}`}" = "${(
          s.label || `Sample_${i + 1}`
        ).replace(/_/g, "\\n")}"`
    )
    .join(",\n");

  const loadedLabels = loadedConcs.map((c) => `${c} ng/mL max`);
  const loadedColoursR = `c(${loadedLabels
    .map(
      (l, i) =>
        `"${l}" = "${["#f1a340", "#998ec3", "#66c2a5"][i] || "#aaaaaa"}"`
    )
    .join(", ")})`;

  return `# ============================================================
# AUTO-GENERATED RIBOGREEN ANALYSIS SCRIPT
# Generated by RiboGreen Plate Configurator
# ============================================================

# --- 1. Packages -------------------------------------------------------------
required_packages <- c("tidyverse", "readr", "ggplot2", "writexl", "broom")
new_packages <- required_packages[!(required_packages %in% installed.packages()[,"Package"])]
if (length(new_packages)) install.packages(new_packages)
library(tidyverse); library(readr); library(ggplot2); library(writexl); library(broom)

# --- 2. File paths -----------------------------------------------------------
csv_file    <- "${csvFile || "your_plate_data.csv"}"
output_file <- "${outputFile || "ribogreen_results.xlsx"}"

# --- 3. Read & parse CSV -----------------------------------------------------
raw_all <- read_delim(csv_file, delim = ";", col_names = FALSE,
                      show_col_types = FALSE,
                      locale = locale(decimal_mark = ","))

data_rows <- raw_all %>%
  filter(X1 %in% c("A","B","C","D","E","F","G","H"))

raw <- data_rows %>%
  select(1:13) %>%
  select(where(~ !all(is.na(.))))

colnames(raw) <- c("Row", as.character(1:12))

raw <- raw %>%
  mutate(across(-Row, ~ suppressWarnings(as.numeric(.))))

plate_long <- raw %>%
  pivot_longer(cols = -Row, names_to = "Col", values_to = "Fluorescence") %>%
  mutate(Col = as.integer(Col), Well = paste0(Row, Col)) %>%
  filter(!is.na(Fluorescence))

# --- 4. Calibration standards ------------------------------------------------
std_concentrations <- c(${stdConcAssign})
std_cols           <- ${fmtCols(stdColsPBS)}
std_lookup         <- tibble(Col = std_cols, Concentration_ngml = std_concentrations)

pbs_std <- plate_long %>%
  filter(Row %in% ${fmtRows(rowsFor("std_pbs"))}, Col %in% std_cols) %>%
  left_join(std_lookup, by = "Col") %>%
  mutate(Curve = "PBS")

triton_std <- plate_long %>%
  filter(Row %in% ${fmtRows(rowsFor("std_tri"))}, Col %in% std_cols) %>%
  left_join(std_lookup, by = "Col") %>%
  mutate(Curve = "Triton")

standards    <- bind_rows(pbs_std, triton_std)
pbs_model    <- lm(Fluorescence ~ Concentration_ngml, data = pbs_std)
triton_model <- lm(Fluorescence ~ Concentration_ngml, data = triton_std)
pbs_r2       <- summary(pbs_model)$r.squared
triton_r2    <- summary(triton_model)$r.squared

cat("\\nPBS R² =",    round(pbs_r2,    4), "\\n")
cat("Triton R² =", round(triton_r2, 4), "\\n")

back_calculate <- function(fluorescence, model) {
  (fluorescence - coef(model)[1]) / coef(model)[2]
}

# --- 5. Calibration curve plots ----------------------------------------------
plot_curve <- function(std_df, model, curve_name, r2) {
  pred_range <- data.frame(Concentration_ngml = seq(0, max(std_df$Concentration_ngml), length.out = 200))
  pred_range$Fluorescence <- predict(model, newdata = pred_range)
  colour <- ifelse(curve_name == "PBS", "#2166ac", "#d6604d")
  ggplot(std_df, aes(x = Concentration_ngml, y = Fluorescence)) +
    geom_point(size = 3, colour = colour) +
    geom_line(data = pred_range, aes(x = Concentration_ngml, y = Fluorescence),
              colour = colour, linewidth = 1) +
    annotate("text", x = max(std_df$Concentration_ngml) * 0.6,
             y = min(std_df$Fluorescence),
             label = sprintf("R\\u00b2 = %.4f", r2), size = 4.5, hjust = 0) +
    labs(title = ifelse(curve_name == "PBS", "Free mRNA Calibration Curve", "Total mRNA Calibration Curve"),
         x = "RNA Concentration (ng/mL)", y = "Fluorescence (RFU)") +
    theme_bw(base_size = 16) +
    theme(plot.title = element_text(face = "bold"))
}

p_pbs    <- plot_curve(pbs_std,    pbs_model,    "PBS",    pbs_r2)
p_triton <- plot_curve(triton_std, triton_model, "Triton", triton_r2)
print(p_pbs);    ggsave("calibration_curve_PBS.png",    plot = p_pbs,    width = 7, height = 5, dpi = 300)
print(p_triton); ggsave("calibration_curve_Triton.png", plot = p_triton, width = 7, height = 5, dpi = 300)

# --- 6. Sample config --------------------------------------------------------
sample_labels         <- c(
  "${samples[0]?.label || "Sample_1"}",
  "${samples[1]?.label || "Sample_2"}",
  "${samples[2]?.label || "Sample_3"}"
)
loaded_concentrations <- c(${loadedConcs.join(", ")})
ctrl_concentrations   <- c(${ctrlConcs.join(", ")})

# --- 7. Sample extraction ----------------------------------------------------
samples_raw <- bind_rows(${sampleBlocks.join(",\n")}
)${ctrlBlock}

# --- 8. Summarise per sample -------------------------------------------------
summary_samples <- samples_raw %>%
  group_by(Sample, Curve) %>%
  summarise(
    Mean_Fluorescence = mean(Fluorescence),
    SD_Fluorescence   = sd(Fluorescence),
    Mean_Conc_ngml    = mean(Conc_ngml),
    SD_Conc_ngml      = sd(Conc_ngml),
    N                 = n(),
    .groups = "drop"
  )

# --- 9. Encapsulation efficiency ---------------------------------------------
ee_results <- summary_samples %>%
  select(Sample, Curve, Mean_Conc_ngml, SD_Conc_ngml) %>%
  pivot_wider(names_from = Curve, values_from = c(Mean_Conc_ngml, SD_Conc_ngml)) %>%
  rename(
    PBS_mean_ngml    = Mean_Conc_ngml_PBS,
    Triton_mean_ngml = Mean_Conc_ngml_Triton,
    PBS_sd_ngml      = SD_Conc_ngml_PBS,
    Triton_sd_ngml   = SD_Conc_ngml_Triton
  ) %>%
  mutate(
    Free_mRNA_ngml         = PBS_mean_ngml,
    Total_mRNA_ngml        = Triton_mean_ngml,
    Encapsulated_mRNA_ngml = Triton_mean_ngml - PBS_mean_ngml,
    EE_percent             = (Encapsulated_mRNA_ngml / Triton_mean_ngml) * 100,
    EE_sd                  = EE_percent * sqrt((PBS_sd_ngml / PBS_mean_ngml)^2 +
                                               (Triton_sd_ngml / Triton_mean_ngml)^2),
    Sample = factor(Sample, levels = sample_labels)
  )

cat("\\n===== Encapsulation Efficiency =====\\n")
print(ee_results %>% select(Sample, Free_mRNA_ngml, Total_mRNA_ngml, Encapsulated_mRNA_ngml, EE_percent, EE_sd))

# --- 10. %EE bar plot --------------------------------------------------------
${sampleColoursR}

ee_plot_data <- ee_results %>%
  mutate(Sample = factor(Sample, levels = sample_labels))

p_ee <- ggplot(ee_plot_data, aes(x = Sample, y = EE_percent, fill = Sample)) +
  geom_col(width = 0.55, colour = "black") +
  geom_errorbar(aes(ymin = pmax(0, EE_percent - EE_sd),
                    ymax = pmin(100, EE_percent + EE_sd)),
                width = 0.2, linewidth = 0.8) +
  scale_fill_manual(values = sample_colours) +
  scale_y_continuous(limits = c(0, 105), expand = c(0, 0)) +
  scale_x_discrete(labels = c(
${sampleXLabels}
  )) +
  labs(title = "Liposome Encapsulation Efficiency",
       x = NULL, y = "Encapsulation Efficiency (%)") +
  theme_bw(base_size = 16) +
  theme(plot.title = element_text(face = "bold"), legend.position = "none")

print(p_ee)
ggsave("encapsulation_efficiency.png", plot = p_ee, width = 7, height = 5, dpi = 300)

# --- 11. mRNA Recovery plots -------------------------------------------------
# FIX: use a function-form labels= so that dynamically-added control sample
# names pass through unchanged instead of being silently dropped.

triton_sd_lookup <- summary_samples %>%
  filter(Curve == "Triton") %>%
  select(Sample, Triton_sd_ngml = SD_Conc_ngml)

pbs_sd_lookup <- summary_samples %>%
  filter(Curve == "PBS") %>%
  select(Sample, PBS_sd_ngml = SD_Conc_ngml)

recovery_base <- ee_results %>%
  select(Sample, Total_mRNA_ngml, Free_mRNA_ngml) %>%
  left_join(triton_sd_lookup, by = "Sample") %>%
  left_join(pbs_sd_lookup,    by = "Sample") %>%
  cross_join(tibble(Loaded_ngml = loaded_concentrations)) %>%
  mutate(
    Loaded_label    = factor(paste0(Loaded_ngml, " ng/mL max")),
    Recovery_Triton = (Total_mRNA_ngml / Loaded_ngml) * 100,
    SD_Triton       = (Triton_sd_ngml  / Loaded_ngml) * 100,
    Recovery_PBS    = (Free_mRNA_ngml  / Loaded_ngml) * 100,
    SD_PBS          = (PBS_sd_ngml     / Loaded_ngml) * 100,
    Sample          = factor(as.character(Sample), levels = sample_labels)
  )

recovery_data <- recovery_base %>%
  select(Sample, Loaded_label, Loaded_ngml,
         Total_mRNA_ngml,
         Recovery_pct = Recovery_Triton, Recovery_sd = SD_Triton)

has_ctrl_rec <- exists("ctrl_summary") && nrow(ctrl_summary) > 0

make_recovery_plot <- function(rec_df, ctrl_df = NULL,
                               curve_name, y_col, sd_col,
                               fill_vals, subtitle_extra = NULL) {
  all_levels <- levels(rec_df$Sample)
  if (!is.null(ctrl_df) && nrow(ctrl_df) > 0) {
    all_levels <- c(all_levels, unique(ctrl_df$Sample))
    rec_df     <- rec_df  %>% mutate(Sample = factor(as.character(Sample), levels = all_levels))
    ctrl_df    <- ctrl_df %>% mutate(Sample = factor(Sample,               levels = all_levels))
  }

  sub <- paste0(curve_name, " curve")
  if (!is.null(subtitle_extra)) sub <- paste0(sub, " — ", subtitle_extra)

  # Build a named label map for known samples only; unknown labels (controls)
  # are passed through as-is so ggplot does not drop them.
  sample_label_map <- c(
${sampleXLabels}
  )

  p <- ggplot(rec_df,
              aes(x = Sample, y = .data[[y_col]],
                  fill = Loaded_label, group = Loaded_label)) +
    geom_col(position = position_dodge(width = 0.65),
             width = 0.55, colour = "black") +
    geom_errorbar(aes(ymin = pmax(0, .data[[y_col]] - .data[[sd_col]]),
                      ymax = pmin(130, .data[[y_col]] + .data[[sd_col]])),
                  position = position_dodge(width = 0.65),
                  width = 0.2, linewidth = 0.8) +
    geom_hline(yintercept = 100, linetype = "dashed",
               colour = "grey40", linewidth = 0.7) +
    scale_fill_manual(values = fill_vals) +
    scale_y_continuous(limits = c(0, 130), expand = c(0, 0)) +
    scale_x_discrete(labels = function(x) {
      ifelse(x %in% names(sample_label_map), sample_label_map[x], x)
    }) +
    labs(title    = ifelse(curve_name == "PBS", "Free mRNA Recovery", "Total mRNA Recovery"),
         subtitle = sub,
         x = NULL, y = "Recovery (%)", fill = "Theoretical Maximum") +
    theme_bw(base_size = 16) +
    theme(plot.title      = element_text(face = "bold"),
          legend.position = "bottom",
          axis.text.x     = element_text(size = 13))

  if (!is.null(ctrl_df) && nrow(ctrl_df) > 0) {
    p <- p +
      geom_col(data        = ctrl_df,
               mapping     = aes(x = Sample, y = Recovery_pct),
               fill        = "#999999", colour = "black",
               width       = 0.55, alpha = 0.6,
               inherit.aes = FALSE) +
      geom_errorbar(data        = ctrl_df,
                    mapping     = aes(x    = Sample,
                                      ymin = pmax(0,   Recovery_pct - Recovery_sd),
                                      ymax = pmin(130, Recovery_pct + Recovery_sd)),
                    width       = 0.2, linewidth = 0.8,
                    inherit.aes = FALSE)
  }
  p
}

# --- PBS recovery plot -------------------------------------------------------
if (has_ctrl_rec) {
  ctrl_rec_pbs <- ctrl_summary %>%
    filter(Curve == "PBS") %>%
    summarise(
      Recovery_pct = mean(Recovery_pct),
      Recovery_sd  = mean(SD_Conc_ngml / Known_Conc_ngml * 100)
    ) %>%
    mutate(Sample = "Empty liposome + mRNA spike")
} else {
  ctrl_rec_pbs <- NULL
}

p_recovery_pbs <- make_recovery_plot(
  rec_df       = recovery_base %>% rename(Recovery_pct = Recovery_PBS, Recovery_sd = SD_PBS),
  ctrl_df      = ctrl_rec_pbs,
  curve_name   = "PBS",
  y_col        = "Recovery_pct", sd_col = "Recovery_sd",
  fill_vals    = ${loadedColoursR},
  subtitle_extra = if (has_ctrl_rec) "controls (empty lipo + spike-in) in grey" else NULL
)
print(p_recovery_pbs)
ggsave("mRNA_recovery_PBS.png", plot = p_recovery_pbs, width = 9, height = 5, dpi = 300)

# --- Triton recovery plot ----------------------------------------------------
if (has_ctrl_rec) {
  ctrl_rec_tri <- ctrl_summary %>%
    filter(Curve == "Triton") %>%
    summarise(
      Recovery_pct = mean(Recovery_pct),
      Recovery_sd  = mean(SD_Conc_ngml / Known_Conc_ngml * 100)
    ) %>%
    mutate(Sample = "Empty liposome + mRNA spike")

  if (nrow(ctrl_rec_tri) == 0) ctrl_rec_tri <- NULL
} else {
  ctrl_rec_tri <- NULL
}

p_recovery_tri <- make_recovery_plot(
  rec_df       = recovery_base %>% rename(Recovery_pct = Recovery_Triton, Recovery_sd = SD_Triton),
  ctrl_df      = ctrl_rec_tri,
  curve_name   = "Triton",
  y_col        = "Recovery_pct", sd_col = "Recovery_sd",
  fill_vals    = ${loadedColoursR},
  subtitle_extra = if (!is.null(ctrl_rec_tri)) "controls (empty lipo + spike-in) in grey" else NULL
)
print(p_recovery_tri)
ggsave("mRNA_recovery_Triton.png", plot = p_recovery_tri, width = 9, height = 5, dpi = 300)
cat("\\nmRNA recovery plots saved (PBS and Triton).\\n")

# --- 12. mRNA Concentration bar plot ----------------------------------------
conc_plot_data <- summary_samples %>%
  mutate(Sample = as.character(Sample),
         Curve  = factor(Curve, levels = c("PBS", "Triton")),
         Type   = "Sample")

if (exists("ctrl_raw") && nrow(ctrl_raw) > 0) {
  ctrl_conc <- ctrl_raw %>%
    group_by(Curve, Known_Conc_ngml) %>%
    summarise(Mean_Conc_ngml = mean(Conc_ngml), SD_Conc_ngml = sd(Conc_ngml),
              .groups = "drop") %>%
    mutate(Sample = paste0("Ctrl\\n", Known_Conc_ngml, " ng/mL"),
           Curve  = factor(Curve, levels = c("PBS","Triton")),
           Type   = "Control")

  all_conc <- bind_rows(
    conc_plot_data %>% select(Sample, Curve, Mean_Conc_ngml, SD_Conc_ngml, Type),
    ctrl_conc      %>% select(Sample, Curve, Mean_Conc_ngml, SD_Conc_ngml, Type)
  )
} else {
  all_conc <- conc_plot_data %>%
    select(Sample, Curve, Mean_Conc_ngml, SD_Conc_ngml, Type)
}

conc_order <- c(sample_labels, setdiff(unique(all_conc$Sample), sample_labels))
all_conc <- all_conc %>%
  mutate(Sample = factor(Sample, levels = conc_order))

p_conc <- ggplot(all_conc, aes(x = Sample, y = Mean_Conc_ngml,
                                fill = Curve, group = Curve,
                                alpha = Type)) +
  geom_col(position = position_dodge(width = 0.65), width = 0.55, colour = "black") +
  geom_errorbar(aes(ymin = pmax(0, Mean_Conc_ngml - SD_Conc_ngml),
                    ymax = Mean_Conc_ngml + SD_Conc_ngml),
                position = position_dodge(width = 0.65), width = 0.2, linewidth = 0.8) +
  scale_fill_manual(values = c("PBS" = "#2166ac", "Triton" = "#d6604d")) +
  scale_alpha_manual(values = c("Sample" = 1, "Control" = 0.6), guide = "none") +
  scale_x_discrete(labels = function(x) {
    lbl <- c(
${sampleXLabels}
    )
    ifelse(x %in% names(lbl), lbl[x], x)
  }) +
  labs(title = "mRNA Concentration by Sample & Condition",
       subtitle = "Controls (empty lipo + spike-in) shown at reduced opacity",
       x = NULL, y = "mRNA Concentration (ng/mL)", fill = "Condition") +
  theme_bw(base_size = 16) +
  theme(plot.title = element_text(face = "bold"),
        axis.text.x = element_text(size = 9))

print(p_conc)
ggsave("mRNA_concentrations.png", plot = p_conc, width = 10, height = 5, dpi = 300)

# --- 13. Export to Excel -----------------------------------------------------
cal_stats <- tibble(
  Curve     = c("PBS", "Triton"),
  Intercept = c(coef(pbs_model)[1], coef(triton_model)[1]),
  Slope     = c(coef(pbs_model)[2], coef(triton_model)[2]),
  R_squared = c(pbs_r2, triton_r2)
)

excel_sheets <- list(
  "Standards"         = standards %>% select(Well, Row, Col, Curve, Concentration_ngml, Fluorescence),
  "Calibration_Stats" = cal_stats,
  "Sample_Replicates" = samples_raw %>% select(Well, Row, Col, Sample, Curve, Fluorescence, Conc_ngml),
  "Summary"           = summary_samples,
  "EE_Results"        = ee_results %>% select(Sample, Free_mRNA_ngml, Total_mRNA_ngml,
                                               Encapsulated_mRNA_ngml, EE_percent, EE_sd),
  "Recovery"          = recovery_data %>% select(Sample, Loaded_label, Total_mRNA_ngml,
                                                  Loaded_ngml, Recovery_pct, Recovery_sd)
)
if (exists("ctrl_summary") && nrow(ctrl_summary) > 0) {
  excel_sheets[["Control_Recovery"]] <- ctrl_summary
}
write_xlsx(excel_sheets, path = output_file)

cat(sprintf("\\nResults exported to: %s\\n", output_file))
cat("\\nAll done!\\n")`;
}

export default function PlateConfigurator() {
  const [layout, setLayout] = useState(DEFAULT_LAYOUT());
  const [activeTool, setActiveTool] = useState("std_pbs");
  const [isDragging, setIsDragging] = useState(false);
  const [samples, setSamples] = useState([
    { label: "Filtered_FridgeStored" },
    { label: "Filtered_Freezedried" },
    { label: "Unfiltered_FridgeStored" },
  ]);
  const [stdConcs, setStdConcs] = useState([...STD_CONC_DEFAULT]);
  const [loadedConcs, setLoadedConcs] = useState([700, 880]);
  const [ctrlConcs, setCtrlConcs] = useState([500, 850]);
  const [csvFile, setCsvFile] = useState("your_plate_data.csv");
  const [outputFile, setOutputFile] = useState("ribogreen_results.xlsx");
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const paintWell = useCallback(
    (well) => {
      setLayout((prev) => ({ ...prev, [well]: activeTool }));
    },
    [activeTool]
  );

  const handleMouseDown = (well) => {
    setIsDragging(true);
    paintWell(well);
  };
  const handleMouseEnter = (well) => {
    if (isDragging) paintWell(well);
  };
  const handleMouseUp = () => setIsDragging(false);
  const clearLayout = () => setLayout(DEFAULT_LAYOUT());

  const code = generateRConfig(
    layout,
    samples,
    stdConcs,
    loadedConcs,
    ctrlConcs,
    csvFile,
    outputFile
  );

  const copyCode = () => {
    try {
      const ta = document.createElement("textarea");
      ta.value = code;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const counts = {};
  ASSIGN_TYPES.forEach((t) => {
    counts[t.id] = 0;
  });
  Object.values(layout).forEach((t) => {
    counts[t]++;
  });

  return (
    <div
      style={{
        fontFamily: "'IBM Plex Mono', monospace",
        background: "#0d1117",
        minHeight: "100vh",
        color: "#c9d1d9",
        padding: "24px",
        userSelect: "none",
      }}
      onMouseUp={handleMouseUp}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #161b22; }
        ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
        .well { width: 44px; height: 44px; border-radius: 50%; border: 2px solid; cursor: crosshair;
                transition: transform 0.1s, filter 0.1s; display: flex; align-items: center; justify-content: center;
                font-size: 7.5px; font-weight: 600; letter-spacing: 0.02em; text-align: center; line-height: 1.15; }
        .well:hover { transform: scale(1.15); filter: brightness(1.3); }
        .tool-btn { padding: 6px 11px; border-radius: 4px; border: 2px solid; cursor: pointer;
                    font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 600;
                    transition: all 0.15s; letter-spacing: 0.04em; }
        .tool-btn:hover { filter: brightness(1.2); }
        .tool-btn.active { transform: scale(1.05); }
        input[type=text], input[type=number] {
          background: #161b22; border: 1px solid #30363d; color: #c9d1d9;
          font-family: 'IBM Plex Mono', monospace; font-size: 12px;
          border-radius: 4px; padding: 4px 8px; width: 100%;
        }
        input:focus { outline: none; border-color: #58a6ff; }
        .section-title { font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: #58a6ff; margin-bottom: 10px; font-weight: 600; }
        .ctrl-section-title { font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: #c8a000; margin-bottom: 10px; font-weight: 600; }
        .code-block { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 16px;
                      font-size: 11px; line-height: 1.7; overflow-x: auto; white-space: pre; color: #a8d8a0; }
        .btn-primary { background: #1f6feb; border: none; color: white; padding: 8px 18px; border-radius: 5px;
                       font-family: 'IBM Plex Mono', monospace; font-size: 12px; font-weight: 600; cursor: pointer;
                       letter-spacing: 0.05em; transition: background 0.15s; }
        .btn-primary:hover { background: #388bfd; }
        .btn-ghost { background: transparent; border: 1px solid #30363d; color: #8b949e; padding: 8px 18px; border-radius: 5px;
                     font-family: 'IBM Plex Mono', monospace; font-size: 12px; cursor: pointer; transition: all 0.15s; }
        .btn-ghost:hover { border-color: #58a6ff; color: #c9d1d9; }
        .divider { border: none; border-top: 1px solid #21262d; margin: 4px 0 12px; }
      `}</style>

      <div style={{ marginBottom: "24px" }}>
        <div
          style={{
            fontSize: "11px",
            color: "#58a6ff",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            marginBottom: "4px",
          }}
        >
          RiboGreen Assay
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: "22px",
            fontWeight: 600,
            color: "#f0f6fc",
            letterSpacing: "-0.02em",
          }}
        >
          Plate Layout Configurator
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#6e7681" }}>
          Select a well type, then click or drag to paint wells. Generate R
          config when done.
        </p>
      </div>

      <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
        {/* Left: plate + tools */}
        <div style={{ flex: "1 1 520px" }}>
          <div style={{ marginBottom: "16px" }}>
            <div className="section-title">Well Type — Samples</div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "6px",
                marginBottom: "8px",
              }}
            >
              {ASSIGN_TYPES.filter(
                (t) => !["ctrl_pbs", "ctrl_tri"].includes(t.id)
              ).map((t) => (
                <button
                  key={t.id}
                  className={`tool-btn ${activeTool === t.id ? "active" : ""}`}
                  style={{
                    background: activeTool === t.id ? t.color : "transparent",
                    borderColor: t.border,
                    color: t.text,
                    boxShadow:
                      activeTool === t.id ? `0 0 10px ${t.border}66` : "none",
                  }}
                  onClick={() => setActiveTool(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ borderTop: "1px solid #21262d", paddingTop: "8px" }}>
              <div
                style={{
                  fontSize: "9px",
                  color: "#c8a000",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  marginBottom: "6px",
                  fontWeight: 600,
                }}
              >
                Control (empty liposome + mRNA spike-in)
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                {ASSIGN_TYPES.filter((t) =>
                  ["ctrl_pbs", "ctrl_tri"].includes(t.id)
                ).map((t) => (
                  <button
                    key={t.id}
                    className={`tool-btn ${
                      activeTool === t.id ? "active" : ""
                    }`}
                    style={{
                      background: activeTool === t.id ? t.color : "transparent",
                      borderColor: t.border,
                      color: t.text,
                      boxShadow:
                        activeTool === t.id ? `0 0 10px ${t.border}66` : "none",
                    }}
                    onClick={() => setActiveTool(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div
            style={{
              background: "#161b22",
              border: "1px solid #30363d",
              borderRadius: "8px",
              padding: "16px",
              display: "inline-block",
            }}
          >
            <div
              style={{
                display: "flex",
                marginLeft: "28px",
                marginBottom: "6px",
              }}
            >
              {COLS.map((c) => (
                <div
                  key={c}
                  style={{
                    width: "44px",
                    textAlign: "center",
                    fontSize: "11px",
                    color: "#6e7681",
                    fontWeight: 600,
                  }}
                >
                  {c}
                </div>
              ))}
            </div>
            {ROWS.map((row) => (
              <div
                key={row}
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginBottom: "4px",
                }}
              >
                <div
                  style={{
                    width: "24px",
                    fontSize: "12px",
                    color: "#6e7681",
                    fontWeight: 600,
                    textAlign: "right",
                    marginRight: "4px",
                  }}
                >
                  {row}
                </div>
                {COLS.map((col) => {
                  const well = `${row}${col}`;
                  const type = TYPE_MAP[layout[well]];
                  return (
                    <div
                      key={col}
                      className="well"
                      style={{
                        background: type.color,
                        borderColor: type.border,
                        color: type.text,
                      }}
                      onMouseDown={() => handleMouseDown(well)}
                      onMouseEnter={() => handleMouseEnter(well)}
                      title={`${well}: ${type.label}`}
                    >
                      {layout[well] !== "empty"
                        ? type.label.replace(" ", "\n")
                        : ""}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div style={{ marginTop: "10px" }}>
            <button className="btn-ghost" onClick={clearLayout}>
              Clear Plate
            </button>
          </div>

          <div
            style={{
              marginTop: "14px",
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            {ASSIGN_TYPES.filter(
              (t) => t.id !== "empty" && counts[t.id] > 0
            ).map((t) => (
              <div
                key={t.id}
                style={{
                  fontSize: "10px",
                  color: t.text,
                  background: t.color,
                  border: `1px solid ${t.border}`,
                  borderRadius: "4px",
                  padding: "2px 8px",
                }}
              >
                {t.label}: {counts[t.id]}
              </div>
            ))}
          </div>
        </div>

        {/* Right: config panel */}
        <div
          style={{
            flex: "0 0 260px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
        >
          <div>
            <div className="section-title">File Paths</div>
            <div style={{ marginBottom: "8px" }}>
              <div
                style={{
                  fontSize: "10px",
                  color: "#6e7681",
                  marginBottom: "3px",
                }}
              >
                Input CSV filename
              </div>
              <input
                type="text"
                value={csvFile}
                onChange={(e) => setCsvFile(e.target.value)}
                placeholder="your_plate_data.csv"
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: "10px",
                  color: "#6e7681",
                  marginBottom: "3px",
                }}
              >
                Output Excel filename
              </div>
              <input
                type="text"
                value={outputFile}
                onChange={(e) => setOutputFile(e.target.value)}
                placeholder="ribogreen_results.xlsx"
              />
            </div>
          </div>

          <div>
            <div className="section-title">Sample Labels</div>
            {samples.map((s, i) => (
              <div key={i} style={{ marginBottom: "8px" }}>
                <div
                  style={{
                    fontSize: "10px",
                    color: "#6e7681",
                    marginBottom: "3px",
                  }}
                >
                  S{i + 1} — PBS &amp; Triton
                </div>
                <input
                  type="text"
                  value={s.label}
                  onChange={(e) => {
                    const updated = [...samples];
                    updated[i] = { ...updated[i], label: e.target.value };
                    setSamples(updated);
                  }}
                  placeholder={`Sample ${i + 1} name`}
                />
              </div>
            ))}
          </div>

          <div>
            <div className="section-title">Standard Concentrations (ng/mL)</div>
            {stdConcs.map((c, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginBottom: "6px",
                  gap: "8px",
                }}
              >
                <div
                  style={{ fontSize: "10px", color: "#6e7681", width: "40px" }}
                >
                  Col {i + 1}
                </div>
                <input
                  type="number"
                  value={c}
                  onChange={(e) => {
                    const u = [...stdConcs];
                    u[i] = Number(e.target.value);
                    setStdConcs(u);
                  }}
                />
              </div>
            ))}
            <button
              className="btn-ghost"
              style={{
                fontSize: "10px",
                padding: "4px 10px",
                marginTop: "4px",
              }}
              onClick={() => setStdConcs([...stdConcs, 0])}
            >
              + Add standard
            </button>
          </div>

          <div>
            <div className="section-title">Loaded mRNA Maxima (ng/mL)</div>
            {loadedConcs.map((c, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginBottom: "6px",
                  gap: "8px",
                }}
              >
                <div
                  style={{ fontSize: "10px", color: "#6e7681", width: "40px" }}
                >
                  Max {i + 1}
                </div>
                <input
                  type="number"
                  value={c}
                  onChange={(e) => {
                    const u = [...loadedConcs];
                    u[i] = Number(e.target.value);
                    setLoadedConcs(u);
                  }}
                />
              </div>
            ))}
          </div>

          <div
            style={{
              background: "#161200",
              border: "1px solid #3d3000",
              borderRadius: "6px",
              padding: "12px",
            }}
          >
            <div className="ctrl-section-title">
              Control Spike-in Concentrations (ng/mL)
            </div>
            <div
              style={{
                fontSize: "10px",
                color: "#8a7000",
                marginBottom: "10px",
                lineHeight: "1.5",
              }}
            >
              Empty liposome + known mRNA amounts.
              <br />
              Each value maps to one CTRL well column.
            </div>
            {ctrlConcs.map((c, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginBottom: "6px",
                  gap: "8px",
                }}
              >
                <div
                  style={{ fontSize: "10px", color: "#c8a000", width: "50px" }}
                >
                  Ctrl {i + 1}
                </div>
                <input
                  type="number"
                  value={c}
                  style={{
                    background: "#1e1800",
                    borderColor: "#3d3000",
                    color: "#ffe066",
                  }}
                  onChange={(e) => {
                    const u = [...ctrlConcs];
                    u[i] = Number(e.target.value);
                    setCtrlConcs(u);
                  }}
                />
                <button
                  onClick={() =>
                    setCtrlConcs(ctrlConcs.filter((_, j) => j !== i))
                  }
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#6e5000",
                    cursor: "pointer",
                    fontSize: "14px",
                    lineHeight: 1,
                  }}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              className="btn-ghost"
              style={{
                fontSize: "10px",
                padding: "4px 10px",
                marginTop: "4px",
                borderColor: "#3d3000",
                color: "#c8a000",
              }}
              onClick={() => setCtrlConcs([...ctrlConcs, 0])}
            >
              + Add concentration
            </button>
          </div>

          <button className="btn-primary" onClick={() => setShowCode(true)}>
            Generate R Config ↓
          </button>
        </div>
      </div>

      {showCode && (
        <div style={{ marginTop: "28px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "10px",
            }}
          >
            <div className="section-title" style={{ margin: 0 }}>
              Generated R Configuration
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="btn-primary" onClick={copyCode}>
                {copied ? "✓ Copied!" : "Copy to Clipboard"}
              </button>
              <button className="btn-ghost" onClick={() => setShowCode(false)}>
                Hide
              </button>
            </div>
          </div>
          <div className="code-block">{code}</div>
          <p style={{ fontSize: "11px", color: "#6e7681", marginTop: "10px" }}>
            This is a fully self-contained R script — copy it into a new RStudio
            file and run it directly.
          </p>
        </div>
      )}
    </div>
  );
}
