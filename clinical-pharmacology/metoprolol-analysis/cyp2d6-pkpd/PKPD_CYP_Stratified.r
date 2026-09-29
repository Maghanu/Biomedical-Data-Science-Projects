###############################################################################
## CYP2D6-stratified PK/PD analysis of combined_PKPD
##
## Design       : crossover, Active vs Placebo (subject 1003: Active only)
## Subjects     : 19 (Extensive 11, Intermediate 7, Slow 1)
## PD endpoints : PR_int, QRS, QTcF, SystBPsup, DiastBPsup, HRsup, Respir_rate
## PK           : plasma concentration matched to each PD timepoint
##
## NOTE ON POWER: the Slow phenotype is represented by a single subject. The
## three-level phenotype term is descriptive only. The primary inferential
## contrast is Extensive vs Reduced (Intermediate + Slow).
###############################################################################

## ---- 0. Setup --------------------------------------------------------------
pkgs <- c("dplyr", "tidyr", "ggplot2", "lme4", "lmerTest", "emmeans", "knitr")
for (p in pkgs) if (!requireNamespace(p, quietly = TRUE)) install.packages(p)
invisible(lapply(pkgs, library, character.only = TRUE))

theme_set(theme_bw(base_size = 11))
options(contrasts = c("contr.treatment", "contr.poly"))

DATA_PATH <- "AnalysisSet.Rdata"   # <- adjust if needed
OUT_DIR   <- "output"
dir.create(OUT_DIR, showWarnings = FALSE)

## ---- 1. Load and prepare ---------------------------------------------------
load(DATA_PATH)                     # loads combined_PKPD
dat <- combined_PKPD

dat <- dat %>%
  mutate(
    SubjectNr = factor(SubjectNr),
    TRT       = factor(TRT, levels = c("Placebo", "Active")),
    CYP2D6    = factor(CYP2D6, levels = c("Extensive", "Intermediate", "Slow")),
    # collapsed phenotype: primary grouping given n(Slow) = 1
    CYPgrp    = factor(ifelse(CYP2D6 == "Extensive", "Extensive", "Reduced"),
                       levels = c("Extensive", "Reduced")),
    SEX       = factor(SEX, labels = c("Male", "Female")),   # verify coding
    Parameter = factor(Parameter),
    TimeNom   = MatchPKPD / 60,      # nominal time after dose (h)
    TimeAct   = TADh,                # actual time after dose (h)
    Postdose  = TimeNom > 0
  )

stopifnot(!anyNA(dat$CFB), !anyNA(dat$Concentration))

## Sanity check: CFB should equal Value - Baseline
with(dat, stopifnot(max(abs(CFB - (Value - Baseline))) < 1e-6))

## ---- 2. Subject-level demographics by phenotype ----------------------------
subj <- dat %>%
  distinct(SubjectNr, CYP2D6, CYPgrp, AGE, SEX, HGT, WGT, BMI, RACE)

demo <- subj %>%
  group_by(CYP2D6) %>%
  summarise(
    n        = n(),
    Female   = sum(SEX == "Female"),
    Age      = sprintf("%.1f (%.1f)", mean(AGE), sd(AGE)),
    Weight   = sprintf("%.1f (%.1f)", mean(WGT), sd(WGT)),
    BMI      = sprintf("%.1f (%.1f)", mean(BMI), sd(BMI)),
    .groups  = "drop"
  )
kable(demo, caption = "Baseline characteristics by CYP2D6 phenotype; mean (SD)")
write.csv(demo, file.path(OUT_DIR, "table1_demographics.csv"), row.names = FALSE)

## ---- 3. PK: one record per subject/occasion/timepoint -----------------------
pk <- dat %>%
  filter(TRT == "Active") %>%
  distinct(SubjectNr, CYP2D6, CYPgrp, Day, TimeNom, TimeAct, Concentration) %>%
  arrange(SubjectNr, TimeAct)

## Non-compartmental parameters per subject (linear trapezoidal, 0-6 h)
nca <- pk %>%
  filter(TimeAct >= 0) %>%
  group_by(SubjectNr, CYP2D6, CYPgrp) %>%
  summarise(
    Cmax  = max(Concentration),
    Tmax  = TimeAct[which.max(Concentration)],
    AUC6  = sum(diff(TimeAct) * (head(Concentration, -1) + tail(Concentration, -1)) / 2),
    Clast = tail(Concentration, 1),
    .groups = "drop"
  )

## Terminal slope from log-linear regression on the last 3 declining points
thalf <- pk %>%
  filter(Concentration > 0) %>%
  group_by(SubjectNr) %>%
  arrange(TimeAct, .by_group = TRUE) %>%
  slice_tail(n = 3) %>%
  summarise(
    lambda_z = -coef(lm(log(Concentration) ~ TimeAct))[2],
    t_half   = log(2) / lambda_z,
    .groups  = "drop"
  )
nca <- left_join(nca, thalf, by = "SubjectNr")

nca_summary <- nca %>%
  group_by(CYP2D6) %>%
  summarise(across(c(Cmax, Tmax, AUC6, t_half),
                   list(mean = mean, sd = sd), .names = "{.col}_{.fn}"),
            n = n(), .groups = "drop")
kable(nca_summary, digits = 2, caption = "NCA parameters by CYP2D6 phenotype")
write.csv(nca, file.path(OUT_DIR, "table2_nca_subject.csv"), row.names = FALSE)

## Exposure comparison on the log scale (Extensive vs Reduced)
pk_test <- lapply(c("Cmax", "AUC6", "t_half"), function(v) {
  f  <- reformulate("CYPgrp", response = paste0("log(", v, ")"))
  m  <- lm(f, data = nca)
  ci <- confint(m)[2, ]
  data.frame(Parameter = v,
             GMR       = exp(coef(m)[2]),          # Reduced / Extensive
             LCL       = exp(ci[1]), UCL = exp(ci[2]),
             p         = summary(m)$coefficients[2, 4])
}) %>% bind_rows()
kable(pk_test, digits = 3,
      caption = "Geometric mean ratio, Reduced vs Extensive metabolisers")

## ---- 4. PK profile plot -----------------------------------------------------
pk_prof <- pk %>%
  group_by(CYP2D6, TimeNom) %>%
  summarise(mean = mean(Concentration),
            se   = sd(Concentration) / sqrt(n()),
            n    = n(), .groups = "drop")

p_pk <- ggplot(pk_prof, aes(TimeNom, mean, colour = CYP2D6, group = CYP2D6)) +
  geom_line() + geom_point(size = 1.6) +
  geom_errorbar(aes(ymin = mean - se, ymax = mean + se), width = 0.1) +
  labs(x = "Time after dose (h)", y = "Plasma concentration (ng/mL)",
       colour = "CYP2D6")
ggsave(file.path(OUT_DIR, "fig1_pk_profiles.png"), p_pk, width = 6, height = 4, dpi = 300)

## Individual profiles (useful given the small n)
p_pk_ind <- ggplot(pk, aes(TimeAct, Concentration, group = SubjectNr, colour = CYP2D6)) +
  geom_line(alpha = 0.7) +
  facet_wrap(~ CYP2D6) +
  labs(x = "Time after dose (h)", y = "Plasma concentration (ng/mL)")
ggsave(file.path(OUT_DIR, "fig2_pk_individual.png"), p_pk_ind, width = 8, height = 3.5, dpi = 300)

## ---- 5. PD: change from baseline by phenotype and treatment -----------------
pd <- dat %>% filter(Postdose)

pd_prof <- pd %>%
  group_by(Parameter, Unit, CYP2D6, TRT, TimeNom) %>%
  summarise(mean = mean(CFB), se = sd(CFB) / sqrt(n()), n = n(), .groups = "drop")

p_pd <- ggplot(pd_prof, aes(TimeNom, mean, colour = CYP2D6, linetype = TRT)) +
  geom_hline(yintercept = 0, colour = "grey60") +
  geom_line() + geom_point(size = 1.2) +
  facet_wrap(~ Parameter, scales = "free_y") +
  labs(x = "Time after dose (h)", y = "Change from baseline",
       colour = "CYP2D6", linetype = "Treatment")
ggsave(file.path(OUT_DIR, "fig3_pd_profiles.png"), p_pd, width = 10, height = 6, dpi = 300)

## Placebo-corrected change from baseline, paired within subject
pd_pc <- pd %>%
  select(SubjectNr, CYP2D6, CYPgrp, Parameter, TimeNom, TRT, CFB) %>%
  pivot_wider(names_from = TRT, values_from = CFB,
              values_fn = mean) %>%
  filter(!is.na(Active), !is.na(Placebo)) %>%
  mutate(dCFB = Active - Placebo)

## ---- 6. Mixed-effects models per PD endpoint -------------------------------
## Primary: does the Active-Placebo effect differ between metaboliser groups?
fit_endpoint <- function(par) {
  d <- pd %>% filter(Parameter == par) %>% droplevels()
  m <- lmer(CFB ~ TRT * CYPgrp + factor(TimeNom) + (1 | SubjectNr),
            data = d, REML = TRUE)
  em <- emmeans(m, ~ TRT | CYPgrp)
  ct <- as.data.frame(contrast(em, "revpairwise"))         # Active - Placebo
  ix <- as.data.frame(contrast(emmeans(m, ~ TRT * CYPgrp),
                               interaction = "revpairwise"))  # difference of differences
  list(model = m,
       within = cbind(Parameter = par, ct),
       inter  = cbind(Parameter = par, ix))
}

endpoints <- levels(pd$Parameter)
fits <- lapply(endpoints, fit_endpoint)
names(fits) <- endpoints

trt_effects <- bind_rows(lapply(fits, `[[`, "within"))
interaction_tests <- bind_rows(lapply(fits, `[[`, "inter"))

## Multiplicity control across the 7 endpoints
interaction_tests$p_BH <- p.adjust(interaction_tests$p.value, method = "BH")

kable(trt_effects, digits = 3,
      caption = "Active - Placebo change from baseline, by metaboliser group")
kable(interaction_tests, digits = 3,
      caption = "Treatment x metaboliser-group interaction (BH-adjusted)")
write.csv(trt_effects, file.path(OUT_DIR, "table3_treatment_effects.csv"), row.names = FALSE)
write.csv(interaction_tests, file.path(OUT_DIR, "table4_interaction.csv"), row.names = FALSE)

## Model diagnostics for each endpoint
pdf(file.path(OUT_DIR, "fig4_diagnostics.pdf"), width = 8, height = 4)
for (par in endpoints) {
  m <- fits[[par]]$model
  par(mfrow = c(1, 2))
  plot(fitted(m), resid(m), main = par, xlab = "Fitted", ylab = "Residual"); abline(h = 0)
  qqnorm(resid(m), main = par); qqline(resid(m))
}
dev.off()

## ---- 7. Exposure-response ---------------------------------------------------
## Concentration-effect on Active occasions; slope tested for phenotype dependence
er_fit <- function(par) {
  d <- pd %>% filter(Parameter == par, TRT == "Active") %>% droplevels()
  m <- lmer(CFB ~ Concentration * CYPgrp + (1 | SubjectNr), data = d)
  s <- summary(m)$coefficients
  data.frame(Parameter = par,
             Slope_Extensive = s["Concentration", "Estimate"],
             SE              = s["Concentration", "Std. Error"],
             p_slope         = s["Concentration", "Pr(>|t|)"],
             p_interaction   = s[grep(":", rownames(s))[1], "Pr(>|t|)"])
}
er <- bind_rows(lapply(endpoints, er_fit))
er$p_slope_BH <- p.adjust(er$p_slope, method = "BH")
kable(er, digits = 4, caption = "Concentration-effect slopes (Active occasions)")
write.csv(er, file.path(OUT_DIR, "table5_exposure_response.csv"), row.names = FALSE)

p_er <- ggplot(pd %>% filter(TRT == "Active"),
               aes(Concentration, CFB, colour = CYP2D6)) +
  geom_point(alpha = 0.4, size = 1) +
  geom_smooth(method = "lm", se = TRUE, linewidth = 0.6) +
  facet_wrap(~ Parameter, scales = "free_y") +
  labs(x = "Plasma concentration (ng/mL)", y = "Change from baseline",
       colour = "CYP2D6")
ggsave(file.path(OUT_DIR, "fig5_exposure_response.png"), p_er, width = 10, height = 6, dpi = 300)

## ---- 8. Sensitivity: three-level phenotype (descriptive) -------------------
## Reported without inference; Slow n = 1, so the level is not estimable
## independently of that subject's random intercept.
sens <- pd_pc %>%
  group_by(Parameter, CYP2D6) %>%
  summarise(n_subj = n_distinct(SubjectNr),
            mean_dCFB = mean(dCFB),
            sd_dCFB   = sd(dCFB), .groups = "drop")
kable(sens, digits = 2,
      caption = "Placebo-corrected change from baseline by three-level phenotype (descriptive)")
write.csv(sens, file.path(OUT_DIR, "table6_sensitivity_3level.csv"), row.names = FALSE)

## ---- 9. Session information ------------------------------------------------
writeLines(capture.output(sessionInfo()), file.path(OUT_DIR, "sessionInfo.txt"))