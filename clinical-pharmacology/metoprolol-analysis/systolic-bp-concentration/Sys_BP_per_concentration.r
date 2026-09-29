## Systolic BP (supine) vs plasma concentration -------------------------------
library(dplyr)
library(tidyr)
library(ggplot2)
library(ggrepel)   # install.packages("ggrepel") if not already installed

load("AnalysisSet.Rdata")   # -> combined_PKPD

## 1. Extract SystBPsup and collapse replicate readings (some subject/time
##    combinations have 2-3 recordings, e.g. pre-dose triplicates)
sbp <- combined_PKPD %>%
  filter(Parameter == "SystBPsup") %>%
  group_by(SubjectNr, TRT, MatchPKPD, CYP2D6) %>%
  summarise(across(c(Value, Baseline, CFB, Concentration), mean), .groups = "drop") %>%
  mutate(TimeH = MatchPKPD / 60)

act <- filter(sbp, TRT == "Active")   # needed for p3

## ---------------------------------------------------------------------------
## GRAPH 1: mean systolic BP (active arm only) vs concentration
##   Placebo has Concentration = 0 throughout, so it adds nothing to a
##   concentration axis - dropped. Mean CFB across all active-arm subjects
##   at each nominal timepoint, plotted against mean concentration there.
## ---------------------------------------------------------------------------
act_mean <- sbp %>%
  filter(TRT == "Active") %>%
  group_by(MatchPKPD) %>%
  summarise(n        = n(),
            Conc     = mean(Concentration),
            mean_cfb = mean(CFB),
            se       = sd(CFB) / sqrt(n()), .groups = "drop") %>%
  arrange(MatchPKPD) %>%
  mutate(TimeLabel = ifelse(MatchPKPD < 0, "pre-dose", paste0(MatchPKPD, " min")))

sysBP_mean <- ggplot(act_mean, aes(Conc, mean_cfb)) +
  geom_hline(yintercept = 0, colour = "grey50", linewidth = 0.5) +
  geom_path(arrow = arrow(length = unit(3, "mm"), type = "closed"),
            colour = "#08519c", linewidth = 1) +
  geom_errorbar(aes(ymin = mean_cfb - se, ymax = mean_cfb + se),
                width = 0, colour = "#08519c", linewidth = 0.7) +
  geom_point(colour = "white", fill = "#08519c", shape = 21, stroke = 0.8, size = 3.5) +
  labs(x = "Mean plasma concentration (ng/mL)",
       y = "Mean change from baseline in systolic BP (mmHg)",
       title = "Systolic BP vs drug concentration") +
  theme_minimal(base_size = 15) +
  theme(
    plot.title = element_text(face = "bold", size = 16, hjust = 0.5),
    axis.title = element_text(face = "bold", size = 13),
    panel.grid.minor = element_blank()
  )
sysBP_mean

## ---------------------------------------------------------------------------
## GRAPH 3: one panel per participant
## ---------------------------------------------------------------------------
p3 <- ggplot(act, aes(Concentration, Value)) +
  geom_path(colour = "grey50") +
  geom_point(aes(colour = TimeH), size = 2) +
  scale_colour_viridis_c(name = "Time (h)") +
  facet_wrap(~ SubjectNr, scales = "free_y") +
  labs(x = "Plasma concentration (ng/mL)", y = "Systolic BP, supine (mmHg)",
       title = "Systolic BP vs concentration, per participant (active arm)") +
  theme_bw(base_size = 9)

p1c; p3
