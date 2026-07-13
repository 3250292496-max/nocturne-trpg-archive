from __future__ import annotations

import argparse
import shutil
import tempfile
import zipfile
from pathlib import Path

from lxml import etree as ET


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W = f"{{{W_NS}}}"


TEXT_REPLACEMENTS = {
    "FE 强化完全修订版 v2.1 · 规则闭环、月之圣杯战争与资源库升级 · 非官方同人桌面角色扮演规则":
        "规则闭环、月之圣杯战争与资源库整合 · 非官方同人桌面角色扮演规则",
    "v2.1 FE 强化完全修订": "本次整理重点",
    "设定来源与版本说明": "设定来源与修订说明",
}

HEADER_REPLACEMENTS = {
    "NULL GRAIL／零之圣杯    |    通用圣杯战争规则书 v2.1 FE":
        "NULL GRAIL／零之圣杯    |    通用圣杯战争规则书",
}


def paragraph_text(element: ET.Element) -> str:
    return "".join(node.text or "" for node in element.iter(W + "t"))


def replace_text_nodes(root: ET.Element, replacements: dict[str, str]) -> None:
    for node in root.iter(W + "t"):
        if node.text in replacements:
            node.text = replacements[node.text]


def remove_version_history(root: ET.Element) -> None:
    body = root.find(W + "body")
    if body is None:
        raise RuntimeError("word/document.xml has no w:body")

    children = list(body)
    for index, child in enumerate(children):
        if child.tag != W + "p" or paragraph_text(child) != "版本记录":
            continue

        table = None
        for candidate in children[index + 1 :]:
            if candidate.tag == W + "tbl":
                table = candidate
                break
            if candidate.tag == W + "p" and paragraph_text(candidate).strip():
                break

        if table is None:
            raise RuntimeError("Could not locate the version-history table")

        body.remove(table)
        body.remove(child)
        return

    raise RuntimeError("Could not locate the 版本记录 heading")


def serialize_xml(root: ET.Element, original: bytes) -> bytes:
    del original
    return ET.tostring(
        root,
        encoding="UTF-8",
        xml_declaration=True,
        standalone=True,
    )


def patch_docx(docx_path: Path, cover_path: Path) -> None:
    if not docx_path.is_file():
        raise FileNotFoundError(docx_path)
    if not cover_path.is_file():
        raise FileNotFoundError(cover_path)

    with tempfile.NamedTemporaryFile(
        prefix=docx_path.stem + "-", suffix=".docx", dir=docx_path.parent, delete=False
    ) as handle:
        temp_path = Path(handle.name)

    try:
        with zipfile.ZipFile(docx_path, "r") as source, zipfile.ZipFile(
            temp_path, "w"
        ) as target:
            for info in source.infolist():
                data = source.read(info.filename)

                if info.filename == "word/document.xml":
                    root = ET.fromstring(data)
                    replace_text_nodes(root, TEXT_REPLACEMENTS)
                    remove_version_history(root)
                    data = serialize_xml(root, data)
                elif info.filename == "word/header4.xml":
                    root = ET.fromstring(data)
                    replace_text_nodes(root, HEADER_REPLACEMENTS)
                    data = serialize_xml(root, data)
                elif info.filename == "word/media/image1.png":
                    data = cover_path.read_bytes()

                target.writestr(info, data)

        with zipfile.ZipFile(temp_path, "r") as check:
            bad = check.testzip()
            if bad:
                raise RuntimeError(f"Corrupt ZIP member after patch: {bad}")

        shutil.move(temp_path, docx_path)
    finally:
        temp_path.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("docx", type=Path)
    parser.add_argument("cover", type=Path)
    args = parser.parse_args()
    patch_docx(args.docx.resolve(), args.cover.resolve())


if __name__ == "__main__":
    main()
