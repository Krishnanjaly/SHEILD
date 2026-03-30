import { RiskAnalysis } from "../utils/AiRiskEngine";

export type MovementRiskClassification = "LOW" | "HIGH" | "NONE";

export interface AbnormalMovementAssessment {
  classification: MovementRiskClassification;
  title: string;
  message: string;
  color: string;
  triggers: string[];
  dedupeKey: string;
}

const HIGH_RISK_TRIGGER_PATTERNS = [
  "violent",
  "aggressive",
  "fall",
  "drop",
  "struggle",
  "repeated",
  "strong shaking",
];

export function classifyAbnormalMovement(
  analysis: RiskAnalysis
): AbnormalMovementAssessment {
  const triggers = analysis.triggers ?? [];
  const normalizedTriggers = triggers.map((trigger) => trigger.toLowerCase());

  const isHighRiskTrigger = normalizedTriggers.some((trigger) =>
    HIGH_RISK_TRIGGER_PATTERNS.some((pattern) => trigger.includes(pattern))
  );

  const isHighRisk =
    analysis.riskLevel === "HIGH" ||
    isHighRiskTrigger ||
    normalizedTriggers.length >= 2 ||
    analysis.confidence >= 0.75;

  const isLowRisk =
    !isHighRisk &&
    (analysis.riskLevel === "LOW" ||
      normalizedTriggers.length > 0 ||
      analysis.confidence > 0.2);

  if (!isHighRisk && !isLowRisk) {
    return {
      classification: "NONE",
      title: "Monitoring Normal",
      message: "No abnormal movement pattern detected.",
      color: "#22c55e",
      triggers,
      dedupeKey: "none",
    };
  }

  const classification: MovementRiskClassification = isHighRisk ? "HIGH" : "LOW";
  const triggerSummary = triggers.length > 0 ? triggers.join(", ") : "Movement anomaly";

  return {
    classification,
    title: "Abnormal Movement Detected",
    message:
      classification === "HIGH"
        ? `High risk movement pattern detected: ${triggerSummary}`
        : `Low risk unusual movement detected: ${triggerSummary}`,
    color: classification === "HIGH" ? "#ef4444" : "#facc15",
    triggers,
    dedupeKey: `${classification}:${triggerSummary.toLowerCase()}`,
  };
}
