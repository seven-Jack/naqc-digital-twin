"""Read the published S23/P1 instrument logs and pair their original TGA members."""

import argparse
import ast
import hashlib
import json
import re
import struct
from datetime import datetime
from pathlib import Path
from zipfile import ZipFile


DOI = "10.21942/uva.28166483.v1"
ARCHIVE_MD5 = "9d23bd7aa40202676792ede35208beaf"
BASE = "Datapackage_SLM/data/241129_S23/"
NOTEBOOK = "Datapackage_SLM/AnalyzeFastSLMMovesPaper.ipynb"


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def notebook_list(cells, cell_index, name):
    tree = ast.parse("".join(cells[cell_index]["source"]))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in node.targets):
            value = node.value.args[0] if isinstance(node.value, ast.Call) else node.value
            return ast.literal_eval(value)
    raise ValueError(f"Missing author array {name} in cell {cell_index}")


def frame(archive, path, bits, decision_ref, frame_sizes):
    if not re.fullmatch(r"[01]{36}", bits):
        raise ValueError(f"Expected 36 online decisions in {decision_ref}")
    # The author's reader consumes nine little-endian uint16 header words.
    raw = archive.read(path)
    width, height = struct.unpack_from("<HH", raw, 12)
    if not width or not height or len(raw) != 18 + 2 * width * height:
        raise ValueError(f"Invalid 16-bit image length or dimensions in {path}")
    frame_sizes.add((width, height, len(raw)))
    return {
        "rawFrameRef": path, "rawFrameSha256": sha256(raw),
        "decisionRef": decision_ref, "occupancy": bits, "timeS": None,
    }


def write_json(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_batch(archive):
    names = archive.namelist()
    if len(names) != len(set(names)):
        raise ValueError("Duplicate archive member name")
    shot_ids = {
        int(match[1]) for name in names
        if (match := re.fullmatch(re.escape(BASE) + r"P1_(\d+)\.dat", name))
    }
    if shot_ids != set(range(1, 101)):
        raise ValueError(f"S23/P1 run roster differs from 1–100: {sorted(shot_ids)}")
    cells = json.loads(archive.read(NOTEBOOK))["cells"]
    centers = notebook_list(cells, 4, "rois_sort_6x6")
    targets = notebook_list(cells, 9, "targets")
    sites = [f"roi{i}" for i in range(len(centers))]
    attempts, log_hashes, frame_sizes = [], {}, set()
    timestamps = []
    header = archive.read(BASE + "P1_1.dat").decode("ascii").splitlines()[0].split()
    for shot in sorted(shot_ids):
        stem = f"{BASE}P1_{shot}"
        path = stem + ".dat"
        data = archive.read(path)
        lines = [line.split() for line in data.decode("ascii").splitlines() if line.strip()]
        if lines and lines[0] == header:
            lines = lines[1:]
        if len(lines) != 1 or len(header) != len(lines[0]) or len(set(header)) != len(header):
            raise ValueError(f"Invalid log columns in {path}")
        row = dict(zip(header, lines[0]))
        if [int(row[key]) for key in ("Series", "DataSetNr", "RunNr")] != [23, 1, shot]:
            raise ValueError(f"Filename and stored run ID differ in {path}")
        stamp = row["Date"] + " " + row["Time"]
        timestamps.append(datetime.strptime(stamp, "%Y.%m.%d %H:%M:%S::%f"))
        attempts.append({
            "attemptId": f"P1_{shot}", "sourceRef": path, "recordedTime": stamp,
            "initial": frame(archive, stem + "_1.tga", row["Pic1"], path + "#Pic1", frame_sizes),
            "final": frame(archive, stem + "_2.tga", row["Pic2"], path + "#Pic2", frame_sizes),
            "moves": None,
        })
        log_hashes[path] = sha256(data)
    roi_file = BASE + "P1ROIs.dat"
    roi_lines = archive.read(roi_file).decode("ascii").splitlines()
    raw_rectangles = [[int(x) for x in s.split()] for s in roi_lines if re.fullmatch(r"\s*\d+(?:\s+\d+){3}\s*", s)]
    if len(raw_rectangles) != len(sites) or len(sites) != 36 or len(set(targets)) != 16:
        raise ValueError("Instrument ROI count, published centers or target subset do not agree")
    geometry = {
        "siteIds": sites, "coordinates": {
            "kind": "camera-roi-px", "axes": ["x-column", "y-row"],
            "positions": [[(x0 + x1) / 2, (y0 + y1) / 2] for x0, y0, x1, y1 in raw_rectangles],
            "sourceRef": roi_file + " (midpoints of recorded bounds in raw-image pixels)",
        },
    }
    controls = [NOTEBOOK, roi_file, BASE + "P1_timinglist.dat", BASE + "P1_outputlist.dat",
                BASE + "P1.txt", BASE + "Average.dat", BASE + "params.dat"]
    run = {
        "kind": "public-transport-run", "schemaVersion": 1, "apparatus": "Knottnerus et al., UvA SLM, 813 nm",
        "species": "88Sr", "sourceRef": f"doi:{DOI}#{BASE}",
        "selectionRef": "Figure 2 S23, first acquisition block P1, all RunNr 1–100 before outcome selection",
        "decisionRef": "Instrument Pic1/Pic2 bit strings, in recorded order. Online threshold unverified.",
        "clockRef": None, "initialLayout": geometry,
        "finalLayout": {**geometry, "targetSiteIds": [sites[i] for i in targets]}, "minimumInitialAtoms": 16,
        "attempts": attempts,
    }
    manifest = {
        "datasetDoi": DOI, "fileId": 51549938, "license": "CC BY 4.0",
        "sourceUrl": "https://ndownloader.figshare.com/files/51549938", "officialArchiveMd5": ARCHIVE_MD5,
        "logSha256": log_hashes, "referenceSha256": {name: sha256(archive.read(name)) for name in controls},
        "tgaDimensionsAndBytes": sorted(frame_sizes), "rawInstrumentRoiRectangles": raw_rectangles,
        "offlineNotebookCentersInCroppedPixels": centers,
        "timestampScope": "One instrument log date and time per shot; time zone and frame triggers unspecified.",
        "nonIncreasingLogTimeAttempts": [attempts[i]["attemptId"] for i in range(1, len(timestamps)) if timestamps[i] <= timestamps[i - 1]],
    }
    return run, manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    md5, sha = hashlib.md5(), hashlib.sha256()
    with args.archive.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            md5.update(chunk)
            sha.update(chunk)
    if md5.hexdigest() != ARCHIVE_MD5 or args.archive.stat().st_size != 267848503:
        raise ValueError("Archive does not match Figshare v1")
    with ZipFile(args.archive) as archive:
        run, manifest = read_batch(archive)
    manifest["archiveSha256"] = sha.hexdigest()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    write_json(args.output_dir / "p1-run.json", run)
    write_json(args.output_dir / "p1-source-manifest.json", manifest)


if __name__ == "__main__":
    main()
