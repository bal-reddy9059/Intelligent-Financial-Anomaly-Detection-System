import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const BRAND = "AegisAI";
const BRAND_COLOR = [59, 130, 246]; // blue-500
const HIGH_COLOR = [239, 68, 68];   // red-500
const MED_COLOR  = [245, 158, 11];  // amber-500
const LOW_COLOR  = [16, 185, 129];  // green-500
const DARK_BG    = [17, 24, 39];    // gray-900

function riskColor(risk) {
  if (risk === "HIGH") return HIGH_COLOR;
  if (risk === "MEDIUM") return MED_COLOR;
  return LOW_COLOR;
}

function addHeader(doc, subtitle) {
  doc.setFillColor(...DARK_BG);
  doc.rect(0, 0, 210, 28, "F");
  doc.setFillColor(...BRAND_COLOR);
  doc.rect(0, 0, 6, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(BRAND, 14, 12);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(156, 163, 175);
  doc.text("Fraud Detection Report", 14, 19);
  doc.setFontSize(7);
  doc.text(subtitle, 14, 25);
  doc.setTextColor(156, 163, 175);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 150, 25, { align: "right" });
}

function addFooter(doc) {
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFillColor(243, 244, 246);
    doc.rect(0, 285, 210, 15, "F");
    doc.setFontSize(7);
    doc.setTextColor(107, 114, 128);
    doc.text(`${BRAND} · AI-Powered Fraud Detection Platform`, 14, 292);
    doc.text(`Page ${i} of ${total}`, 196, 292, { align: "right" });
  }
}

function verdictBanner(doc, y, risk, fraudProbability) {
  const color = riskColor(risk);
  doc.setFillColor(color[0], color[1], color[2], 0.15);
  doc.setDrawColor(...color);
  doc.roundedRect(14, y, 182, 18, 2, 2, "FD");
  doc.setTextColor(...color);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  const label = risk === "HIGH" ? "HIGH RISK — FRAUD DETECTED"
    : risk === "MEDIUM" ? "MEDIUM RISK — Review Recommended"
    : "LOW RISK — Transaction Appears Legitimate";
  doc.text(label, 20, y + 8);
  doc.setFontSize(10);
  doc.text(`Fraud Probability: ${fraudProbability}%`, 20, y + 15);
  return y + 24;
}

// ── Feature 1: Single Transaction Report ────────────────────────────────────
export function generateSingleTransactionReport(result, timestamp) {
  if (!result) return;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  addHeader(doc, "Single Transaction Analysis");

  let y = 34;

  // Verdict banner
  y = verdictBanner(doc, y, result.risk_level ?? "LOW", result.fraud_probability ?? 0);

  // Stats grid
  const stats = [
    ["Ensemble Confidence", result.ensemble_confidence != null ? `${result.ensemble_confidence}%` : "—"],
    ["Suspicious Features", result.suspicious_feature_count ?? "—"],
    ["Models Agreed", result.models_agreed === false ? "No" : "Yes"],
    ["Processing Time", result.processing_time_ms != null ? `${result.processing_time_ms}ms` : "—"],
    ["Checked At", timestamp ? new Date(timestamp).toLocaleTimeString() : "—"],
    ["Recommended Action", (result.recommended_action ?? "").split(" ")[0] || "—"],
  ];

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(55, 65, 81);
  doc.text("ANALYSIS SUMMARY", 14, y + 4);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["Metric", "Value"]],
    body: stats,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: BRAND_COLOR, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 60 }, 1: { cellWidth: 60 } },
    margin: { left: 14, right: 14 },
    tableWidth: 100,
  });

  y = doc.lastAutoTable.finalY + 6;

  // Recommended Action detail
  if (result.recommended_action) {
    doc.setFillColor(249, 250, 251);
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(14, y, 182, 14, 2, 2, "FD");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(55, 65, 81);
    doc.text("Recommended Action:", 18, y + 6);
    doc.setFont("helvetica", "normal");
    doc.text(result.recommended_action, 60, y + 6);
    y += 20;
  }

  // AI Insight
  if (result.ai_insight) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(55, 65, 81);
    doc.text("AI INSIGHT", 14, y + 4);
    y += 8;
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(147, 197, 253);
    const lines = doc.splitTextToSize(result.ai_insight, 174);
    const boxH = lines.length * 5 + 8;
    doc.roundedRect(14, y, 182, boxH, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(30, 64, 175);
    doc.text(lines, 18, y + 6);
    y += boxH + 6;
  }

  // Per-model results
  if (result.results && Object.keys(result.results).length > 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(55, 65, 81);
    doc.text("MODEL VERDICTS", 14, y + 4);
    y += 8;

    const modelRows = Object.entries(result.results).map(([name, r]) => [
      name,
      r.verdict ?? "—",
      r.probability != null ? `${r.probability}%` : "—",
      r.score != null ? String(r.score) : "—",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Model", "Verdict", "Fraud Prob.", "Anomaly Score"]],
      body: modelRows,
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [75, 85, 99], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      didDrawCell: (data) => {
        if (data.section === "body" && data.column.index === 1) {
          const val = data.cell.raw;
          if (val === "FRAUD") {
            doc.setTextColor(...HIGH_COLOR);
          } else if (val === "LEGITIMATE" || val === "SAFE") {
            doc.setTextColor(...LOW_COLOR);
          }
        }
      },
      margin: { left: 14, right: 14 },
    });

    y = doc.lastAutoTable.finalY + 6;
  }

  // Feature Risk Analysis
  if (result.feature_analysis?.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(55, 65, 81);
    doc.text("FEATURE RISK ANALYSIS", 14, y + 4);
    y += 8;

    const featRows = result.feature_analysis.map((f) => [
      f.feature ?? "",
      String(f.value ?? ""),
      String(f.dataset_mean ?? ""),
      f.z_score != null ? `${f.z_score}σ` : "—",
      f.percentile != null ? `p${f.percentile}` : "—",
      f.suspicious ? "YES" : "no",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Feature", "Value", "Mean", "Z-Score", "Percentile", "Suspicious"]],
      body: featRows,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: BRAND_COLOR, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 22, halign: "right" },
        2: { cellWidth: 22, halign: "right" },
        3: { cellWidth: 20, halign: "center" },
        4: { cellWidth: 20, halign: "center" },
        5: { cellWidth: 22, halign: "center" },
      },
      didDrawCell: (data) => {
        if (data.section === "body" && data.column.index === 5 && data.cell.raw === "YES") {
          doc.setTextColor(...HIGH_COLOR);
        }
      },
      margin: { left: 14, right: 14 },
    });
  }

  addFooter(doc);
  doc.save(`fraud_report_single_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ── Feature 1b: Batch Report ─────────────────────────────────────────────────
export function generateBatchReport(results) {
  if (!results) return;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  addHeader(doc, "Batch Transaction Analysis");

  let y = 34;

  // Summary cards
  const summary = results.summary ?? {};
  const fraudRate = results.fraud_rate_percent ?? 0;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(55, 65, 81);
  doc.text("BATCH SUMMARY", 14, y + 4);
  y += 8;

  const summaryData = [
    ["Total Transactions Checked", String(summary.total ?? 0)],
    ["Fraud Detected", String(summary.fraud ?? 0)],
    ["Legitimate", String(summary.legitimate ?? 0)],
    ["High Risk", String(summary.high_risk ?? 0)],
    ["Batch Fraud Rate", `${fraudRate}%`],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Metric", "Value"]],
    body: summaryData,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: BRAND_COLOR, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 80 }, 1: { cellWidth: 40, halign: "center" } },
    margin: { left: 14, right: 14 },
    tableWidth: 125,
  });

  y = doc.lastAutoTable.finalY + 6;

  // AI Batch Insight
  if (results.batch_insight) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(55, 65, 81);
    doc.text("AI BATCH INSIGHT", 14, y + 4);
    y += 8;
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(147, 197, 253);
    const lines = doc.splitTextToSize(results.batch_insight, 174);
    const boxH = lines.length * 5 + 8;
    doc.roundedRect(14, y, 182, boxH, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(30, 64, 175);
    doc.text(lines, 18, y + 6);
    y += boxH + 6;
  }

  // Per-transaction results table
  if (results.results?.length > 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(55, 65, 81);
    doc.text("TRANSACTION RESULTS", 14, y + 4);
    y += 8;

    const txRows = results.results.map((r) => [
      r.transaction_id ?? "—",
      r.verdict ?? "—",
      `${r.fraud_probability ?? 0}%`,
      r.risk_level ?? "—",
      (r.top_suspicious_features ?? []).slice(0, 3).join(", ") || "None",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Transaction ID", "Verdict", "Fraud %", "Risk", "Top Suspicious Features"]],
      body: txRows,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: BRAND_COLOR, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { cellWidth: 30, fontStyle: "bold" },
        1: { cellWidth: 25, halign: "center" },
        2: { cellWidth: 20, halign: "center" },
        3: { cellWidth: 22, halign: "center" },
        4: { cellWidth: 85 },
      },
      margin: { left: 14, right: 14 },
    });
  }

  addFooter(doc);
  doc.save(`fraud_report_batch_${new Date().toISOString().slice(0, 10)}.pdf`);
}
