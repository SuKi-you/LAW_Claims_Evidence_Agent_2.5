export interface CaseFacts {
  wantsDivorce: boolean
  hasChild: boolean | "unknown"
  hasNoChild: boolean
  hasCommonProperty: boolean | "unknown"
  hasNoCommonProperty: boolean
  hasThirdPartyTransfer: boolean
  hasDomesticViolence: boolean
  hasNoDomesticViolence: boolean
  hasMildPushOnly: boolean
  noInjury: boolean
  noPolice: boolean
}

const DIVORCE_INTENT = /(我想离婚|我要离婚|想离婚|准备离婚|起诉离婚|不想过了|解除婚姻)/
const NO_CHILD = /(没有孩子|无子女|没有子女|未生育|没有抚养对象)/
const CHILD = /(有(?:一个|一名|两个|两名|三个|三名|\d+个)?孩子|[一二三四五六七八九十\d]+岁(?:的)?孩子|子女|儿子|女儿|小孩)/
const NO_COMMON_PROPERTY = /(没有共同财产|无共同财产|没有财产|没有房产|没有存款)/
const COMMON_PROPERTY = /(房子|房贷|婚后买房|共同存款|共同财产|共同房产|房产|存款|车辆|理财)/
const THIRD_PARTY_TRANSFER = /(小三|第三者|给.{0,12}(女的|女人|第三者|小三).{0,12}(转钱|转账|花钱|买)|转给.{0,12}(女的|女人|第三者|小三)|银行流水|微信转账截图|微信转账|转账截图|大额转账|偷偷转账|赠与第三者)/
const NO_DOMESTIC_VIOLENCE = /(没有家暴|没有遭受家暴|不存在家暴|没有家庭暴力)/
const DOMESTIC_VIOLENCE = /(打我|殴打|经常打|威胁|恐吓|家暴|家庭暴力|虐待|伤害)/
const MILD_PUSH = /(推了一下|一次推搡|推搡|推了.{0,6}一下)/
const NO_INJURY = /(没有受伤|未受伤|没受伤)/
const NO_POLICE = /(没有报警|未报警|没报警)/

export function extractCaseFacts(sourceText: string): CaseFacts {
  const text = sourceText || ""
  const hasNoChild = NO_CHILD.test(text)
  const hasNoCommonProperty = NO_COMMON_PROPERTY.test(text)
  const hasNoDomesticViolence = NO_DOMESTIC_VIOLENCE.test(text)
  const noInjury = NO_INJURY.test(text)
  const noPolice = NO_POLICE.test(text)
  const hasMildPushOnly = MILD_PUSH.test(text)

  return {
    wantsDivorce: DIVORCE_INTENT.test(text),
    hasChild: (hasNoChild ? false : CHILD.test(text) ? true : "unknown") as boolean | "unknown",
    hasNoChild,
    hasCommonProperty: (hasNoCommonProperty ? false : COMMON_PROPERTY.test(text) ? true : "unknown") as boolean | "unknown",
    hasNoCommonProperty,
    hasThirdPartyTransfer: THIRD_PARTY_TRANSFER.test(text),
    hasDomesticViolence: hasNoDomesticViolence ? false : DOMESTIC_VIOLENCE.test(text),
    hasNoDomesticViolence,
    hasMildPushOnly,
    noInjury,
    noPolice,
  }
}

export function hasConcreteCaseFacts(caseFacts: CaseFacts): boolean {
  return Boolean(
    caseFacts.wantsDivorce ||
    caseFacts.hasNoChild ||
    caseFacts.hasThirdPartyTransfer ||
    caseFacts.hasDomesticViolence ||
    caseFacts.hasMildPushOnly ||
    caseFacts.noInjury ||
    caseFacts.noPolice ||
    caseFacts.hasNoCommonProperty ||
    caseFacts.hasCommonProperty === true ||
    caseFacts.hasChild === true
  )
}
