import type { CaseFacts } from "./caseFacts"
import { classifyClaimName, type ClaimType } from "./claimTypes"

export interface FinalEvidenceItem {
  evidence_name: string
  priority: "核心证据" | "辅助证据"
  note: string
  prepared?: boolean
}

export interface GuardedEvidenceResult {
  core_evidence: FinalEvidenceItem[]
  auxiliary_evidence: FinalEvidenceItem[]
  warnings: string[]
}

const CORE_LIMIT = 8
const AUXILIARY_LIMIT = 5

function isFoundationEvidence(name: string): boolean {
  return /(身份证|身份信息|结婚证|婚姻登记|户口本|户籍|户口簿)/.test(name)
}

function isPropertyEvidence(name: string): boolean {
  return /(微信转账|银行流水|转账记录|转账截图|交易明细|支付凭证|追回第三者|第三者转账|财产分割清单|财产清单|房产|存款|共同财产)/.test(name)
}

function isProtectionEvidence(name: string): boolean {
  return /(人身安全保护令|保护令申请|保护令|禁止令|伤情照片|威胁聊天记录|就医记录|报警记录|接警回执|证人线索)/.test(name)
}

function isDamageEvidence(name: string): boolean {
  return /(损害赔偿金额|损害赔偿|赔偿金额|医疗费|精神损害|伤情鉴定|误工费)/.test(name)
}

function isChildEvidence(name: string): boolean {
  return /(子女|孩子|出生证明|抚养|生活费|教育费|学费|探望|探视|实际照顾|支付能力)/.test(name)
}

function hasType(types: ClaimType[], target: ClaimType): boolean {
  return types.includes(target)
}

function onlyDivorce(types: ClaimType[]): boolean {
  return types.length > 0 && types.every((type) => type === "divorce")
}

function uniqueEvidence(items: FinalEvidenceItem[]): FinalEvidenceItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.evidence_name.slice(0, 4)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isAllowedEvidence(
  item: FinalEvidenceItem,
  confirmedTypes: ClaimType[],
  caseFacts: CaseFacts,
): boolean {
  void caseFacts
  const name = item.evidence_name

  // 基础身份/婚姻证件始终允许
  if (isFoundationEvidence(name)) return true

  // 仅确认离婚 → 只保留基础证件 + 感情破裂相关
  if (onlyDivorce(confirmedTypes)) {
    return /(感情破裂|分居|沟通|冲突|矛盾|协商离婚)/.test(name)
  }

  // 按已确认诉求类型过滤
  if (isPropertyEvidence(name)) {
    return hasType(confirmedTypes, "third_party_gift_return") ||
      hasType(confirmedTypes, "property_transfer") ||
      hasType(confirmedTypes, "property_division")
  }

  if (isProtectionEvidence(name)) {
    return hasType(confirmedTypes, "domestic_violence_protection")
  }

  if (isDamageEvidence(name)) {
    return hasType(confirmedTypes, "divorce_damages")
  }

  if (isChildEvidence(name)) {
    return hasType(confirmedTypes, "child_custody") ||
      hasType(confirmedTypes, "child_support") ||
      hasType(confirmedTypes, "visitation")
  }

  return true
}

export function buildGuardedEvidenceResult(input: {
  evidenceResult: {
    core_evidence: FinalEvidenceItem[]
    auxiliary_evidence: FinalEvidenceItem[]
    warnings?: string[]
  }
  confirmedClaimNames: string[]
  caseFacts: CaseFacts
}): GuardedEvidenceResult {
  const { evidenceResult, confirmedClaimNames, caseFacts } = input

  const confirmedTypes = confirmedClaimNames
    .map(classifyClaimName)
    .filter((type) => type !== "unknown")

  const warnings: string[] = []

  const coreEvidence = uniqueEvidence(evidenceResult.core_evidence)
    .filter((item) => item.evidence_name.trim() !== "")
    .filter((item) => {
      const allowed = isAllowedEvidence(item, confirmedTypes, caseFacts)
      if (!allowed) {
        warnings.push(`已过滤未确认诉求相关证据: ${item.evidence_name}`)
      }
      return allowed
    })
    .slice(0, CORE_LIMIT)

  const auxiliaryEvidence = uniqueEvidence(evidenceResult.auxiliary_evidence)
    .filter((item) => item.evidence_name.trim() !== "")
    .filter((item) => !coreEvidence.some((core) => core.evidence_name === item.evidence_name))
    .filter((item) => {
      const allowed = isAllowedEvidence(item, confirmedTypes, caseFacts)
      if (!allowed) {
        warnings.push(`已过滤未确认诉求相关证据: ${item.evidence_name}`)
      }
      return allowed
    })
    .slice(0, AUXILIARY_LIMIT)

  return {
    core_evidence: coreEvidence,
    auxiliary_evidence: auxiliaryEvidence,
    warnings,
  }
}
