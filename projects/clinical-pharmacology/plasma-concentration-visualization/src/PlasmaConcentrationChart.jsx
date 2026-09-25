import { useState, useMemo, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

// One-compartment, first-order absorption/elimination model with dose superposition.
// Falls back to the ka->ke limiting form (F*D*ke*t*e^-ket/Vd) to avoid the
// near-zero-denominator blowup when absorption and elimination rates coincide.
// skipDoses / doubleDoses are arrays of 1-based dose numbers: a skipped dose is
// omitted entirely (e.g. a missed dose), a doubled dose contributes 2x its
// normal amount (e.g. a "catch-up" double dose). A dose in both lists is
// treated as skipped.
function concentration(t, dose, ka, ke, Vd, F, tau, n, skipDoses = [], doubleDoses = []) {
  let C = 0;
  const skipSet = skipDoses instanceof Set ? skipDoses : new Set(skipDoses);
  const doubleSet = doubleDoses instanceof Set ? doubleDoses : new Set(doubleDoses);
  const closeEnough = Math.abs(ka - ke) < 1e-6;
  for (let i = 0; i < n; i++) {
    const doseNum = i + 1;
    if (skipSet.has(doseNum)) continue;
    const effDose = doubleSet.has(doseNum) ? dose * 2 : dose;
    const tSince = t - i * tau;
    if (tSince < 0) continue;
    if (closeEnough) {
      C += (F * effDose * ke * tSince) / Vd * Math.exp(-ke * tSince);
    } else {
      C += (F * effDose * ka) / (Vd * (ka - ke)) * (Math.exp(-ke * tSince) - Math.exp(-ka * tSince));
    }
  }
  return C;
}

// Time horizon: (n-1) dosing intervals to reach the last dose, then a fixed
// elimination tail (5 half-lives) — independent of tau when n = 1.
function timeHorizon(tau, keHalf, nDoses) {
  return (nDoses - 1) * tau + 5 * keHalf;
}

function drugParams(p) {
  return {
    ka: Math.log(2) / p.kaHalf,
    ke: Math.log(2) / p.keHalf,
    tEnd: timeHorizon(p.tau, p.keHalf, p.nDoses),
  };
}

function steadyStateStats(p, ka, ke) {
  const lastInterval = [];
  const windowLen = p.nDoses > 1 ? p.tau : 5 * p.keHalf;
  for (let i = 0; i <= 50; i++) {
    const t = (p.nDoses - 1) * p.tau + (i / 50) * windowLen;
    lastInterval.push(concentration(t, p.dose, ka, ke, p.Vd, 1, p.tau, p.nDoses, p.skipDoses, p.doubleDoses));
  }
  const cmaxSS = Math.max(...lastInterval);
  const positiveVals = lastInterval.filter((v) => v > 1e-9);
  const cminSS = positiveVals.length ? Math.min(...positiveVals) : 0;
  return { cmaxSS, cminSS };
}

function Slider({ label, value, min, max, step, unit, onChange, accent }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <label style={{ fontSize: 13, color: "#4b5563", display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 600, color: "#111827" }}>{value}{unit}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: accent || "#2563eb" }}
      />
    </div>
  );
}

function DoseChipPicker({ label, nDoses, selected, onChange, accent, activeColor }) {
  const toggle = (doseNum) => {
    const next = selected.includes(doseNum)
      ? selected.filter((d) => d !== doseNum)
      : [...selected, doseNum].sort((a, b) => a - b);
    onChange(next);
  };
  return (
    <div style={{ marginBottom: 4, gridColumn: "1 / -1" }}>
      <label style={{ fontSize: 13, color: "#4b5563", display: "block", marginBottom: 6 }}>
        {label}
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {Array.from({ length: nDoses }, (_, i) => i + 1).map((n) => {
          const active = selected.includes(n);
          return (
            <button
              key={n}
              type="button"
              onClick={() => toggle(n)}
              style={{
                fontSize: 12, minWidth: 26, padding: "3px 6px", borderRadius: 6,
                border: `1px solid ${active ? activeColor : "#d1d5db"}`,
                background: active ? activeColor : "#fff",
                color: active ? "#fff" : "#374151",
                cursor: "pointer", lineHeight: 1.4,
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DrugPanel({ title, accent, p, setP, disabled }) {
  const set = (key) => (val) => setP((prev) => ({ ...prev, [key]: val }));

  // A dose can't be both skipped and doubled — whichever list changes wins,
  // clearing that dose number out of the other list.
  const setSkipDoses = (next) =>
    setP((prev) => ({ ...prev, skipDoses: next, doubleDoses: prev.doubleDoses.filter((d) => !next.includes(d)) }));
  const setDoubleDoses = (next) =>
    setP((prev) => ({ ...prev, doubleDoses: next, skipDoses: prev.skipDoses.filter((d) => !next.includes(d)) }));

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        {!disabled && (
          <input
            type="checkbox"
            checked={p.enabled}
            onChange={(e) => setP((prev) => ({ ...prev, enabled: e.target.checked }))}
            style={{ accentColor: accent }}
          />
        )}
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: accent, display: "inline-block" }} />
        <h3 style={{ fontSize: 13, fontWeight: 600, color: "#111827", margin: 0, textTransform: "none" }}>{title}</h3>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 24, rowGap: 16, opacity: !disabled && !p.enabled ? 0.4 : 1 }}>
        <Slider label="Dose" value={p.dose} min={0.05} max={500} step={0.05} unit=" mg" onChange={set("dose")} accent={accent} />
        <Slider label="Dosing interval τ" value={p.tau} min={1} max={48} step={1} unit=" h" onChange={set("tau")} accent={accent} />
        <Slider label="Absorption t½" value={p.kaHalf} min={0.2} max={4} step={0.1} unit=" h" onChange={set("kaHalf")} accent={accent} />
        <Slider label="Elimination t½" value={p.keHalf} min={1} max={48} step={1} unit=" h" onChange={set("keHalf")} accent={accent} />
        <Slider label="Volume of distribution" value={p.Vd} min={4} max={500} step={1} unit=" L" onChange={set("Vd")} accent={accent} />
        <Slider
          label="Number of doses" value={p.nDoses} min={1} max={14} step={1} unit=""
          onChange={(v) => setP((prev) => ({
            ...prev, nDoses: v,
            skipDoses: prev.skipDoses.filter((d) => d <= v),
            doubleDoses: prev.doubleDoses.filter((d) => d <= v),
          }))}
          accent={accent}
        />
        {!disabled && (
          <>
            <DoseChipPicker label="Skip doses (missed)" nDoses={p.nDoses} selected={p.skipDoses} onChange={setSkipDoses} activeColor="#6b7280" />
            <DoseChipPicker label="Double doses (catch-up)" nDoses={p.nDoses} selected={p.doubleDoses} onChange={setDoubleDoses} activeColor={accent} />
          </>
        )}
      </div>
    </div>
  );
}

const DRUG1_COLOR = "#2563eb";
const DRUG2_COLOR = "#dc2626";

export default function PlasmaConcentrationChart() {
  const [drug1, setDrug1] = useState({
    dose: 100, tau: 12, kaHalf: 0.7, keHalf: 7, Vd: 50, nDoses: 6, skipDoses: [], doubleDoses: [],
  });
  const [drug2, setDrug2] = useState({
    dose: 100, tau: 12, kaHalf: 0.7, keHalf: 7, Vd: 50, nDoses: 6, skipDoses: [], doubleDoses: [], enabled: true,
  });

  const F = 1;

  const initialBounds = useMemo(() => {
    const { ka, ke, tEnd } = drugParams(drug1);
    let yMax = 0;
    for (let i = 0; i <= 100; i++) {
      const t = (i / 100) * tEnd;
      const c = concentration(t, drug1.dose, ka, ke, drug1.Vd, F, drug1.tau, drug1.nDoses, drug1.skipDoses, drug1.doubleDoses);
      if (c > yMax) yMax = c;
    }
    return { xMax: tEnd, yMax: yMax * 1.15 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [axisBounds, setAxisBounds] = useState(initialBounds);
  const axisBoundsRef = useRef(axisBounds);
  axisBoundsRef.current = axisBounds;
  const animRef = useRef(null);

  const { data, stats1, stats2 } = useMemo(() => {
    const d1 = drugParams(drug1);
    const d2 = drugParams(drug2);
    const tEnd = drug2.enabled ? Math.max(d1.tEnd, d2.tEnd) : d1.tEnd;
    const steps = 200;
    const dt = tEnd / steps;

    const data = [];
    for (let i = 0; i <= steps; i++) {
      const t = i * dt;
      const point = {
        time: Number(t.toFixed(2)),
        concentration: concentration(t, drug1.dose, d1.ka, d1.ke, drug1.Vd, F, drug1.tau, drug1.nDoses, drug1.skipDoses, drug1.doubleDoses),
      };
      if (drug2.enabled) {
        point.concentration2 = concentration(t, drug2.dose, d2.ka, d2.ke, drug2.Vd, F, drug2.tau, drug2.nDoses, drug2.skipDoses, drug2.doubleDoses);
      }
      data.push(point);
    }

    const stats1 = steadyStateStats(drug1, d1.ka, d1.ke);
    const stats2 = drug2.enabled ? steadyStateStats(drug2, d2.ka, d2.ke) : null;

    return { data, stats1, stats2 };
  }, [drug1, drug2]);

  // Smoothly animate the axis toward whatever the current curves need —
  // grows when a line would be clipped, shrinks when it's dwarfed by a
  // stale, too-large frame. Small changes are ignored so it doesn't
  // constantly micro-adjust on every tiny slider nudge.
  useEffect(() => {
    const neededX = data.length ? data[data.length - 1].time : 0;
    const neededY = data.reduce(
      (m, d) => Math.max(m, d.concentration, d.concentration2 || 0), 0
    );

    const current = axisBoundsRef.current;
    const targetX = Math.max(neededX * 1.02, 1);
    const targetY = Math.max(neededY * 1.15, 0.1);

    const xChanged = Math.abs(targetX - current.xMax) > Math.max(current.xMax, targetX) * 0.08;
    const yChanged = Math.abs(targetY - current.yMax) > Math.max(current.yMax, targetY) * 0.08;

    if (xChanged || yChanged) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      const startX = current.xMax;
      const startY = current.yMax;
      const duration = 450;
      const startTime = performance.now();

      const step = (now) => {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setAxisBounds({
          xMax: startX + (targetX - startX) * eased,
          yMax: startY + (targetY - startY) * eased,
        });
        if (progress < 1) {
          animRef.current = requestAnimationFrame(step);
        }
      };
      animRef.current = requestAnimationFrame(step);
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const resetAxis = () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const d1 = drugParams(drug1);
    const d2 = drugParams(drug2);
    const tEnd = drug2.enabled ? Math.max(d1.tEnd, d2.tEnd) : d1.tEnd;
    let yMax = 0;
    for (let i = 0; i <= 100; i++) {
      const t = (i / 100) * tEnd;
      const c1 = concentration(t, drug1.dose, d1.ka, d1.ke, drug1.Vd, F, drug1.tau, drug1.nDoses, drug1.skipDoses, drug1.doubleDoses);
      const c2 = drug2.enabled ? concentration(t, drug2.dose, d2.ka, d2.ke, drug2.Vd, F, drug2.tau, drug2.nDoses, drug2.skipDoses, drug2.doubleDoses) : 0;
      yMax = Math.max(yMax, c1, c2);
    }
    setAxisBounds({ xMax: tEnd, yMax: yMax * 1.15 });
  };

  return (
    <div style={{
      width: "100%", maxWidth: 640, margin: "0 auto", padding: 24,
      background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb",
      boxShadow: "0 1px 2px rgba(0,0,0,0.05)", boxSizing: "border-box", fontFamily: "sans-serif"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "#111827", margin: 0 }}>
          Multidose plasma concentration
        </h2>
        <button
          onClick={resetAxis}
          style={{
            fontSize: 12, color: "#2563eb", background: "none", border: "none",
            cursor: "pointer", padding: 0, textDecoration: "underline"
          }}
        >
          Reset axis to current data
        </button>
      </div>

      <DrugPanel title="Drug 1" accent={DRUG1_COLOR} p={drug1} setP={setDrug1} disabled />
      <DrugPanel title="Drug 2" accent={DRUG2_COLOR} p={drug2} setP={setDrug2} />

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 120, background: "#eff6ff", borderRadius: 8, padding: "10px 16px" }}>
          <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>Drug 1 peak (C<sub>max,ss</sub>)</p>
          <p style={{ fontSize: 18, fontWeight: 600, color: "#111827", margin: 0 }}>{stats1.cmaxSS.toFixed(2)} mg/L</p>
        </div>
        <div style={{ flex: 1, minWidth: 120, background: "#eff6ff", borderRadius: 8, padding: "10px 16px" }}>
          <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>Drug 1 trough (C<sub>min,ss</sub>)</p>
          <p style={{ fontSize: 18, fontWeight: 600, color: "#111827", margin: 0 }}>{stats1.cminSS.toFixed(2)} mg/L</p>
        </div>
        {stats2 && (
          <>
            <div style={{ flex: 1, minWidth: 120, background: "#fef2f2", borderRadius: 8, padding: "10px 16px" }}>
              <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>Drug 2 peak (C<sub>max,ss</sub>)</p>
              <p style={{ fontSize: 18, fontWeight: 600, color: "#111827", margin: 0 }}>{stats2.cmaxSS.toFixed(2)} mg/L</p>
            </div>
            <div style={{ flex: 1, minWidth: 120, background: "#fef2f2", borderRadius: 8, padding: "10px 16px" }}>
              <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>Drug 2 trough (C<sub>min,ss</sub>)</p>
              <p style={{ fontSize: 18, fontWeight: 600, color: "#111827", margin: 0 }}>{stats2.cminSS.toFixed(2)} mg/L</p>
            </div>
          </>
        )}
      </div>

      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 12, bottom: 24, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="time"
              type="number"
              domain={[0, axisBounds.xMax]}
              allowDataOverflow
              tickFormatter={(v) => v.toFixed(1)}
              tick={{ fontSize: 12 }}
              label={{ value: "Time (h)", position: "insideBottom", offset: -14, fontSize: 12 }}
            />
            <YAxis
              domain={[0, axisBounds.yMax]}
              allowDataOverflow
              tickFormatter={(v) => v.toFixed(1)}
              tick={{ fontSize: 12 }}
              label={{ value: "Conc. (mg/L)", angle: -90, position: "insideLeft", fontSize: 12 }}
            />
            <Tooltip formatter={(v) => v.toFixed(2)} labelFormatter={(t) => `t = ${t} h`} />
            <Legend verticalAlign="top" align="right" height={28} wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="concentration" name="Drug 1" stroke={DRUG1_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} />
            {drug2.enabled && (
              <Line type="monotone" dataKey="concentration2" name="Drug 2" stroke={DRUG2_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{
        marginTop: 24, paddingTop: 20, borderTop: "1px solid #e5e7eb",
        fontSize: 13, lineHeight: 1.6, color: "#374151"
      }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: "#111827", margin: "0 0 8px 0" }}>
          Casus: a missed and then doubled digoxin dose
        </h3>
        <p style={{ margin: "0 0 10px 0" }}>
          A patient starts on digoxin and forgets their dose one
          morning. That evening they take a double dose to "catch up," then resume their
          normal schedule the next day.
        </p>
        <p style={{ margin: 0 }}>
          <strong>What would you advise this patient to do instead, and what should they be
          monitored for?</strong> Use the "Skip doses" and "Double doses" controls above on
          Drug 2 to reproduce this scenario and see what happens to the peak and trough
          concentrations.
        </p>
      </div>
    </div>
  );
}