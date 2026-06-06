import json
import re
import sys


def has(pattern, text):
    return re.search(pattern, text) is not None


def add(claims, claim, confidence="high"):
    if not any(item["claim"] == claim for item in claims):
        claims.append({"claim": claim, "confidence": confidence})


def read_payload():
    data = sys.stdin.buffer.read()
    try:
        raw = data.decode("utf-8").strip()
    except UnicodeDecodeError:
        raw = data.decode(sys.stdin.encoding or "utf-8", errors="replace").strip()
    return json.loads(raw) if raw else {}


def write_claims(claims):
    print(json.dumps({"claims": claims}, ensure_ascii=False))


def detect_v20(text):
    claims = []

    if has(r"离婚|想离|要离|准备离|起诉离|不想.*过|分开|断了|婚姻", text):
        add(claims, "离婚")
    if has(r"孩子|子女|女儿|儿子|娃|抚养|探望|探视", text):
        add(claims, "子女抚养权")
    if has(r"抚养费|生活费|教育费|学费", text):
        add(claims, "抚养费")
    if has(r"探望|探视|看孩子", text):
        add(claims, "探望权")
    if has(r"财产|房|车|存款|账户|钱|彩礼|转账|转钱|转走|挪走|藏钱", text):
        add(claims, "财产分割")
    if has(r"转账|转钱|转走|挪走|藏钱|隐匿|偷偷.*转|小三", text):
        add(claims, "财产转移")
    if has(r"小三|第三者|情人", text):
        add(claims, "追回第三者赠与")
    if has(r"家暴|打我|动手|推|威胁|吼|害怕|保护令|靠近|报警|弄死", text):
        add(claims, "家暴 / 人身安全保护")
    if has(r"损害赔偿|长期.*同居", text):
        add(claims, "离婚损害赔偿")
    if has(r"彩礼", text):
        add(claims, "彩礼返还")
    if has(r"血型|是不是我的|亲子|亲生", text):
        add(claims, "亲子关系确认/否认")

    return claims


def detect_v25(text):
    claims = []
    no_child = has(r"没有孩子|无子女|没有子女|未生育|没有抚养对象|孩子已经成年|已经成年|不涉及抚养", text)
    no_property = has(r"没有共同财产|无共同财产|没有财产|没有房产|没有存款|没有共同财产争议", text)
    no_violence = has(r"没有家暴|没有动手|没有威胁|没有家庭暴力|不算家暴", text)
    mild_push = has(r"推了我一下|推了一下|一次推搡|没有受伤|没报警|没有报警", text)
    third_party_transfer = has(r"小三|第三者|情人", text) and has(r"转账|转钱|花钱|追回|要回|转了很多钱", text)

    if has(r"离婚|想离|要离|准备离|起诉离|不想.*过|婚断了|可能.*离婚|婚姻有问题", text):
        add(claims, "离婚")

    explicit_custody = has(r"争取.*抚养权|争夺.*抚养权|孩子.*跟我|娃.*跟我|娃以后跟我|孩子.*归我|我要.*抚养权|我想.*孩子.*跟我", text)
    if explicit_custody and not no_child:
        add(claims, "子女抚养权")
    elif has(r"有个孩子|有一个孩子|孩子|女儿|儿子|娃", text) and not no_child:
        add(claims, "子女抚养权", "medium")

    if has(r"抚养费|生活费|教育费|学费|支付抚养", text) and not no_child and not has(r"不涉及抚养费|不要抚养费|不需要抚养费", text):
        add(claims, "抚养费")

    if has(r"探望|探视|看孩子", text) and not no_child:
        add(claims, "探望权")

    property_division = has(r"分割.*财产|分割夫妻共同财产|财产分割|分一下|分房|婚后买.*房|房子.*分|分割婚后买的房子|共同财产", text)
    transfer_only = has(r"转走|挪走|藏钱|转到|偷偷.*转|转给", text) and not property_division
    if property_division and not no_property and not transfer_only:
        add(claims, "财产分割")

    if third_party_transfer:
        add(claims, "财产转移", "medium")
    elif has(r"挪走|藏钱|隐匿|转到亲戚|转走了部分存款|偷偷.*转|把钱转给朋友|把钱偷偷挪走|转给朋友", text):
        add(claims, "财产转移")

    if third_party_transfer:
        add(claims, "追回第三者赠与", "medium")

    if not no_violence:
        if has(r"保护令|法院别让.*靠近|弄死|不敢回家|经常打|长期.*打|威胁.*害怕|打我.*威胁", text):
            add(claims, "家暴 / 人身安全保护")
        elif has(r"打我|威胁|害怕|推了我一下|推了一下", text) and not mild_push:
            add(claims, "家暴 / 人身安全保护", "medium")

    if has(r"离婚损害赔偿|损害赔偿", text):
        add(claims, "离婚损害赔偿")
    if has(r"彩礼", text) and has(r"要回|退回|返还|拿回", text):
        add(claims, "彩礼返还")
    if has(r"血型对不上|是不是我的|到底是不是我的|亲子|亲生", text):
        add(claims, "亲子关系确认/否认")

    return claims


def detect_v30(text):
    claims = []
    no_child = has(r"没有孩子|无子女|没有子女|孩子已经成年|不涉及抚养", text)
    no_property = has(r"没有共同财产|没有财产|没有共同财产争议", text)

    if has(r"离婚|想离|要离|准备离|起诉离|不想.*过|可能.*离婚|婚姻有问题", text):
        add(claims, "离婚")

    if has(r"争取.*抚养权|孩子.*跟我|娃.*跟我|娃以后跟我|孩子.*归我", text) and not no_child:
        add(claims, "子女抚养权")
    elif has(r"有个孩子|有一个孩子|孩子|女儿|儿子|娃", text) and not no_child:
        add(claims, "子女抚养权", "medium")

    if has(r"抚养费|生活费|教育费|学费|支付抚养", text) and not no_child:
        add(claims, "抚养费")
    if has(r"探望|探视|看孩子", text) and not no_child:
        add(claims, "探望权")

    if has(r"分割.*财产|财产分割|分一下|分房|婚后买.*房|房子.*分|共同财产", text) and not no_property:
        add(claims, "财产分割")
    if has(r"转账|转钱|转走|挪走|藏钱|转到|偷偷.*转|把钱转给朋友|小三", text):
        add(claims, "财产转移")
    if has(r"小三|第三者|情人", text) and has(r"转账|转钱|花钱|追回|要回|转了很多钱", text):
        add(claims, "追回第三者赠与")

    if has(r"家暴|打我|推了我一下|推了一下|威胁|吼|害怕|保护令|靠近|弄死", text) and not has(r"没有家暴|没有动手|没有威胁", text):
        add(claims, "家暴 / 人身安全保护")
    if has(r"损害赔偿", text):
        add(claims, "离婚损害赔偿")
    if has(r"彩礼", text) and has(r"要回|退回|返还|拿回", text):
        add(claims, "彩礼返还")
    if has(r"血型对不上|是不是我的|到底是不是我的|亲子|亲生", text):
        add(claims, "亲子关系确认/否认")

    return claims
