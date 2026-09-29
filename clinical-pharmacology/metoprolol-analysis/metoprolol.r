###############################################################################
## Deriving QTcB from QTcF using the two correction formulas
##
## QTcF = QT / RR^(1/3)   -->  QT = QTcF * RR^(1/3)
## QTcB = QT / RR^(1/2)
##
## Substituting:
##   QTcB = QTcF * RR^(1/3) / RR^(1/2) = QTcF * RR^(1/3 - 1/2) = QTcF / RR^(1/6)
##
## RR (in seconds) is not itself in the dataset, but heart rate (HRsup) is,
## and RR = 60 / HR. So for each subject/TAD/treatment:
##
##   QTcB = QTcF / (60 / HR)^(1/6)
###############################################################################

library(dplyr)
library(tidyr)

## ---- 1. Load the data --------------------------------------------------
load("AnalysisSet.Rdata")   # creates the object combined_PKPD

## ---- 2. Pull QTcF and HR side by side, matched on subject/treatment/TAD --
qtcf_df <- combined_PKPD %>%
  filter(Parameter == "QTcF") %>%
  select(SubjectNr, TRT, TAD, MatchPKPD, QTcF_val = Value, QTcF_CFB = CFB)

hr_df <- combined_PKPD %>%
  filter(Parameter == "HRsup") %>%
  select(SubjectNr, TRT, TAD, HR_val = Value)

qtc_derived <- qtcf_df %>%
  inner_join(hr_df, by = c("SubjectNr", "TRT", "TAD")) %>%
  mutate(
    RR_sec   = 60 / HR_val,
    QTcB_val = QTcF_val / (RR_sec^(1/6))
  )

## ---- 3. Reconstruct baseline for QTcB so CFB can be computed the same way --
## CFB in the original data is (value - baseline). We derive QTcB's own
## baseline the same way QTcF's baseline was derived, then compute its CFB.
baseline_HR <- hr_df %>%
  group_by(SubjectNr, TRT) %>%
  filter(TAD == min(TAD)) %>%
  summarise(HR_baseline = mean(HR_val), .groups = "drop")

baseline_QTcF <- qtcf_df %>%
  mutate(QTcF_baseline_val = QTcF_val - QTcF_CFB) %>%
  group_by(SubjectNr, TRT) %>%
  filter(TAD == min(TAD)) %>%
  summarise(QTcF_baseline = mean(QTcF_baseline_val), .groups = "drop")

qtc_derived <- qtc_derived %>%
  left_join(baseline_HR, by = c("SubjectNr", "TRT")) %>%
  left_join(baseline_QTcF, by = c("SubjectNr", "TRT")) %>%
  mutate(
    RR_baseline    = 60 / HR_baseline,
    QTcB_baseline  = QTcF_baseline / (RR_baseline^(1/6)),
    QTcB_CFB       = QTcB_val - QTcB_baseline
  )

## ---- 4. Paired t-test, same structure as before, for QTcB -----------------
run_paired_test <- function(df, value_col) {
  df_subject <- df %>%
    group_by(SubjectNr, TRT) %>%
    summarise(meanCFB = mean(.data[[value_col]]), .groups = "drop")
  
  df_wide <- df_subject %>%
    pivot_wider(names_from = TRT, values_from = meanCFB) %>%
    filter(!is.na(Active), !is.na(Placebo))
  
  test_result <- t.test(df_wide$Active, df_wide$Placebo, paired = TRUE)
  
  list(n = nrow(df_wide),
       mean_diff = mean(df_wide$Active - df_wide$Placebo),
       p_value = test_result$p.value,
       ci = test_result$conf.int,
       wide = df_wide)
}

res_QTcF <- run_paired_test(qtc_derived %>% rename(val = QTcF_CFB), "val")
res_QTcB <- run_paired_test(qtc_derived %>% rename(val = QTcB_CFB), "val")

cat("QTcF: mean diff =", round(res_QTcF$mean_diff, 2), "ms, p =", signif(res_QTcF$p_value, 3), "\n")
cat("QTcB: mean diff =", round(res_QTcB$mean_diff, 2), "ms, p =", signif(res_QTcB$p_value, 3), "\n")

## ---- 5. TAD course of the difference between corrections -----------------
## This shows whether the two methods diverge more at certain TAD points --
## i.e. where heart rate change from baseline is largest.
TAD_course <- qtc_derived %>%
  group_by(TRT, TAD) %>%
  summarise(
    meanQTcF_CFB = mean(QTcF_CFB, na.rm = TRUE),
    meanQTcB_CFB = mean(QTcB_CFB, na.rm = TRUE),
    meanHR       = mean(HR_val, na.rm = TRUE),
    .groups = "drop"
  ) %>%
  arrange(TRT, TAD)

print(TAD_course)

## ---- 6. Plot: QTcF vs QTcB change over TAD, by treatment ------------------
plot(TAD_course$TAD[TAD_course$TRT == "Active"],
     TAD_course$meanQTcF_CFB[TAD_course$TRT == "Active"],
     type = "b", col = "#0072B2", pch = 16,
     ylim = range(c(TAD_course$meanQTcF_CFB, TAD_course$meanQTcB_CFB), na.rm = TRUE),
     xlab = "TAD (h)", ylab = "Mean QTc change from baseline (ms)",
     main = "QTcF vs QTcB over TAD (Active treatment)")
lines(TAD_course$TAD[TAD_course$TRT == "Active"],
      TAD_course$meanQTcB_CFB[TAD_course$TRT == "Active"],
      type = "b", col = "#CC3311", pch = 17)
legend("topright", legend = c("QTcF", "QTcB"), col = c("#0072B2", "#CC3311"), pch = c(16, 17))