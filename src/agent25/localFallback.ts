import type { CaseFacts } from "./caseFacts"
import { classifyClaimName } from "./claimTypes"
import type { AdaptedIntentClaim } from "./difyAdapter"
import type { FinalEvidenceItem } from "./evidenceGuard"

export function buildLocalIntentFallback(
  caseFacts: CaseFacts,
  sourceText: string,
): AdaptedIntentClaim[] {
  const claims: AdaptedIntentClaim[] = []

  const hasExplicitDivorce = /(我想离婚|我要离婚|想离婚|准备离婚|起诉离婚|解除婚姻)/.test(sourceText)
  if (caseFacts.wantsDivorce || hasExplicitDivorce) {
    claims.push({
      claim_name: "离婚",
      confidence: "high",
      reason: "用户明确提出离婚意愿，因此列为明确诉求。",
    })
  }

  const hasViolenceSignal =
    caseFacts.hasDomesticViolence ||
    /(打我|殴打|经常打|威胁|恐吓|害怕|不敢回家)/.test(sourceText)
  if (hasViolenceSignal && !caseFacts.hasNoDomesticViolence) {
    const violenceReason = caseFacts.noPolice
      ? "用户描述长期殴打、威胁和不敢回家，存在人身安全风险；但用户明确表示未报警，仍需补充伤情、威胁记录、就医记录或证人线索。"
      : "用户描述存在殴打、威胁或人身安全风险，需进一步确认证据情况。"
    claims.push({
      claim_name: "家暴 / 人身安全保护",
      confidence: "medium",
      reason: violenceReason,
    })
  }

  const hasTransferSignal =
    caseFacts.hasThirdPartyTransfer ||
    /(第三者|小三|给.{0,5}女的.{0,5}转|微信转账|银行流水|转账截图)/.test(sourceText)
  if (hasTransferSignal) {
    claims.push({
      claim_name: "追回第三者赠与",
      confidence: "medium",
      reason: "用户描述配偶向第三人转账，并持有微信转账截图和银行流水，可能涉及追回第三者赠与或异常财产处分，仍需确认收款人身份、转账性质及资金来源。",
    })
    claims.push({
      claim_name: "财产转移",
      confidence: "medium",
      reason: "存在配偶向第三人异常转账线索，可作为候选诉求，需进一步确认转账时间、金额、资金来源和用途。",
    })
  }

  return claims
}

function evidenceItem(
  evidenceName: string,
  priority: FinalEvidenceItem["priority"],
  note: string,
): FinalEvidenceItem {
  return { evidence_name: evidenceName, priority, note }
}

export function buildLocalEvidenceFallback(input: {
  confirmedClaimNames: string[]
  caseFacts: CaseFacts
}): {
  core_evidence: FinalEvidenceItem[]
  auxiliary_evidence: FinalEvidenceItem[]
  warnings: string[]
} {
  const { confirmedClaimNames, caseFacts } = input
  void caseFacts

  const confirmedTypes = confirmedClaimNames.map(classifyClaimName)
  const onlyDivorce =
    confirmedTypes.length > 0 && confirmedTypes.every((type) => type === "divorce")

  if (onlyDivorce) {
    return {
      core_evidence: [
        evidenceItem("身份证件", "核心证据", "用于确认当事人身份。"),
        evidenceItem("结婚证或婚姻登记信息", "核心证据", "用于证明婚姻关系。"),
        evidenceItem("户口簿", "核心证据", "用于辅助确认身份、婚姻及家庭登记信息。"),
      ],
      auxiliary_evidence: [
        evidenceItem("夫妻感情破裂相关材料", "辅助证据", "如聊天记录、沟通记录、冲突记录等，按实际已有材料准备。"),
        evidenceItem("分居、沟通记录等如有则补充", "辅助证据", "如存在分居、长期矛盾或协商离婚记录，可作为补充材料。"),
      ],
      warnings: ["Dify 证据生成未返回，已根据本地规则生成基础证据清单（仅离婚场景）。"],
    }
  }

  const core: FinalEvidenceItem[] = [
    evidenceItem("身份证件", "核心证据", "用于确认当事人身份。"),
    evidenceItem("结婚证或婚姻登记信息", "核心证据", "用于证明婚姻关系。"),
  ]
  const auxiliary: FinalEvidenceItem[] = []

  if (
    confirmedTypes.includes("third_party_gift_return") ||
    confirmedTypes.includes("property_transfer") ||
    confirmedTypes.includes("property_division")
  ) {
    core.push(
      evidenceItem("微信转账截图", "核心证据", "用于证明具体转账事实、对象和金额。"),
      evidenceItem("银行流水", "核心证据", "用于核对转账时间、金额和账户流向。"),
      evidenceItem("转账记录", "核心证据", "用于补充证明异常财产处分线索。"),
    )
    auxiliary.push(
      evidenceItem("第三者身份线索", "辅助证据", "如姓名、账号、聊天备注、收款账户等线索。"),
      evidenceItem("赠与/异常转账时间线", "辅助证据", "按时间整理每笔异常转账及对应材料。"),
    )
  }

  if (confirmedTypes.includes("domestic_violence_protection")) {
    core.push(
      evidenceItem("伤情照片", "核心证据", "用于证明人身伤害或暴力后果。"),
      evidenceItem("威胁聊天记录", "核心证据", "用于证明威胁、恐吓或现实危险。"),
      evidenceItem("人身安全保护令申请材料", "核心证据", "用于申请保护令时提交。"),
    )
    auxiliary.push(
      evidenceItem("就医记录", "辅助证据", "如有就医、检查、诊断材料可补充。"),
      evidenceItem(
        "报警记录或接警回执",
        "辅助证据",
        caseFacts.noPolice
          ? "当前描述为没有报警；如后续报警，可补充报警记录或接警回执。"
          : "如有报警记录或接警回执可补充。",
      ),
      evidenceItem("证人线索", "辅助证据", "如邻居、亲友、物业等知情人线索。"),
    )
  }

  if (confirmedTypes.includes("divorce_damages")) {
    core.push(
      evidenceItem("损害赔偿金额证明", "核心证据", "用于证明主张赔偿的金额基础。"),
      evidenceItem("医疗费票据或诊疗记录", "核心证据", "如因侵害产生医疗支出，可作为金额和损害证明。"),
    )
    auxiliary.push(
      evidenceItem("精神损害相关材料", "辅助证据", "如心理咨询、长期威胁或严重侵害影响材料。"),
    )
  }

  return {
    core_evidence: core,
    auxiliary_evidence: auxiliary,
    warnings: ["Dify 证据生成未返回，已根据本地规则生成基础证据清单。"],
  }
}
