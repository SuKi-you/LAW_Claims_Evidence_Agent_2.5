import type { CaseFacts } from "./caseFacts"
import { classifyClaimName, type ClaimType } from "./claimTypes"

export interface GuardedClaimCard {
  claim_id: string
  claim_name: string
  level: "明确诉求" | "高度相关" | "可能涉及" | "待确认"
  confidence: "high" | "medium_high" | "medium" | "low_medium" | "low"
  display_reason: string
}

const CONFIDENCE_SCORE: Record<GuardedClaimCard["confidence"], number> = {
  high: 5,
  medium_high: 4,
  medium: 3,
  low_medium: 2,
  low: 1,
}

interface RawClaim {
  claim_name: string
  confidence: string
  reason: string
}

function normalizeConfidence(raw: string): GuardedClaimCard["confidence"] {
  const valid = new Set(["high", "medium_high", "medium", "low_medium", "low"])
  const v = raw.toLowerCase()
  if (valid.has(v)) return v as GuardedClaimCard["confidence"]
  if (v === "高" || v === "明确") return "high"
  if (v === "中高" || v === "高度相关") return "medium_high"
  if (v === "中" || v === "可能涉及") return "medium"
  if (v === "低" || v === "待确认") return "low"
  return "medium"
}

function normalizeLevel(confidence: GuardedClaimCard["confidence"], rawLevel?: string): GuardedClaimCard["level"] {
  if (rawLevel) {
    const validLevels = new Set(["明确诉求", "高度相关", "可能涉及", "待确认"])
    if (validLevels.has(rawLevel)) return rawLevel as GuardedClaimCard["level"]
  }
  if (confidence === "high") return "明确诉求"
  if (confidence === "medium_high") return "高度相关"
  if (confidence === "medium") return "可能涉及"
  return "待确认"
}

function isType(type: ClaimType, values: ClaimType[]): boolean {
  return values.includes(type)
}

function userExplicitlyWantsDivorce(sourceText: string): boolean {
  return /(我想离婚|我要离婚|想离婚|准备离婚|起诉离婚|解除婚姻)/.test(sourceText)
}

function capConfidence(
  card: GuardedClaimCard,
  max: GuardedClaimCard["confidence"],
  reason?: string,
): GuardedClaimCard {
  if (CONFIDENCE_SCORE[card.confidence] <= CONFIDENCE_SCORE[max]) return card
  return {
    ...card,
    confidence: max,
    level: max === "medium_high" ? "高度相关" : max === "medium" ? "可能涉及" : "待确认",
    display_reason: reason || card.display_reason,
  }
}

function mergeDuplicateCards(cards: GuardedClaimCard[]): GuardedClaimCard[] {
  const result: GuardedClaimCard[] = []
  for (const card of cards) {
    const existingIndex = result.findIndex((item) =>
      item.claim_name === card.claim_name ||
      item.claim_name.includes(card.claim_name) ||
      card.claim_name.includes(item.claim_name)
    )
    if (existingIndex === -1) {
      result.push(card)
      continue
    }
    const existing = result[existingIndex]
    if (CONFIDENCE_SCORE[card.confidence] > CONFIDENCE_SCORE[existing.confidence]) {
      result[existingIndex] = card
    }
  }
  return result
}

export function buildGuardedClaimCards(input: {
  llmClaims: RawClaim[]
  caseFacts: CaseFacts
  sourceText: string
}): GuardedClaimCard[] {
  const { llmClaims, caseFacts, sourceText } = input
  const safeClaims = Array.isArray(llmClaims) ? llmClaims : []
  const guarded: GuardedClaimCard[] = []

  for (let i = 0; i < safeClaims.length; i++) {
    const raw = safeClaims[i]
    const claimName = String(raw.claim_name || "").trim()
    if (!claimName) continue

    const confidence = normalizeConfidence(raw.confidence)
    const level = normalizeLevel(confidence)
    const displayReason = String(raw.reason || "Dify 初步识别后，经本地规则校验保留。")

    const card: GuardedClaimCard = {
      claim_id: `agent25-c${i + 1}`,
      claim_name: claimName,
      level,
      confidence,
      display_reason: displayReason,
    }

    const type = classifyClaimName(claimName)

    // 规则 1 — 无子女排除子女类诉求
    if (caseFacts.hasNoChild && isType(type, ["child_custody", "child_support", "visitation"])) {
      continue
    }

    // 规则 2 — 无共同财产处理
    if (caseFacts.hasNoCommonProperty && !caseFacts.hasThirdPartyTransfer) {
      if (isType(type, ["property_division"])) {
        continue
      }
    }

    let next = card

    // 规则 A — 明确离婚意图 → 升级置信度 + 中性 reason
    if (type === "divorce" && userExplicitlyWantsDivorce(sourceText)) {
      next = {
        ...next,
        confidence: "high",
        level: "明确诉求",
        display_reason: "用户明确提出离婚意愿，因此列为明确诉求。",
      }
    }

    // 规则 B — 第三者转账存在时，财产分割降为待确认
    if (caseFacts.hasThirdPartyTransfer && type === "property_division") {
      next = {
        ...next,
        confidence: "low",
        level: "待确认",
        display_reason:
          "离婚案件可能涉及夫妻共同财产处理，但用户当前主要描述的是向第三人转账，是否需要主张普通财产分割仍需确认。",
      }
    }

    // 规则 C — 第三者转账存在但无共同财产时直接排除财产分割
    if (caseFacts.hasNoCommonProperty && caseFacts.hasThirdPartyTransfer && type === "property_division") {
      continue
    }

    // 规则 D — 追回第三者赠与不标明确，限为可能涉及
    if (caseFacts.hasThirdPartyTransfer && type === "third_party_gift_return") {
      next = {
        ...next,
        confidence: "medium",
        level: "可能涉及",
        display_reason:
          "用户描述配偶向第三人转账，并持有微信转账截图和银行流水，可能涉及追回第三者赠与或异常财产处分，仍需确认收款人身份、转账性质及资金来源。",
      }
    }

    // 规则 E — 财产转移 reason 微调
    if (caseFacts.hasThirdPartyTransfer && type === "property_transfer") {
      next = {
        ...next,
        display_reason:
          "存在配偶向第三人异常转账线索，可作为候选诉求，需进一步确认转账时间、金额、资金来源和用途。",
      }
    }

    // 规则 F — 家暴/人身安全保护：未报警场景降为可能涉及
    if (caseFacts.hasDomesticViolence && caseFacts.noPolice && type === "domestic_violence_protection") {
      next = {
        ...next,
        confidence: "medium",
        level: "可能涉及",
        display_reason:
          "用户描述长期殴打、威胁和不敢回家，存在人身安全风险；但用户明确表示未报警，仍需补充伤情、威胁记录、就医记录或证人线索。",
      }
    }

    // 规则 G — 轻微推搡降级
    if (caseFacts.hasMildPushOnly && caseFacts.noInjury && caseFacts.noPolice) {
      if (type === "domestic_violence_protection") {
        next = capConfidence(next, "medium", "一次推搡且未受伤、未报警，不足以高置信输出人身安全保护诉求。")
      }
      if (type === "divorce_damages") {
        next = capConfidence(next, "low_medium", "一次推搡且未受伤、未报警，不足以高置信输出离婚损害赔偿。")
      }
    }

    // 规则 H — 有子女但未明确争夺抚养权 → 降为可能涉及
    if (caseFacts.hasChild === true && type === "child_custody") {
      const explicitCustody = /(争取.*抚养权|孩子.*跟我|我要.*孩子|孩子.*归我|抚养权.*归我|我要抚养权|争.*抚养权)/.test(sourceText)
      if (!explicitCustody) {
        next = {
          ...next,
          confidence: "medium",
          level: "可能涉及",
          display_reason: "用户提及未成年子女，但未明确表达争夺抚养权，仅作为候选诉求提示。",
        }
      }
    }

    // 规则 I — 有子女但未明确要求抚养费 → 降为可能涉及
    if (caseFacts.hasChild === true && type === "child_support") {
      const explicitSupport = /(抚养费|对方.*支付.*抚养|要.*抚养费|生活费.*对方|教育费.*对方|索要.*抚养|主张.*抚养费)/.test(sourceText)
      if (!explicitSupport) {
        next = {
          ...next,
          confidence: "medium",
          level: "可能涉及",
          display_reason: "用户提及未成年子女，但未明确要求对方支付抚养费，仅作为候选诉求提示。",
        }
      }
    }

    // 规则 J — 有子女但未明确要求探望权 → 降为待确认
    if (caseFacts.hasChild === true && type === "visitation") {
      const explicitVisitation = /(探望权|探视权|看孩子|探望.*安排|探视.*安排)/.test(sourceText)
      if (!explicitVisitation) {
        next = {
          ...next,
          confidence: "low",
          level: "待确认",
          display_reason: "用户提及未成年子女，但未明确表达探望权诉求，是否需要安排探望仍需确认。",
        }
      }
    }

    guarded.push(next)
  }

  // ── 补充阶段：基于 caseFacts + sourceText 补足 Dify 遗漏的候选诉求 ──
  let suppIndex = 0

  // 补充 K — 明确离婚意图但 Dify 未返回时兜底
  const hasDivorceClaim = guarded.some(
    (c) => classifyClaimName(c.claim_name) === "divorce"
  )
  if (caseFacts.wantsDivorce && !hasDivorceClaim) {
    suppIndex++
    guarded.push({
      claim_id: `agent25-s${suppIndex}`,
      claim_name: "离婚",
      level: "明确诉求",
      confidence: "high",
      display_reason: "用户明确提出离婚意愿，因此列为明确诉求。",
    })
  }

  const textViolence = /(打我|经常打我|殴打|威胁|恐吓|害怕|不敢回家)/.test(sourceText)
  const hasViolenceClaim = guarded.some(
    (c) => classifyClaimName(c.claim_name) === "domestic_violence_protection"
  )

  if ((caseFacts.hasDomesticViolence || textViolence) && !hasViolenceClaim && !caseFacts.hasMildPushOnly) {
    const violenceReason = caseFacts.noPolice
      ? "用户描述长期殴打、威胁和不敢回家，存在人身安全风险；但用户明确表示未报警，仍需补充伤情、威胁记录、就医记录或证人线索。"
      : "用户描述存在殴打、威胁或人身安全风险，需进一步确认证据情况。"
    suppIndex++
    guarded.push({
      claim_id: `agent25-s${suppIndex}`,
      claim_name: "家暴 / 人身安全保护",
      level: "可能涉及",
      confidence: "medium",
      display_reason: violenceReason,
    })
  }

  const textTransfer = /(第三者|小三|给.{0,5}女的.{0,5}转|微信转账|银行流水|转账截图|转账)/.test(sourceText)
  const hasThirdPartyGiftReturn = guarded.some(
    (c) => classifyClaimName(c.claim_name) === "third_party_gift_return"
  )

  if ((caseFacts.hasThirdPartyTransfer || textTransfer) && !hasThirdPartyGiftReturn) {
    suppIndex++
    guarded.push({
      claim_id: `agent25-s${suppIndex}`,
      claim_name: "追回第三者赠与",
      level: "可能涉及",
      confidence: "medium",
      display_reason:
        "用户描述配偶向第三人转账，并持有微信转账截图和银行流水，可能涉及追回第三者赠与或异常财产处分，仍需确认收款人身份、转账性质及资金来源。",
    })
  }

  const hasPropertyTransfer = guarded.some(
    (c) => classifyClaimName(c.claim_name) === "property_transfer"
  )
  if ((caseFacts.hasThirdPartyTransfer || textTransfer) && !hasPropertyTransfer) {
    suppIndex++
    guarded.push({
      claim_id: `agent25-s${suppIndex}`,
      claim_name: "财产转移",
      level: "可能涉及",
      confidence: "medium",
      display_reason:
        "存在配偶向第三人异常转账线索，可作为候选诉求，需进一步确认转账时间、金额、资金来源和用途。",
    })
  }

  // 补充 L — 有子女且用户明确表达抚养权意愿但 Dify 未返回时兜底
  const textChildCustody = /(孩子.*跟我|孩子.*归我|我要.*孩子|抚养权|跟我生活|和我生活|让孩子跟着我|争夺抚养权|争.*孩子)/.test(sourceText)
  const hasChildCustodyClaim = guarded.some(
    (c) => classifyClaimName(c.claim_name) === "child_custody"
  )
  if (caseFacts.hasChild === true && !caseFacts.hasNoChild && textChildCustody && !hasChildCustodyClaim) {
    suppIndex++
    guarded.push({
      claim_id: `agent25-s${suppIndex}`,
      claim_name: "子女抚养权",
      level: "明确诉求",
      confidence: "high",
      display_reason: "用户明确表达希望孩子跟随自己生活，列为明确诉求。",
    })
  }

  // ── simpleDivorceOnly：仅表达离婚意愿，无其他具体事实 → 只保留离婚 ──
  const isSimpleDivorceOnly =
    caseFacts.wantsDivorce === true &&
    caseFacts.hasChild === "unknown" &&
    !caseFacts.hasNoChild &&
    caseFacts.hasCommonProperty === "unknown" &&
    !caseFacts.hasNoCommonProperty &&
    !caseFacts.hasThirdPartyTransfer &&
    !caseFacts.hasDomesticViolence &&
    !caseFacts.hasMildPushOnly

  if (isSimpleDivorceOnly) {
    const divorceCard = guarded.find((c) => classifyClaimName(c.claim_name) === "divorce")
    if (divorceCard) {
      return [
        {
          ...divorceCard,
          confidence: "high",
          level: "明确诉求",
          display_reason: "用户明确表达想离婚，可作为确认诉求。",
        },
      ]
    }
    return [
      {
        claim_id: "agent25-simple-divorce",
        claim_name: "离婚",
        level: "明确诉求",
        confidence: "high",
        display_reason: "用户明确表达想离婚，可作为确认诉求。",
      },
    ]
  }

  return mergeDuplicateCards(guarded).sort((a, b) => {
    const scoreDiff = CONFIDENCE_SCORE[b.confidence] - CONFIDENCE_SCORE[a.confidence]
    if (scoreDiff !== 0) return scoreDiff

    // 财产分割排在 third_party_gift_return / property_transfer 之后
    const aType = classifyClaimName(a.claim_name)
    const bType = classifyClaimName(b.claim_name)
    const order: ClaimType[] = [
      "third_party_gift_return",
      "property_transfer",
      "property_division",
    ]
    const aOrder = order.indexOf(aType)
    const bOrder = order.indexOf(bType)
    if (aOrder !== -1 && bOrder !== -1) return aOrder - bOrder

    return 0
  })
}
