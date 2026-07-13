from __future__ import annotations

import re
import shutil
import sys
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from lxml import etree


WORKSPACE = Path(__file__).resolve().parents[1]
SOURCE_PACK = WORKSPACE / "NullGrail《零之圣杯》v3.2 最终版"
DEST_PACK = WORKSPACE / "NullGrail《零之圣杯》"
RULEBOOK_SOURCE = WORKSPACE / "_v21_work" / "fe-upgraded.docx"

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
XML_NS = "http://www.w3.org/XML/1998/namespace"
NS = {"w": W_NS}

RULEBOOK = "《零之圣杯》通用圣杯战争规则书（规则版本 2.1）"
SHORT_RULEBOOK = "规则书 2.1"
CAMPAIGN_BOUNDARY = (
    f"通用判定、战斗与角色构筑以{RULEBOOK}为准。"
    "五项行动方式、决意／压力／创伤、目标钟／威胁钟、团队共享空白令印与完整重置"
    "为本战役专属替代模块，仅覆盖明确点名的条款；同一次行动不得混用两套数值或结算公式，"
    "未点名处回归通用规则书。"
)


@dataclass(frozen=True)
class Replacement:
    old: str
    new: str
    minimum: int = 1
    full_paragraph: bool = False


def R(old: str, new: str, minimum: int = 1) -> Replacement:
    return Replacement(old, new, minimum, False)


def P(old: str, new: str, minimum: int = 1) -> Replacement:
    return Replacement(old, new, minimum, True)


FIRST_BOOK = [
    R("v3.2 统一修订版", "主模组修订版"),
    R("在v2.1实跑框架上", f"在{RULEBOOK}的实跑框架上"),
    P(
        "默认使用轻量 d20 叙事框架；所有节点亦提供系统无关的目标与代价，可转换至其他规则。",
        f"默认使用{RULEBOOK}；所有节点亦提供系统无关的目标与代价，可按需转换至其他规则。",
    ),
    P(
        "v3.2统一轻量d20、压力／创伤、冲突钟、三枚令印与完整重置口径，并补齐可选混合身份生命周期；标准NULL模式保持不变。",
        CAMPAIGN_BOUNDARY + "混合身份模式仅在全桌明确启用时使用；标准NULL模式保持不变。",
    ),
    P("一页规则速查｜v3.2唯一结算口径", "一页战役规则速查｜专属替代模块"),
    P(
        "本章提供默认轻量d20框架。使用其他规则时，可以跳过角色数值，只保留“检定难度、冲突钟、空白令印与完整重置锚定”。",
        f"本章汇总战役专属替代模块。角色数值、通用检定与战斗按{RULEBOOK}执行；启用本章时只替代明确点名的条款，同一次行动不混用两套结算。使用其他系统时，可跳过角色数值，但保留冲突钟、空白令印与完整重置锚定。",
    ),
    P("唯一结果表", "战役结果表（可选替代）"),
    R("正文表格为最终规则", "正文表格为本册战役模块的执行口径"),
    P("统一结算", "战役专属结算"),
    P(
        "v3.2结算口径：节点中的检定全部使用第2章唯一结果表。条目若未写明代价由谁选择，则由守秘人提出两项、玩家选择一项。每个“轨道变化”栏只是本节点已发生结果的汇总，同一事实不得与行动表重复累计。",
        f"战役节点结算口径：通用检定按{RULEBOOK}执行；第2章仅保留本战役专属替代条款。条目若未写明代价由谁选择，则由守秘人提出两项、玩家选择一项。每个“轨道变化”栏只是本节点已发生结果的汇总，同一事实不得与行动表重复累计。",
    ),
    R("冲突钟统一使用一对四格钟", "本战役冲突钟使用一对四格钟", 2),
    R("按统一结果表推进", "按本章战役结果表推进", 1),
    P("建立默认轻量d20与统一DC／冲突钟，并提供转换。", "提供战役专属轻量d20备选、DC／冲突钟及转换说明。"),
    P("统一规则", "战役专属规则"),
    R("统一机械表", "战役机械表"),
]


SECOND_BOOK = [
    R("第二册 · NPC与英灵手册 v3.2视觉统一版 · 含混合身份扩展", "第二册 · NPC与英灵手册 · 含混合身份扩展"),
    R("版本说明", "使用说明"),
    R("本文件与四册v3.2统一修订版共同构成现行正典。", "本文件与其余三册共同构成现行战役资料。"),
    R("本手册与四册v3.2共同构成现行正典。", "本手册与其余三册共同构成现行战役资料。"),
    R(
        "跨册规则冲突以《Null Grail v3.2统一规则与跨册索引》为最终口径；",
        f"通用规则以{RULEBOOK}为准；跨册定位见《零之圣杯》统一规则与跨册索引。",
        3,
    ),
    R("第三册提供玩家端规则与查表入口", "第三册提供玩家端战役规则与查表入口"),
    R("第三册是玩家端规则与查表入口", "第三册提供玩家端战役规则与查表入口"),
    R("本册与 第一册 v3.2 主模组高于原稿", "本册与第一册·主模组高于原稿"),
    R("版本优先级", "资料优先级"),
    R("主模组提供规则与节点；", f"通用规则由{SHORT_RULEBOOK}提供，主模组负责节点与战役专属模块；"),
    R(
        "v3.2统一修订保留23处既有插画与原视觉系统",
        "本册保留23处既有插画与原视觉系统",
    ),
    R("第四册守秘人工具书v3.2配套使用", "第四册守秘人工具书配套使用"),
    R("以第三册裁定规则；", f"通用裁定以{RULEBOOK}为准；第三册只补充玩家端战役规则与查表入口；"),
    R("一级：v3.2核心原则", "一级：本册核心原则"),
    R("以下为 v3.2 导演台扩展", "以下为导演台扩展"),
    R(
        "（引用第三册第5章统一规则）",
        "（通用结算见规则书 2.1；战役模块见第三册第5章）",
        7,
    ),
    R("按第三册第5章检定", f"按{RULEBOOK}检定", 7),
    R("采用统一4格目标钟／4格威胁钟", "采用本战役4格目标钟／4格威胁钟", 7),
    R("第三册：规则章节与第6A章", "规则书 2.1：角色建立；第三册：第6A章战役扩展"),
    R("第三册供玩家查检定", "规则书 2.1供玩家查检定"),
    R("第三册：第5章；第一册对应节点", "规则书 2.1：调查与检定；第一册对应节点"),
    R("第三册使用统一冲突钟", "第三册使用战役专属冲突钟"),
    R(
        "第一册：完整重置；第三册：统一规则",
        "第一册：完整重置；规则书 2.1：统一结算；第三册：战役专属替代模块",
    ),
    R("第三册供玩家查基本规则", "规则书 2.1供玩家查基本规则；第三册查战役专属规则"),
]


THIRD_BOOK = [
    R(" v3.2玩家规则版", ""),
    R(
        "开团前可读第0—5章；",
        "开团前可读第0—4章；第5章仅在启用战役专属替代规则时阅读；",
    ),
    R(
        "《零之圣杯》第三册是玩家规则册，与其余三册共用v3.2统一规则。",
        f"《零之圣杯》第三册是玩家战役手册，与其余三册共用{RULEBOOK}。{CAMPAIGN_BOUNDARY}",
    ),
    R("第0章、第1章、第3—5章，再选择一名预设角色", "第0章、第1章、第3—4章；启用战役专属替代规则时再读第5章，然后选择一名预设角色"),
    R("先读对应角色章节，再读第4—5章", "先读对应角色章节与第4章；启用战役专属替代规则时再读第5章"),
    R("第5章　轻量d20规则", "第5章　战役专属替代规则（可选）", 2),
    P("统一处理", "本章处理", 2),
    P("统一规则", "战役专属规则"),
    R("统一使用一对四格钟", "本战役使用一对四格钟"),
    P("掷1d20并读取唯一结果档位。", "如启用本章替代规则，掷1d20并读取本章结果档位。"),
]


FOURTH_BOOK = [
    R("v3.2｜守秘人（主持人）专用", "守秘人（主持人）专用"),
    R("第一册的规则与节点", "第一册的战役专属模块与节点"),
    R(
        "四册共用v3.2统一规则口径；本册工具只引用统一规则，不另行发明结果档位、压力、冲突钟、令印或重置流程。",
        f"四册共用{RULEBOOK}；本册工具不另行改写通用判定、战斗或角色构筑。压力、冲突钟、团队空白令印与完整重置按本战役专属替代模块执行；同一次行动不得混用两套结算。",
    ),
    R("v3.2新增混合身份守秘人控制台", "本册新增混合身份守秘人控制台"),
    P("统一规则控制条", "战役规则控制条"),
    P(
        "本页仅作摘要；完整裁定见《Null Grail v3.2统一规则与跨册索引》。基本式：1d20＋行动方式＋一项专长；不同且合理的协助每项＋1、最多＋3，协助者共同承担相关后果。条目未指定代价选择者时，由守秘人提出两项，玩家选择一项。",
        f"本页仅作桌边摘要；完整裁定见{RULEBOOK}。基本式：1d20＋属性＋技能，对抗难度或防御；普通协助给予团队加值＋1，完整投入主要动作可改为给予优势，团队数值加值最多＋1，协助者承担相关后果。压力、冲突钟、团队空白令印与完整重置按本战役专属替代模块执行。",
    ),
    P("统一口径", "战役口径"),
    P(
        "完成标志四册至此形成完整工作流：第一册负责规则与战役；第二册负责人物；第三册负责玩家理解与记录；第四册负责守秘人桌边执行与打印素材。",
        "完成标志四册至此形成完整工作流：规则书 2.1 负责通用规则；第一册负责战役与节点；第二册负责人物；第三册负责玩家理解、记录及战役专属规则；第四册负责守秘人桌边执行与打印素材。",
    ),
]


CLUE_PACK = [
    R("Null Grail v3.2 分阶段线索发放包", "Null Grail 分阶段线索发放包"),
    P(
        "本包含守秘人索引与PLAYER SAFE单卡；只裁下第2节对应单卡发放",
        f"规则依据：{RULEBOOK}；战役专属条款见《零之圣杯》统一规则与跨册索引。只裁下第2节对应的PLAYER SAFE单卡发放。",
    ),
]


INDEX_PACK = [
    P("v3.2 统一规则与跨册索引", "统一规则与跨册索引"),
    P("四册共同遵循的唯一规则口径", "规则书 2.1 入口与战役专属口径"),
    P(
        "守秘人（主持人）与玩家共同参考 · 规则优先级高于各册旧表述",
        "守秘人（主持人）与玩家共同参考 · 通用规则以规则书 2.1 为准，本文只处理战役专属条款与跨册定位",
    ),
    R("2. 六步行动流程", "2. 【战役】六步行动流程", 2),
    R("3. 轻量 d20 结果表", "3. 【战役】轻量 d20 结果表", 2),
    R("4. 决意、压力、创伤与伤势", "4. 【战役】决意、压力、创伤与伤势", 2),
    R("5. 冲突钟", "5. 【战役】冲突钟", 2),
    R("6. 空白令印、回流与锚定", "6. 【战役】空白令印、回流与锚定", 2),
    R("7. 完整重置", "7. 【战役】完整重置", 2),
    P(
        "规则优先级  本文件是v3.2唯一规则口径。若四册中的工具卡、人物卡或旧表述与本文件冲突，以本文件为准。",
        f"规则优先级  通用判定、战斗与角色构筑以{RULEBOOK}为准。本文件只整理五项行动方式、压力／创伤、冲突钟、团队空白令印、完整重置等战役专属替代条款与跨册定位；同一次行动不得混用两套结算，未点名处回归通用规则书。",
    ),
    P(
        "版本  Null Grail v3.2 统一修订版。旧版相同条目不再作为独立规则来源。",
        f"适用范围  本文件为《零之圣杯》战役配套索引；基础规则采用{RULEBOOK}。旧版相同条目不再作为独立规则来源。",
    ),
]


PUBLIC_PACK = [
    R("Null Grail v3.2 玩家公开资料包", "Null Grail 玩家公开资料包"),
    P(
        "本文件不解释世界真相，不公开NPC隐藏动机或结局条件",
        f"配合{RULEBOOK}使用；标有“【战役】”的章节为本模组专属替代模块，仅在主持人启用时使用。本文件不解释世界真相，不公开NPC隐藏动机或结局条件。",
    ),
    R("3. 六步行动流程与d20", "3. 【战役】六步行动流程与d20", 2),
    R("4. 决意、压力、伤势与冲突钟", "4. 【战役】决意、压力、伤势与冲突钟", 2),
    R("5. 空白令印、回流与重置", "5. 【战役】空白令印、回流与重置", 2),
]


HANDOUT_PACK = [
    R("NULL GRAIL｜PLAYER HANDOUTS｜v3.2", "NULL GRAIL｜PLAYER HANDOUTS｜规则书 2.1"),
]


RULEBOOK_PATCHES = [
    P(
        "版本边界：本书是通用 Null Grail Core d20 v2.1。Null Grail《零之圣杯》v3.2 的五项行动方式、决意／压力／创伤、目标钟／威胁钟、团队共享空白令印与完整重置属于该战役专属引擎；除非战役文件提供明确转换表，不与本书混用。",
        "规则边界：本书是通用 Null Grail Core d20（规则版本 2.1）。《零之圣杯》四册中的五项行动方式、决意／压力／创伤、目标钟／威胁钟、团队共享空白令印与完整重置属于战役专属替代模块；只覆盖各册明确点名的条款，同一次行动不得混用两套数值或结算公式，未点名处以本书为准。",
    ),
    P(
        "明确本书为 Null Grail Core d20 v2.1；v3.2 的压力、冲突钟、共享空白令印与完整重置只属于《零之圣杯》专属战役引擎。",
        "明确本书为 Null Grail Core d20（规则版本 2.1）；《零之圣杯》的压力、冲突钟、共享空白令印与完整重置属于战役专属替代模块，只覆盖明确点名的条款。",
    ),
    P(
        "分流通用核心与 v3.2 战役引擎；重写成功档位、唯一时序、反应、伤害、归零、休整、持久术式、职阶、令咒、胜利条件、示例与角色卡，并完成表头可访问性。",
        "分流通用核心与《零之圣杯》战役专属替代模块；重写成功档位、唯一时序、反应、伤害、归零、休整、持久术式、职阶、令咒、胜利条件、示例与角色卡，并完成表头可访问性。",
    ),
]


DOC_SPECS = [
    (
        SOURCE_PACK / "四册正文" / "《零之圣杯》第一册·主模组（v3.2）.docx",
        DEST_PACK / "四册正文" / "《零之圣杯》第一册·主模组.docx",
        FIRST_BOOK,
        True,
    ),
    (
        SOURCE_PACK / "四册正文" / "《零之圣杯》第二册·NPC与英灵手册（v3.2）.docx",
        DEST_PACK / "四册正文" / "《零之圣杯》第二册·NPC与英灵手册.docx",
        SECOND_BOOK,
        True,
    ),
    (
        SOURCE_PACK / "四册正文" / "《零之圣杯》第三册·玩家手册（v3.2）.docx",
        DEST_PACK / "四册正文" / "《零之圣杯》第三册·玩家手册.docx",
        THIRD_BOOK,
        True,
    ),
    (
        SOURCE_PACK / "四册正文" / "《零之圣杯》第四册·主持人工具书（v3.2）.docx",
        DEST_PACK / "四册正文" / "《零之圣杯》第四册·主持人工具书.docx",
        FOURTH_BOOK,
        True,
    ),
    (
        SOURCE_PACK / "配套资料" / "《零之圣杯》分阶段线索发放包（v3.2）.docx",
        DEST_PACK / "配套资料" / "《零之圣杯》分阶段线索发放包.docx",
        CLUE_PACK,
        True,
    ),
    (
        SOURCE_PACK / "配套资料" / "《零之圣杯》统一规则与跨册索引（v3.2）.docx",
        DEST_PACK / "配套资料" / "《零之圣杯》统一规则与跨册索引.docx",
        INDEX_PACK,
        True,
    ),
    (
        SOURCE_PACK / "配套资料" / "《零之圣杯》玩家公开资料包（v3.2）.docx",
        DEST_PACK / "配套资料" / "《零之圣杯》玩家公开资料包.docx",
        PUBLIC_PACK,
        True,
    ),
    (
        SOURCE_PACK / "配套资料" / "《零之圣杯》玩家手卡打印包（v3.2）.docx",
        DEST_PACK / "配套资料" / "《零之圣杯》玩家手卡打印包.docx",
        HANDOUT_PACK,
        True,
    ),
    (
        RULEBOOK_SOURCE,
        DEST_PACK / "规则书" / "《零之圣杯》通用圣杯战争规则书.docx",
        RULEBOOK_PATCHES,
        False,
    ),
]


def paragraph_text(paragraph: etree._Element) -> str:
    return "".join((node.text or "") for node in paragraph.xpath(".//w:t", namespaces=NS))


def set_space_flag(node: etree._Element) -> None:
    text = node.text or ""
    key = f"{{{XML_NS}}}space"
    if text.startswith(" ") or text.endswith(" "):
        node.set(key, "preserve")
    elif key in node.attrib:
        del node.attrib[key]


def replace_across_text_nodes(paragraph: etree._Element, old: str, new: str) -> int:
    nodes = paragraph.xpath(".//w:t", namespaces=NS)
    joined = "".join((node.text or "") for node in nodes)
    start = joined.find(old)
    if start < 0:
        return 0
    end = start + len(old)

    positions: list[tuple[int, int]] = []
    cursor = 0
    for node in nodes:
        text = node.text or ""
        positions.append((cursor, cursor + len(text)))
        cursor += len(text)

    start_index = end_index = None
    start_offset = end_offset = 0
    for index, (left, right) in enumerate(positions):
        if start_index is None and left <= start < right:
            start_index = index
            start_offset = start - left
        if left < end <= right:
            end_index = index
            end_offset = end - left
            break

    if start_index is None or end_index is None:
        raise RuntimeError(f"Could not map replacement range for {old!r}")

    if start_index == end_index:
        text = nodes[start_index].text or ""
        nodes[start_index].text = text[:start_offset] + new + text[end_offset:]
        set_space_flag(nodes[start_index])
    else:
        start_text = nodes[start_index].text or ""
        end_text = nodes[end_index].text or ""
        nodes[start_index].text = start_text[:start_offset] + new
        set_space_flag(nodes[start_index])
        for index in range(start_index + 1, end_index):
            nodes[index].text = ""
            set_space_flag(nodes[index])
        nodes[end_index].text = end_text[end_offset:]
        set_space_flag(nodes[end_index])
    return 1


def apply_replacements(root: etree._Element, replacements: list[Replacement]) -> dict[str, int]:
    counts = {replacement.old: 0 for replacement in replacements}
    paragraphs = root.xpath(".//w:p", namespaces=NS)
    for paragraph in paragraphs:
        original = paragraph_text(paragraph)
        for replacement in replacements:
            if replacement.full_paragraph:
                if original == replacement.old:
                    counts[replacement.old] += replace_across_text_nodes(
                        paragraph, replacement.old, replacement.new
                    )
                    original = paragraph_text(paragraph)
            elif replacement.old in original:
                changed = replace_across_text_nodes(paragraph, replacement.old, replacement.new)
                counts[replacement.old] += changed
                if changed:
                    original = paragraph_text(paragraph)
    return counts


def strip_campaign_version(root: etree._Element) -> int:
    count = 0
    pattern = re.compile(r"v3\.2", re.IGNORECASE)
    for element in root.iter():
        if element.text and pattern.search(element.text):
            element.text, matches = pattern.subn("", element.text)
            count += matches
        if element.tail and pattern.search(element.tail):
            element.tail, matches = pattern.subn("", element.tail)
            count += matches
        for key, value in list(element.attrib.items()):
            if pattern.search(value):
                element.attrib[key], matches = pattern.subn("", value)
                count += matches
    return count


def scrub_core_properties(root: etree._Element, clean_title: str) -> None:
    ns = {
        "cp": "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
        "dc": "http://purl.org/dc/elements/1.1/",
        "dcterms": "http://purl.org/dc/terms/",
    }
    values = {
        "dc:title": clean_title,
        "dc:subject": "",
        "dc:creator": "",
        "dc:description": "",
        "cp:keywords": "",
        "cp:lastModifiedBy": "",
    }
    for xpath, value in values.items():
        nodes = root.xpath(f"/{root.prefix}:coreProperties/{xpath}" if root.prefix else f"/*/{xpath}", namespaces={**ns, root.prefix or "core": root.nsmap.get(root.prefix)})
        if not nodes:
            nodes = root.xpath(f"//{xpath}", namespaces=ns)
        for node in nodes:
            node.text = value
    modified = root.xpath("//dcterms:modified", namespaces=ns)
    if modified:
        modified[0].text = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def remove_thumbnail_links(root: etree._Element, entry_name: str) -> None:
    if entry_name == "[Content_Types].xml":
        ns = {"ct": "http://schemas.openxmlformats.org/package/2006/content-types"}
        for node in root.xpath("//ct:Override[contains(@PartName, '/docProps/thumbnail.') ]", namespaces=ns):
            node.getparent().remove(node)
    elif entry_name == "_rels/.rels":
        ns = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}
        for node in root.xpath("//r:Relationship[contains(@Type, '/metadata/thumbnail')]", namespaces=ns):
            node.getparent().remove(node)


def patch_docx(
    source: Path,
    destination: Path,
    replacements: list[Replacement],
    remove_v32: bool,
) -> dict[str, object]:
    if not source.exists():
        raise FileNotFoundError(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    totals = {replacement.old: 0 for replacement in replacements}
    removed_versions = 0

    with zipfile.ZipFile(source, "r") as zin, zipfile.ZipFile(
        destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6
    ) as zout:
        for info in zin.infolist():
            if info.filename.lower().startswith("docprops/thumbnail."):
                continue
            data = zin.read(info.filename)
            if info.filename.endswith((".xml", ".rels")):
                parser = etree.XMLParser(remove_blank_text=False, resolve_entities=False)
                root = etree.fromstring(data, parser=parser)
                if info.filename.startswith("word/"):
                    counts = apply_replacements(root, replacements)
                    for old, count in counts.items():
                        totals[old] += count
                if remove_v32:
                    removed_versions += strip_campaign_version(root)
                if info.filename == "docProps/core.xml":
                    scrub_core_properties(root, destination.stem)
                remove_thumbnail_links(root, info.filename)
                data = etree.tostring(
                    root,
                    xml_declaration=True,
                    encoding="UTF-8",
                    standalone=True,
                )
            info.compress_type = zipfile.ZIP_DEFLATED
            zout.writestr(info, data)

    missing = [
        f"{replacement.old!r} (expected >= {replacement.minimum}, got {totals[replacement.old]})"
        for replacement in replacements
        if totals[replacement.old] < replacement.minimum
    ]
    if missing:
        destination.unlink(missing_ok=True)
        raise RuntimeError(f"Missing expected replacements in {source.name}:\n  " + "\n  ".join(missing))

    return {
        "source": str(source),
        "destination": str(destination),
        "replacement_counts": totals,
        "removed_v32": removed_versions,
    }


def main() -> int:
    if DEST_PACK.exists():
        raise RuntimeError(f"Destination already exists; refusing to overwrite: {DEST_PACK}")
    DEST_PACK.mkdir(parents=True)
    reports = []
    try:
        for source, destination, replacements, remove_v32 in DOC_SPECS:
            report = patch_docx(source, destination, replacements, remove_v32)
            reports.append(report)
            print(f"OK {destination.relative_to(WORKSPACE)}")
            for old, count in report["replacement_counts"].items():
                print(f"  {count:>2} × {old[:72]}")
            if remove_v32:
                print(f"  stripped residual v3.2 markers: {report['removed_v32']}")
    except Exception:
        shutil.rmtree(DEST_PACK, ignore_errors=True)
        raise
    print(f"Created {len(reports)} documents under {DEST_PACK}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
