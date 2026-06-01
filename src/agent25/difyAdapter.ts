import type { FinalEvidenceItem } from "./evidenceGuard"

export interface AdaptedIntentClaim {
  claim_name: string
  confidence: string
  reason: string
}

export interface AdaptedIntentResponse {
  candidate_claims: AdaptedIntentClaim[]
  excluded_claims: { claim_name: string; reason: string }[]
  missing_info: string[]
}

export interface AdaptedEvidenceResponse {
  core_evidence: FinalEvidenceItem[]
  auxiliary_evidence: FinalEvidenceItem[]
  legal_analysis?: Array<{
    legal_relation: string
    related_claims: string
    legal_elements: string[]
    facts_to_prove: string[]
  }>
  missing_information?: string[]
  case_type?: string
  warnings: string[]
  risk_tips: string[]
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value
  let text = value.trim()
  if (!text) return value
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim()
  }
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
    if (!match) return { raw_text: text }
    try {
      return JSON.parse(match[1])
    } catch {
      return { raw_text: text }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function extractPayload(data: unknown): Record<string, unknown> {
  if (isRecord(data)) return data

  const record = data && typeof data === "object" ? data as Record<string, unknown> : {}
  const nestedData = isRecord(record.data) ? record.data as Record<string, unknown> : {}
  const outputs = isRecord(nestedData.outputs) ? nestedData.outputs as Record<string, unknown> : {}
  const topOutputs = isRecord(record.outputs) ? record.outputs as Record<string, unknown> : {}

  const answer = parseMaybeJson(record.answer)
  const answerRecord = isRecord(answer) ? answer : {}

  const candidates = [
    record.result,
    answerRecord,
    outputs,
    topOutputs,
    nestedData.outputs,
    record.outputs,
  ]

  for (const candidate of candidates) {
    if (isRecord(candidate)) return candidate
  }

  if (isRecord(record.result)) return record.result as Record<string, unknown>
  if (isRecord(answer)) return answer as Record<string, unknown>

  return {}
}

function normalizeClaim(raw: unknown): AdaptedIntentClaim | null {
  if (typeof raw === "string") {
    const name = raw.trim()
    if (!name) return null
    return { claim_name: name, confidence: "medium", reason: "" }
  }
  if (!isRecord(raw)) return null
  const claimName = String(raw.claim_name || raw.claim || raw.name || raw.text || "").trim()
  if (!claimName) return null
  return {
    claim_name: claimName,
    confidence: String(raw.confidence || "medium"),
    reason: String(raw.reason || raw.display_reason || ""),
  }
}

export function adaptDifyIntentResponse(raw: unknown): AdaptedIntentResponse {
  const payload = extractPayload(raw)

  const candidateClaims: AdaptedIntentClaim[] = []
  const rawCandidates = payload.candidate_claims || payload.possible_claims || payload.claim_cards || payload.claims || []
  if (Array.isArray(rawCandidates)) {
    for (const item of rawCandidates) {
      const normalized = normalizeClaim(item)
      if (normalized) candidateClaims.push(normalized)
    }
  }

  const excludedClaims: { claim_name: string; reason: string }[] = []
  const rawExcluded = payload.excluded_claims || []
  if (Array.isArray(rawExcluded)) {
    for (const item of rawExcluded) {
      if (typeof item === "string") {
        excludedClaims.push({ claim_name: item.trim(), reason: "" })
      } else if (isRecord(item)) {
        excludedClaims.push({
          claim_name: String(item.claim_name || item.claim || "").trim(),
          reason: String(item.reason || ""),
        })
      }
    }
  }

  const missingInfo: string[] = []
  const rawMissing = payload.missing_info || payload.missing_information || []
  if (Array.isArray(rawMissing)) {
    for (const item of rawMissing) {
      if (typeof item === "string") missingInfo.push(item.trim())
    }
  }

  return {
    candidate_claims: candidateClaims,
    excluded_claims: excludedClaims,
    missing_info: missingInfo,
  }
}

export function adaptDifyEvidenceResponse(raw: unknown): AdaptedEvidenceResponse {
  const payload = extractPayload(raw)

  const coreEvidence: FinalEvidenceItem[] = []
  const auxiliaryEvidence: FinalEvidenceItem[] = []

  const evidenceList = isRecord(payload.evidence_list) ? payload.evidence_list as Record<string, unknown> : {}
  const finalList = isRecord(payload.final_evidence_list_for_user)
    ? payload.final_evidence_list_for_user as Record<string, unknown>
    : {}

  const coreSource = finalList.core_evidence || evidenceList.core_evidence || []
  const auxSource = finalList.auxiliary_evidence || evidenceList.supporting_evidence || evidenceList.auxiliary_evidence || []

  if (Array.isArray(coreSource)) {
    for (const item of coreSource) {
      if (typeof item === "string") {
        coreEvidence.push({ evidence_name: item.trim(), priority: "核心证据", note: "", prepared: false })
      } else if (isRecord(item)) {
        coreEvidence.push({
          evidence_name: String(item.evidence_name || item.evidence || item.item || item.name || "").trim(),
          priority: "核心证据",
          note: String(item.note || item.reason || item.proves || ""),
          prepared: typeof item.prepared === "boolean" ? item.prepared : false,
        })
      }
    }
  }

  if (Array.isArray(auxSource)) {
    for (const item of auxSource) {
      if (typeof item === "string") {
        auxiliaryEvidence.push({ evidence_name: item.trim(), priority: "辅助证据", note: "", prepared: false })
      } else if (isRecord(item)) {
        auxiliaryEvidence.push({
          evidence_name: String(item.evidence_name || item.evidence || item.item || item.name || "").trim(),
          priority: "辅助证据",
          note: String(item.note || item.reason || item.proves || ""),
          prepared: typeof item.prepared === "boolean" ? item.prepared : false,
        })
      }
    }
  }

  const legalAnalysis: AdaptedEvidenceResponse["legal_analysis"] = []
  const rawLegal = payload.legal_analysis || []
  if (Array.isArray(rawLegal)) {
    for (const item of rawLegal) {
      if (isRecord(item)) {
        legalAnalysis.push({
          legal_relation: String(item.legal_relation || ""),
          related_claims: String(item.related_claims || ""),
          legal_elements: Array.isArray(item.legal_elements) ? item.legal_elements.map(String) : [],
          facts_to_prove: Array.isArray(item.facts_to_prove) ? item.facts_to_prove.map(String) : [],
        })
      }
    }
  }

  const missingInformation: string[] = []
  const rawMissingInfo = payload.missing_information || payload.missing_info || []
  if (Array.isArray(rawMissingInfo)) {
    for (const item of rawMissingInfo) {
      if (typeof item === "string") missingInformation.push(item.trim())
    }
  }

  const riskTips: string[] = []
  const rawRiskTips = payload.risk_tips || []
  if (Array.isArray(rawRiskTips)) {
    for (const item of rawRiskTips) {
      if (typeof item === "string") riskTips.push(item.trim())
    }
  }

  return {
    core_evidence: coreEvidence,
    auxiliary_evidence: auxiliaryEvidence,
    legal_analysis: legalAnalysis.length > 0 ? legalAnalysis : undefined,
    missing_information: missingInformation.length > 0 ? missingInformation : undefined,
    case_type: typeof payload.case_type === "string" ? payload.case_type : undefined,
    warnings: [],
    risk_tips: riskTips,
  }
}
