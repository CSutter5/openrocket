#!/usr/bin/env python3
"""Describe trusted repository fixtures; not an untrusted upload parser."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[2]
EXAMPLES = ROOT / "core/src/main/resources/datafiles/examples"
SELECTED = [
    "A simple model rocket", "Three stage low power rocket", "Clustered motors",
    "Dual parachute deployment", "Simulation extensions", "Simulation scripting",
    "Pods--powered with recovery deployment",
]


def inventory():
    fixtures = []
    for name in SELECTED:
        path = EXAMPLES / (name + ".ork")
        original = path.read_bytes()
        entries = []
        if original.startswith(b"PK"):
            transport = "zip"
            with zipfile.ZipFile(io.BytesIO(original)) as archive:
                entries = [{"path": item.filename, "size": item.file_size,
                            "sha256": hashlib.sha256(archive.read(item)).hexdigest()}
                           for item in archive.infolist()]
                xml = archive.read(archive.infolist()[0])
        elif original.startswith(b"\x1f\x8b"):
            transport, xml = "gzip", gzip.decompress(original)
        else:
            transport, xml = "xml", original
        tree = ET.fromstring(xml)
        fixtures.append({
            "path": str(path.relative_to(ROOT)), "sha256": hashlib.sha256(original).hexdigest(),
            "size": len(original), "transport": transport, "format": tree.get("version"),
            "xmlSha256": hashlib.sha256(xml).hexdigest(), "entries": entries,
            "componentTypes": sorted({child.tag for sub in tree.iter("subcomponents") for child in sub}),
            "componentIdCount": len(list(tree.iter("id"))),
            "simulationCount": len(list(tree.iter("simulation"))),
            "flightDataCount": len(list(tree.iter("flightdata"))),
        })
    return {"schema": 1, "desktopRevision": "33bdb6d3062a6d9ef44a00d1ff865f962136e9e9",
            "fixtures": fixtures}


if __name__ == "__main__":
    output = json.dumps(inventory(), indent=2) + "\n"
    if sys.argv[1:] == ["--check"]:
        expected = ROOT / "web/fixtures/baseline.json"
        if expected.read_text() != output:
            raise SystemExit("fixture inventory differs; review source/baseline changes")
        print("7 baseline fixture byte/structure manifests match")
    elif sys.argv[1:]:
        raise SystemExit("usage: fixture-inventory.py [--check]")
    else:
        print(output, end="")
