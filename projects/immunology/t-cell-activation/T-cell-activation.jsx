import { useState, useCallback } from "react";

const ROWS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const COLS = Array.from({ length: 12 }, (_, i) => i + 1);

const PALETTE = [
  { color: "#1e2535", border: "#2e3a52", text: "#3a4a60" },
  { color: "#0d3b6e", border: "#1a6bbf", text: "#90caf9" },
  { color: "#5c0d1a", border: "#bf1a3a", text: "#f9a0b4" },
  { color: "#1a4a1a", border: "#2abf2a", text: "#86efca" },
  { color: "#3a1a5c", border: "#7a1abf", text: "#d4a0f9" },
  { color: "#4a2a00", border: "#bf7a1a", text: "#fcd19a" },
  { color: "#003a4a", border: "#1aa8bf", text: "#a0e8f9" },
  { color: "#3a3a00", border: "#bfbf1a", text: "#f9f9a0" },
  { color: "#3a003a", border: "#bf1abf", text: "#f9a0f9" },
  { color: "#1a1a3a", border: "#4a4abf", text: "#b0b0f9" },
  { color: "#003020", border: "#00c070", text: "#80ffc0" },
  { color: "#302000", border: "#c08000", text: "#ffe080" },
  { color: "#300020", border: "#c00080", text: "#ffb0e0" },
];

const DEFAULT_FIXED = [
  { id: "medium", label: "Medium", conc: "", unit: "", paletteIdx: 9 },
  {
    id: "pos",
    label: "Positive Control",
    conc: "",
    unit: "ug/mL",
    paletteIdx: 10,
  },
  {
    id: "neg",
    label: "Negative Control",
    conc: "",
    unit: "ug/mL",
    paletteIdx: 11,
  },
];

const DEFAULT_GROUPS = [
  {
    id: "g1",
    name: "Lipo OVA-mRNA",
    unit: "ug/mL",
    concs: ["1.00", "0.67", "0.44", "0.20"],
    paletteIdx: 1,
  },
  {
    id: "g2",
    name: "Empty Lipo + OVA-mRNA",
    unit: "ug/mL",
    concs: ["1.00", "0.67", "0.44", "0.20"],
    paletteIdx: 2,
  },
];

const DEFAULT_LAYOUT = () => {
  const grid = {};
  ROWS.forEach((r) =>
    COLS.forEach((c) => {
      grid[`${r}${c}`] = "empty";
    })
  );
  return grid;
};

function buildConditions(fixed, groups) {
  const empty = [
    { id: "empty", label: "Empty", conc: "", unit: "", paletteIdx: 0 },
  ];
  const fixedConds = fixed.map((f) => ({ ...f, group: null, isFixed: true }));
  const groupConds = groups.flatMap((g) =>
    g.concs.map((c, i) => ({
      id: `${g.id}_${i}`,
      label: `${g.name} ${c}${g.unit}`,
      conc: c,
      unit: g.unit,
      paletteIdx: g.paletteIdx,
      group: g.name,
      isFixed: false,
    }))
  );
  return [...empty, ...fixedConds, ...groupConds];
}

function generateRScript(layout, fixed, groups, csvFile, outputFile, statTest) {
  const conditions = buildConditions(fixed, groups);
  const byCondition = {};
  conditions.forEach((c) => {
    byCondition[c.id] = [];
  });
  Object.entries(layout).forEach(([well, cid]) => {
    if (byCondition[cid])
      byCondition[cid].push({ row: well[0], col: parseInt(well.slice(1)) });
  });

  const fmtRows = (rows) =>
    rows.length
      ? `c("${[...new Set(rows)].sort().join('","')}")`
      : "character(0)";
  const fmtCols = (cols) =>
    cols.length
      ? `c(${[...new Set(cols)].sort((a, b) => a - b).join(",")})`
      : "integer(0)";

  const medWells = byCondition["medium"] || [];
  const medRows = fmtRows(medWells.map((w) => w.row));
  const medCols = fmtCols(medWells.map((w) => w.col));

  const expConds = conditions.filter(
    (c) =>
      c.id !== "empty" &&
      c.id !== "medium" &&
      (byCondition[c.id]?.length ?? 0) > 0
  );

  // Unique R-level condition ID: fixed conditions append conc to avoid collisions
  const condId = (c) =>
    c.isFixed && c.conc
      ? `${c.label}_${c.conc}${c.unit}`.replace(/[^A-Za-z0-9_.]/g, "_")
      : c.label;

  const extractBlocks = expConds
    .map((c) => {
      const wells = byCondition[c.id];
      const rows = fmtRows(wells.map((w) => w.row));
      const cols = fmtCols(wells.map((w) => w.col));
      // Fixed conditions with a concentration get their own label as group
      // so they appear in the bar chart. Only unlabelled fixed (Pos/Neg) use "Control".
      const grp = c.isFixed ? (c.conc ? c.label : "Control") : c.group;
      const isFixedR = c.isFixed ? "TRUE" : "FALSE";
      const cid = condId(c);
      return `  plate_long %>% filter(Row %in% ${rows}, Col %in% ${cols}) %>%\n    mutate(Condition="${cid}", Group="${grp}", Conc=${
        c.conc || "NA"
      }, IsFixed=${isFixedR})`;
    })
    .join(",\n\n");

  const palette = [
    "#2166ac",
    "#d6604d",
    "#4dac26",
    "#f1a340",
    "#998ec3",
    "#66c2a5",
    "#e08214",
    "#b2182b",
  ];
  const groupColours = {};
  groups.forEach((g, i) => {
    groupColours[g.name] = palette[i % palette.length];
  });

  // Deduplicate by condId to avoid R factor level errors
  const seenLabels = new Set();
  const uniqueExpConds = expConds.filter((c) => {
    if (seenLabels.has(condId(c))) return false;
    seenLabels.add(condId(c));
    return true;
  });
  const condOrder = uniqueExpConds.map((c) => `"${condId(c)}"`).join(", ");
  const condLabels = uniqueExpConds
    .map((c) => {
      const lbl = c.conc
        ? `${c.group || c.label}\\n${c.conc} ${c.unit}`
        : c.label;
      return `  "${condId(c)}" = "${lbl}"`;
    })
    .join(",\n");

  // Fixed conditions without conc (Pos/Neg) get grey; those with conc get distinct colours
  const fixedWithConcPalette = [
    "#e6550d",
    "#31a354",
    "#756bb1",
    "#636363",
    "#d94701",
    "#74c476",
  ];
  let fixedWithConcIdx = 0;
  const fillValues = uniqueExpConds
    .map((c) => {
      let col;
      if (!c.isFixed) {
        col = groupColours[c.group] || "#aaaaaa";
      } else if (c.conc) {
        col =
          fixedWithConcPalette[
            fixedWithConcIdx++ % fixedWithConcPalette.length
          ];
      } else {
        col = "#888888";
      }
      return `"${condId(c)}" = "${col}"`;
    })
    .join(", ");

  const gcR = Object.entries(groupColours)
    .map(([k, v]) => `"${k}"="${v}"`)
    .join(", ");
  const sampleGroupsR = groups.map((g) => `"${g.name}"`).join(", ");
  // Fixed condition labels (used as Group names) — exclude from dose-response
  const fixedGroupsR = fixed
    .filter((f) => f.conc)
    .map((f) => `"${f.label}"`)
    .join(", ");

  const statBlock =
    statTest === "ttest"
      ? `n_conds <- all_data %>% filter(Condition != "Medium") %>% pull(Condition) %>% unique() %>% length()
if (n_conds >= 2) {
  stat_results <- all_data %>% filter(Condition != "Medium") %>%
    pairwise_t_test(Net_OD ~ Condition, p.adjust.method = "BH") %>% filter(p.adj < 0.05)
  cat("\\n===== Significant pairwise t-tests =====\\n"); print(stat_results)
} else { stat_results <- tibble(); cat(sprintf("\\nSkipping t-tests: only %d condition(s).\\n", n_conds)) }`
      : `n_conds <- all_data %>% filter(Condition != "Medium") %>% pull(Condition) %>% unique() %>% length()
if (n_conds >= 2) {
  anova_res <- all_data %>% filter(Condition != "Medium") %>% anova_test(Net_OD ~ Condition)
  cat("\\n===== ANOVA =====\\n"); print(anova_res)
  tukey_res <- all_data %>% filter(Condition != "Medium") %>% tukey_hsd(Net_OD ~ Condition)
  cat("\\n===== Tukey (p<0.05) =====\\n")
  print(tukey_res %>% filter(p.adj < 0.05) %>% dplyr::select(group1, group2, p.adj, p.adj.signif))
} else { anova_res <- tibble(); tukey_res <- tibble(); cat(sprintf("\\nSkipping ANOVA: only %d condition(s).\\n", n_conds)) }`;

  const excelSheets =
    statTest === "ttest"
      ? `"T_tests"  = as.data.frame(stat_results)`
      : `"ANOVA"    = as.data.frame(anova_res),\n  "Tukey"    = as.data.frame(tukey_res)`;

  return `# ================================================================
# AUTO-GENERATED B3Z ASSAY ANALYSIS SCRIPT
# ================================================================

# --- 1. Packages -------------------------------------------------------------
required_packages <- c("tidyverse","readr","ggplot2","writexl","rstatix","ggpubr")
new_packages <- required_packages[!(required_packages %in% installed.packages()[,"Package"])]
if (length(new_packages)) install.packages(new_packages)
library(tidyverse); library(readr); library(ggplot2)
library(writexl); library(rstatix); library(ggpubr)

# --- 2. File paths -----------------------------------------------------------
csv_file    <- "${csvFile || "your_b3z_data.csv"}"
output_file <- "${outputFile || "b3z_results.xlsx"}"

# --- 3. Read & parse CSV -----------------------------------------------------
raw_all <- read_delim(csv_file, delim=";", col_names=FALSE,
                      show_col_types=FALSE, locale=locale(decimal_mark=","))
raw <- raw_all %>%
  filter(X1 %in% c("A","B","C","D","E","F","G","H")) %>%
  dplyr::select(1:13) %>% dplyr::select(where(~ !all(is.na(.)))) %>%
  setNames(c("Row", as.character(1:12))) %>%
  mutate(across(-Row, ~ suppressWarnings(as.numeric(.))))

plate_long <- raw %>%
  pivot_longer(cols=-Row, names_to="Col", values_to="OD596") %>%
  mutate(Col=as.integer(Col), Well=paste0(Row,Col)) %>%
  filter(!is.na(OD596))

# --- 4. Extract conditions ---------------------------------------------------
all_data <- bind_rows(
  plate_long %>% filter(Row %in% ${medRows}, Col %in% ${medCols}) %>%
    mutate(Condition="Medium", Group="Control", Conc=NA_real_, IsFixed=TRUE),

${extractBlocks}
)

# --- 5. Background subtraction -----------------------------------------------
medium_mean <- all_data %>% filter(Condition=="Medium") %>%
  summarise(m=mean(OD596)) %>% pull(m)
cat(sprintf("\\nMedium background: %.4f\\n", medium_mean))
all_data <- all_data %>% mutate(Net_OD=OD596 - medium_mean)

# --- 6. Summarise ------------------------------------------------------------
summary_data <- all_data %>%
  group_by(Condition, Group, Conc) %>%
  summarise(Mean_OD596=mean(OD596), SD_OD596=sd(OD596),
            Mean_NetOD=mean(Net_OD), SD_NetOD=sd(Net_OD),
            N=n(), SEM_NetOD=SD_NetOD/sqrt(N), .groups="drop")
cat("\\n===== Summary =====\\n"); print(summary_data)

# --- 7. Statistics -----------------------------------------------------------
${statBlock}

# --- 8. Plot 1: Bar chart ----------------------------------------------------
condition_order  <- unique(c(${condOrder}))
condition_labels <- c(
${condLabels}
)
fill_values <- c(${fillValues})

bar_data <- summary_data %>%
  filter(Condition %in% condition_order) %>%
  mutate(Condition=factor(Condition, levels=condition_order))

bar_raw <- all_data %>%
  filter(Condition %in% condition_order) %>%
  mutate(Condition = factor(Condition, levels = condition_order))

p_bar <- ggplot(bar_data, aes(x=Condition, y=Mean_NetOD, fill=Condition)) +
  geom_col(width=0.7, colour="black", linewidth=0.3) +
  geom_jitter(data=bar_raw, aes(x=Condition, y=Net_OD),
              width=0.12, height=0, size=2, shape=21,
              fill="white", colour="black", stroke=0.6,
              inherit.aes=FALSE) +
  geom_hline(yintercept=0, linetype="dashed", colour="grey40", linewidth=0.5) +
  scale_x_discrete(labels=condition_labels) +
  scale_fill_manual(values=fill_values) +
  labs(title="B3Z Activation - All Conditions", subtitle="Net OD596",
       x=NULL, y="Net OD596") +
  theme_bw(base_size=11) +
  theme(plot.title=element_text(face="bold"),
        axis.text.x=element_text(size=8, angle=35, hjust=1),
        legend.position="none")
print(p_bar)
ggsave("b3z_all_conditions.png", plot=p_bar, width=12, height=6, dpi=300)

# --- 9. Plot 2: Dose-response ------------------------------------------------
sample_groups <- c(${sampleGroupsR})
fixed_groups  <- c(${fixedGroupsR})  # extra controls  -  bar chart only
dose_data <- all_data %>%
  filter(!is.na(Conc), IsFixed == FALSE) %>%
  mutate(Group=factor(Group, levels=sample_groups), Conc=as.numeric(Conc))

if (nrow(dose_data) > 0) {
  dose_summary <- dose_data %>%
    group_by(Group, Conc) %>%
    summarise(Mean_NetOD=mean(Net_OD), SD_NetOD=sd(Net_OD), N=n(), .groups="drop")

  group_colours <- c(${gcR})

  p_dose <- ggplot(dose_summary, aes(x=Conc, y=Mean_NetOD, colour=Group, group=Group)) +
    geom_line(linewidth=1) + geom_point(size=3) +
    geom_errorbar(aes(ymin=pmax(0,Mean_NetOD-SD_NetOD), ymax=Mean_NetOD+SD_NetOD),
                  width=0.02, linewidth=0.7) +
    geom_hline(yintercept=0, linetype="dashed", colour="grey50") +
    scale_colour_manual(values=group_colours) +
    labs(title="B3Z Activation - Dose Response", subtitle="Net OD596",
         x="Concentration (ug/mL)", y="Net OD596", colour=NULL) +
    theme_bw(base_size=13) +
    theme(plot.title=element_text(face="bold"), legend.position="bottom")
  print(p_dose)
  ggsave("b3z_dose_response.png", plot=p_dose, width=7, height=5, dpi=300)
} else {
  cat("\\nNo dose-response data - skipping dose-response plot.\\n")
}

# --- 10. Export to Excel -----------------------------------------------------
write_xlsx(list(
  "Raw_Data" = all_data %>% dplyr::select(Well, Row, Col, Condition, Group, Conc, OD596, Net_OD),
  "Summary"  = summary_data,
  ${excelSheets}
), path=output_file)
cat(sprintf("\\nExported to: %s\\nAll done!\\n", output_file))`;
}

export default function B3ZConfigurator() {
  const [layout, setLayout] = useState(DEFAULT_LAYOUT());
  const [fixed, setFixed] = useState(DEFAULT_FIXED);
  const [groups, setGroups] = useState(DEFAULT_GROUPS);
  const [activeTool, setActiveTool] = useState("medium");
  const [isDragging, setIsDragging] = useState(false);
  const [csvFile, setCsvFile] = useState("your_b3z_data.csv");
  const [outputFile, setOutputFile] = useState("b3z_results.xlsx");
  const [statTest, setStatTest] = useState("anova");
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newName, setNewName] = useState("");
  const [newConcs, setNewConcs] = useState("1.00, 0.67, 0.44, 0.20");
  const [newUnit, setNewUnit] = useState("ug/mL");
  const [addMode, setAddMode] = useState("paste"); // "paste" | "dilution"
  const [dilStart, setDilStart] = useState("1.00");
  const [dilFactor, setDilFactor] = useState("2");
  const [dilSteps, setDilSteps] = useState("4");

  const conditions = buildConditions(fixed, groups);
  const condMap = Object.fromEntries(conditions.map((c) => [c.id, c]));

  const paintWell = useCallback(
    (well) => setLayout((prev) => ({ ...prev, [well]: activeTool })),
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

  // Compute dilution series preview
  const dilutionConcs = () => {
    const start = parseFloat(dilStart);
    const factor = parseFloat(dilFactor);
    const steps = parseInt(dilSteps);
    if (
      isNaN(start) ||
      isNaN(factor) ||
      isNaN(steps) ||
      factor <= 0 ||
      steps < 1
    )
      return [];
    return Array.from({ length: steps }, (_, i) => {
      const v = start / Math.pow(factor, i);
      // Round to 4 sig figs
      return parseFloat(v.toPrecision(4)).toString();
    });
  };

  const addGroup = () => {
    if (!newName.trim()) return;
    const concs =
      addMode === "dilution"
        ? dilutionConcs()
        : newConcs
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
    if (!concs.length) return;
    const usedIdxs = groups.map((g) => g.paletteIdx);
    const nextIdx =
      [1, 2, 3, 4, 5, 6, 7, 8].find((i) => !usedIdxs.includes(i)) || 1;
    setGroups([
      ...groups,
      {
        id: `g${Date.now()}`,
        name: newName.trim(),
        unit: newUnit.trim(),
        concs,
        paletteIdx: nextIdx,
      },
    ]);
    setNewName("");
    setNewConcs("1.00, 0.67, 0.44, 0.20");
  };

  const removeGroup = (id) => {
    setGroups(groups.filter((g) => g.id !== id));
    setLayout((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((w) => {
        if (next[w].startsWith(`${id}_`)) next[w] = "empty";
      });
      return next;
    });
  };

  const updateGroup = (id, field, val) =>
    setGroups(groups.map((g) => (g.id === id ? { ...g, [field]: val } : g)));
  const updateGroupConcs = (id, raw) =>
    setGroups(
      groups.map((g) =>
        g.id === id
          ? {
              ...g,
              concs: raw
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            }
          : g
      )
    );

  const addFixed = () => {
    const usedIdxs = fixed.map((f) => f.paletteIdx);
    const nextIdx = [10, 11, 12].find((i) => !usedIdxs.includes(i)) || 10;
    setFixed([
      ...fixed,
      {
        id: `fixed_${Date.now()}`,
        label: "New Control",
        conc: "",
        unit: "ug/mL",
        paletteIdx: nextIdx,
      },
    ]);
  };
  const removeFixed = (id) => {
    if (id === "medium") return;
    setFixed(fixed.filter((f) => f.id !== id));
    setLayout((prev) => {
      const n = { ...prev };
      Object.keys(n).forEach((w) => {
        if (n[w] === id) n[w] = "empty";
      });
      return n;
    });
  };
  const updateFixed = (id, field, val) =>
    setFixed(fixed.map((f) => (f.id === id ? { ...f, [field]: val } : f)));

  const code = generateRScript(
    layout,
    fixed,
    groups,
    csvFile,
    outputFile,
    statTest
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
    } catch (e) {
      console.error(e);
    }
  };

  const counts = {};
  conditions.forEach((c) => {
    counts[c.id] = 0;
  });
  Object.values(layout).forEach((t) => {
    if (counts[t] !== undefined) counts[t]++;
  });

  const getStyle = (cid) =>
    PALETTE[condMap[cid]?.paletteIdx ?? 0] || PALETTE[0];

  return (
    <div
      style={{
        fontFamily: "'IBM Plex Mono',monospace",
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
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:6px} ::-webkit-scrollbar-track{background:#161b22} ::-webkit-scrollbar-thumb{background:#30363d;border-radius:3px}
        .well{width:44px;height:44px;border-radius:50%;border:2px solid;cursor:crosshair;transition:transform 0.1s,filter 0.1s;display:flex;align-items:center;justify-content:center;font-size:6.5px;font-weight:600;text-align:center;line-height:1.2}
        .well:hover{transform:scale(1.15);filter:brightness(1.3)}
        .tool-btn{padding:4px 9px;border-radius:4px;border:2px solid;cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:600;transition:all 0.15s;white-space:nowrap}
        .tool-btn:hover{filter:brightness(1.25)} .tool-btn.active{transform:scale(1.05)}
        input[type=text],input[type=number],select{background:#161b22;border:1px solid #30363d;color:#c9d1d9;font-family:'IBM Plex Mono',monospace;font-size:11px;border-radius:4px;padding:3px 7px;width:100%}
        input:focus,select:focus{outline:none;border-color:#58a6ff}
        .sec{font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#58a6ff;margin-bottom:8px;font-weight:600}
        .code-block{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:16px;font-size:10.5px;line-height:1.7;overflow-x:auto;white-space:pre;color:#a8d8a0}
        .btn-p{background:#1f6feb;border:none;color:white;padding:7px 14px;border-radius:5px;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;cursor:pointer;transition:background 0.15s}
        .btn-p:hover{background:#388bfd}
        .btn-g{background:transparent;border:1px solid #30363d;color:#8b949e;padding:6px 12px;border-radius:5px;font-family:'IBM Plex Mono',monospace;font-size:11px;cursor:pointer;transition:all 0.15s}
        .btn-g:hover{border-color:#58a6ff;color:#c9d1d9}
        .badge{font-size:9px;border-radius:3px;padding:2px 6px;border:1px solid;white-space:nowrap}
        .del-btn{background:transparent;border:none;color:#555;cursor:pointer;font-size:15px;line-height:1;padding:0 3px;flex-shrink:0}
        .del-btn:hover{color:#bf1a1a}
        .group-card{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:10px 12px;margin-bottom:8px}
        .quick-add{background:#0d1f0d;border:1px solid #1a4a1a;border-radius:6px;padding:12px;margin-bottom:12px}
      `}</style>

      <div style={{ marginBottom: "20px" }}>
        <div
          style={{
            fontSize: "11px",
            color: "#58a6ff",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            marginBottom: "4px",
          }}
        >
          B3Z Assay
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: "22px",
            fontWeight: 600,
            color: "#f0f6fc",
          }}
        >
          Plate Layout Configurator
        </h1>
        <p style={{ margin: "5px 0 0", fontSize: "12px", color: "#6e7681" }}>
          Add sample groups → paint wells → generate R script.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: "24px",
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        {/* Left: plate */}
        <div style={{ flex: "1 1 520px" }}>
          <div style={{ marginBottom: "14px" }}>
            <div className="sec">Paint Tool — select then click/drag wells</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
              {conditions
                .filter((c) => c.id !== "empty")
                .map((c) => {
                  const s = PALETTE[c.paletteIdx] || PALETTE[1];
                  const lbl = c.conc
                    ? `${c.group || c.label} ${c.conc}`
                    : c.label;
                  return (
                    <button
                      key={c.id}
                      className={`tool-btn ${
                        activeTool === c.id ? "active" : ""
                      }`}
                      style={{
                        background:
                          activeTool === c.id ? s.color : "transparent",
                        borderColor: s.border,
                        color: s.text,
                        boxShadow:
                          activeTool === c.id
                            ? `0 0 8px ${s.border}55`
                            : "none",
                      }}
                      onClick={() => setActiveTool(c.id)}
                      title={lbl}
                    >
                      {lbl.length > 18 ? lbl.slice(0, 17) + "…" : lbl}
                    </button>
                  );
                })}
              <button
                className={`tool-btn ${activeTool === "empty" ? "active" : ""}`}
                style={{
                  background:
                    activeTool === "empty" ? "#2e3a52" : "transparent",
                  borderColor: "#2e3a52",
                  color: "#6e7681",
                }}
                onClick={() => setActiveTool("empty")}
              >
                ⌫ Erase
              </button>
            </div>
          </div>

          <div
            style={{
              background: "#161b22",
              border: "1px solid #30363d",
              borderRadius: "8px",
              padding: "14px",
              display: "inline-block",
            }}
          >
            <div
              style={{
                display: "flex",
                marginLeft: "28px",
                marginBottom: "4px",
              }}
            >
              {COLS.map((c) => (
                <div
                  key={c}
                  style={{
                    width: "44px",
                    textAlign: "center",
                    fontSize: "10px",
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
                  marginBottom: "3px",
                }}
              >
                <div
                  style={{
                    width: "24px",
                    fontSize: "11px",
                    color: "#6e7681",
                    fontWeight: 600,
                    textAlign: "right",
                    marginRight: "4px",
                  }}
                >
                  {row}
                </div>
                {COLS.map((col) => {
                  const well = `${row}${col}`,
                    cid = layout[well],
                    s = getStyle(cid),
                    cond = condMap[cid];
                  const lbl =
                    cid === "empty"
                      ? ""
                      : cond?.conc
                      ? `${cond.conc}`
                      : cond?.label?.slice(0, 6) || "";
                  return (
                    <div
                      key={col}
                      className="well"
                      style={{
                        background: s.color,
                        borderColor: s.border,
                        color: s.text,
                      }}
                      onMouseDown={() => handleMouseDown(well)}
                      onMouseEnter={() => handleMouseEnter(well)}
                      title={`${well}: ${cond?.label || "Empty"}`}
                    >
                      {lbl}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div style={{ marginTop: "10px" }}>
            <button className="btn-g" onClick={clearLayout}>
              Clear Plate
            </button>
          </div>

          <div
            style={{
              marginTop: "12px",
              display: "flex",
              flexWrap: "wrap",
              gap: "5px",
            }}
          >
            {conditions
              .filter((c) => c.id !== "empty" && (counts[c.id] || 0) > 0)
              .map((c) => {
                const s = PALETTE[c.paletteIdx] || PALETTE[1];
                return (
                  <div
                    key={c.id}
                    className="badge"
                    style={{
                      color: s.text,
                      background: s.color,
                      borderColor: s.border,
                    }}
                  >
                    {c.conc ? `${c.group || c.label} ${c.conc}` : c.label}:{" "}
                    {counts[c.id]}
                  </div>
                );
              })}
          </div>
        </div>

        {/* Right: config */}
        <div
          style={{
            flex: "0 0 320px",
            display: "flex",
            flexDirection: "column",
            gap: "18px",
          }}
        >
          <div>
            <div className="sec">File Paths</div>
            <div style={{ marginBottom: "6px" }}>
              <div
                style={{
                  fontSize: "10px",
                  color: "#6e7681",
                  marginBottom: "2px",
                }}
              >
                Input CSV
              </div>
              <input
                type="text"
                value={csvFile}
                onChange={(e) => setCsvFile(e.target.value)}
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: "10px",
                  color: "#6e7681",
                  marginBottom: "2px",
                }}
              >
                Output Excel
              </div>
              <input
                type="text"
                value={outputFile}
                onChange={(e) => setOutputFile(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="sec">Statistical Test</div>
            <select
              value={statTest}
              onChange={(e) => setStatTest(e.target.value)}
            >
              <option value="anova">One-way ANOVA + Tukey</option>
              <option value="ttest">Pairwise t-tests (BH)</option>
            </select>
          </div>

          {/* Fixed controls */}
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <div className="sec" style={{ margin: 0 }}>
                Fixed Controls
              </div>
              <button
                className="btn-g"
                style={{ fontSize: "9px", padding: "3px 8px" }}
                onClick={addFixed}
              >
                + Add
              </button>
            </div>
            {fixed.map((f) => {
              const s = PALETTE[f.paletteIdx] || PALETTE[10];
              return (
                <div
                  key={f.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    marginBottom: "5px",
                  }}
                >
                  <div
                    style={{
                      width: "9px",
                      height: "9px",
                      borderRadius: "50%",
                      background: s.color,
                      border: `2px solid ${s.border}`,
                      flexShrink: 0,
                    }}
                  />
                  <input
                    type="text"
                    value={f.label}
                    onChange={(e) => updateFixed(f.id, "label", e.target.value)}
                    style={{ flex: 2 }}
                  />
                  <input
                    type="text"
                    value={f.conc}
                    onChange={(e) => updateFixed(f.id, "conc", e.target.value)}
                    style={{ flex: 1 }}
                    placeholder="conc"
                  />
                  <input
                    type="text"
                    value={f.unit}
                    onChange={(e) => updateFixed(f.id, "unit", e.target.value)}
                    style={{ flex: 1 }}
                    placeholder="unit"
                  />
                  {f.id === "medium" ? (
                    <span
                      style={{ fontSize: "11px", flexShrink: 0 }}
                      title="Required for background subtraction"
                    >
                      🔒
                    </span>
                  ) : (
                    <button
                      className="del-btn"
                      onClick={() => removeFixed(f.id)}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Sample groups */}
          <div>
            <div className="sec">Sample Groups</div>

            {/* Quick-add */}
            <div className="quick-add">
              <div
                style={{
                  fontSize: "10px",
                  color: "#2abf2a",
                  marginBottom: "8px",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                }}
              >
                + NEW SAMPLE GROUP
              </div>

              {/* Group name + unit (always visible) */}
              <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                <div style={{ flex: 3 }}>
                  <div
                    style={{
                      fontSize: "9px",
                      color: "#6e7681",
                      marginBottom: "2px",
                    }}
                  >
                    Group name
                  </div>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Lipo OVA-mRNA"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addGroup();
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: "9px",
                      color: "#6e7681",
                      marginBottom: "2px",
                    }}
                  >
                    Unit
                  </div>
                  <input
                    type="text"
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    placeholder="ug/mL"
                  />
                </div>
              </div>

              {/* Mode tabs */}
              <div
                style={{
                  display: "flex",
                  gap: "0",
                  marginBottom: "8px",
                  border: "1px solid #1a4a1a",
                  borderRadius: "4px",
                  overflow: "hidden",
                }}
              >
                {[
                  ["paste", "Paste concs"],
                  ["dilution", "Dilution series"],
                ].map(([m, lbl]) => (
                  <button
                    key={m}
                    onClick={() => setAddMode(m)}
                    style={{
                      flex: 1,
                      padding: "4px 0",
                      fontSize: "9px",
                      fontWeight: 600,
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "'IBM Plex Mono',monospace",
                      letterSpacing: "0.05em",
                      background: addMode === m ? "#1a4a1a" : "transparent",
                      color: addMode === m ? "#2abf2a" : "#4a7a4a",
                      borderRight: m === "paste" ? "1px solid #1a4a1a" : "none",
                    }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              {/* Paste mode */}
              {addMode === "paste" && (
                <div style={{ marginBottom: "8px" }}>
                  <div
                    style={{
                      fontSize: "9px",
                      color: "#6e7681",
                      marginBottom: "2px",
                    }}
                  >
                    Concentrations (comma-separated)
                  </div>
                  <input
                    type="text"
                    value={newConcs}
                    onChange={(e) => setNewConcs(e.target.value)}
                    placeholder="1.00, 0.67, 0.44, 0.20"
                  />
                  <div
                    style={{
                      marginTop: "5px",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "3px",
                    }}
                  >
                    {newConcs
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .map((c, i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: "9px",
                            background: "#0d2a0d",
                            border: "1px solid #1a4a1a",
                            color: "#2abf2a",
                            borderRadius: "3px",
                            padding: "1px 5px",
                          }}
                        >
                          {c} {newUnit}
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {/* Dilution series mode */}
              {addMode === "dilution" && (
                <div style={{ marginBottom: "8px" }}>
                  <div
                    style={{ display: "flex", gap: "6px", marginBottom: "6px" }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: "9px",
                          color: "#6e7681",
                          marginBottom: "2px",
                        }}
                      >
                        Start conc
                      </div>
                      <input
                        type="text"
                        value={dilStart}
                        onChange={(e) => setDilStart(e.target.value)}
                        placeholder="1.00"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: "9px",
                          color: "#6e7681",
                          marginBottom: "2px",
                        }}
                      >
                        Dilution factor
                      </div>
                      <input
                        type="text"
                        value={dilFactor}
                        onChange={(e) => setDilFactor(e.target.value)}
                        placeholder="2"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: "9px",
                          color: "#6e7681",
                          marginBottom: "2px",
                        }}
                      >
                        Steps
                      </div>
                      <input
                        type="text"
                        value={dilSteps}
                        onChange={(e) => setDilSteps(e.target.value)}
                        placeholder="4"
                      />
                    </div>
                  </div>
                  {/* Live preview */}
                  <div
                    style={{
                      fontSize: "9px",
                      color: "#6e7681",
                      marginBottom: "3px",
                    }}
                  >
                    Preview:
                  </div>
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}
                  >
                    {dilutionConcs().length > 0 ? (
                      dilutionConcs().map((c, i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: "9px",
                            background: "#0d2a0d",
                            border: "1px solid #1a4a1a",
                            color: "#2abf2a",
                            borderRadius: "3px",
                            padding: "1px 5px",
                          }}
                        >
                          {c} {newUnit}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: "9px", color: "#555" }}>
                        — enter valid values above
                      </span>
                    )}
                  </div>
                </div>
              )}

              <button
                className="btn-p"
                style={{ width: "100%", fontSize: "11px" }}
                onClick={addGroup}
              >
                Add group →
              </button>
            </div>

            {/* Existing groups */}
            {groups.map((g) => {
              const s = PALETTE[g.paletteIdx] || PALETTE[1];
              return (
                <div key={g.id} className="group-card">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "8px",
                    }}
                  >
                    <div
                      style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: s.color,
                        border: `2px solid ${s.border}`,
                        flexShrink: 0,
                      }}
                    />
                    <input
                      type="text"
                      value={g.name}
                      onChange={(e) =>
                        updateGroup(g.id, "name", e.target.value)
                      }
                      style={{ flex: 1, fontWeight: 600 }}
                    />
                    <button
                      className="del-btn"
                      onClick={() => removeGroup(g.id)}
                    >
                      ×
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <div style={{ flex: 3 }}>
                      <div
                        style={{
                          fontSize: "9px",
                          color: "#6e7681",
                          marginBottom: "2px",
                        }}
                      >
                        Concentrations
                      </div>
                      <input
                        type="text"
                        value={g.concs.join(", ")}
                        onChange={(e) => updateGroupConcs(g.id, e.target.value)}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: "9px",
                          color: "#6e7681",
                          marginBottom: "2px",
                        }}
                      >
                        Unit
                      </div>
                      <input
                        type="text"
                        value={g.unit}
                        onChange={(e) =>
                          updateGroup(g.id, "unit", e.target.value)
                        }
                      />
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "4px",
                      marginTop: "7px",
                    }}
                  >
                    {g.concs.map((c, i) => (
                      <div
                        key={i}
                        className="badge"
                        style={{
                          color: s.text,
                          background: s.color,
                          borderColor: s.border,
                        }}
                      >
                        {c} {g.unit}
                        {counts[`${g.id}_${i}`] > 0 && (
                          <span style={{ marginLeft: "4px", opacity: 0.6 }}>
                            ×{counts[`${g.id}_${i}`]}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <button className="btn-p" onClick={() => setShowCode(true)}>
            Generate R Script ↓
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
            <div className="sec" style={{ margin: 0 }}>
              Generated R Script
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="btn-p" onClick={copyCode}>
                {copied ? "✓ Copied!" : "Copy to Clipboard"}
              </button>
              <button className="btn-g" onClick={() => setShowCode(false)}>
                Hide
              </button>
            </div>
          </div>
          <div className="code-block">{code}</div>
          <p style={{ fontSize: "11px", color: "#6e7681", marginTop: "10px" }}>
            Fully self-contained — paste into a new RStudio file and run
            directly.
          </p>
        </div>
      )}
    </div>
  );
}
