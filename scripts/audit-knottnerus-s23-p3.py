"""Replay the next S23 scan point P3 using frozen P1 geometry and P1/P2 decision rules."""

import argparse
import ast
import gzip
import importlib.util
import io
import json
import re
from datetime import datetime
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile


DECISIONS = (6436, *range(6499, 6520))
SOURCE_HEADER = (
    "Date Time Series DataSetNr RunNr NumberOfIdenticalExperimentalSequences "
    "RbRepumpDPAOMB2Intensity1 Pic1 Pic2"
).split()


def load_reference():
    path = Path(__file__).with_name("audit-knottnerus-s23-p2.py")
    if sha256(path.read_bytes()).hexdigest() != "11cc5d36d8130c5179e2de08f8a865587dcf6d41bba3a0d524b259c3c731e0f6":
        raise ValueError("Expected the published v0.1.3 P2 reference implementation")
    spec = importlib.util.spec_from_file_location("s23_p2", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def inspect_archive(archive, manifest, ref):
    hashes = manifest["member_sha256"]
    ref.require(manifest["archive_sha256"] == ref.PACKAGE_SHA, "Unexpected source archive identity")
    names = archive.namelist()
    ref.require(len(names) == len(set(names)), "Duplicate archive members")
    paths = {ref.BASE + f"P3_{shot}{suffix}" for shot in ref.SHOTS
             for suffix in (".dat", "_1.tga", "_2.tga")}
    present = {name for name in names
               if re.fullmatch(re.escape(ref.BASE) + r"P3_\d+(?:\.dat|_\d+\.tga)", name)}
    ref.require(present == paths, "Missing or additional P3 shot/frame identifiers")
    controls = (".txt", "ROIs.dat", "_timinglist.dat", "_outputlist.dat")
    expected = paths | {ref.NOTEBOOK, ref.BASE + "params.dat"}
    expected.update(ref.BASE + f"P{i}" + suffix for i in (1, 3) for suffix in controls)
    ref.require(expected <= hashes.keys(), "Source manifest does not cover all inputs")
    for name, checksum in hashes.items():
        ref.require(ref.digest(archive.read(name)) == checksum, "Source hash mismatch: " + name)

    p1_rectangles = archive.read(ref.BASE + "P1ROIs.dat")
    ref.require(ref.digest(p1_rectangles) == ref.P1_ROI_SHA, "Frozen P1 rectangles changed")
    boxes = ref.rectangle_table(p1_rectangles)
    comparisons = {}
    for suffix in controls:
        old, new = (hashes[ref.BASE + f"P{i}" + suffix] for i in (1, 3))
        comparisons[suffix] = {"p1_sha256": old, "p3_sha256": new, "identical": old == new}
        if suffix != ".txt":
            ref.require(old == new, "P3 comparability check failed: " + suffix)

    p1, p3 = (archive.read(ref.BASE + f"P{i}.txt").decode().splitlines() for i in (1, 3))
    ref.require(len(p1) == len(p3), "Control file structure changed")
    changes = []
    for line, (old, new) in enumerate(zip(p1, p3, strict=True), 1):
        if old == new:
            continue
        key = old.partition("=")[0]
        ref.require(new.partition("=")[0] == key and
                    (key in {"DRbRepumpDPAOMB2Intensity1", "DLastEndTime"} or
                     re.fullmatch(r"SLastMessageList\d+", key)), "Other control differs: " + key)
        changes.append({"line": line, "p1": old, "p3": new})
    settings = [line for line in p3 if line.split("=")[0].endswith("SortAtomsTakeVerificationImage")
                or "SortAtomsWithSLMImaging" in line or line.startswith("FDoSortAtomsWithSLM=")]
    ref.require("DSortAtomsWithSLMImagingDuration=200.00000" in settings
                and "FDoSortAtomsWithSLM=TRUE" in settings
                and "BSortAtomsTakeVerificationImage=TRUE" in settings, "Unexpected P3 imaging setup")
    params = archive.read(ref.BASE + "params.dat").decode().splitlines()
    ref.require("threshold;6436;int" in params, "Missing candidate setting in S23 params.dat")
    code = json.loads(archive.read(ref.NOTEBOOK))["cells"][9]["source"]
    target_line = next(line for line in code if line.startswith("targets = "))
    ref.require(tuple(ast.literal_eval(target_line.partition("=")[2].strip())) == ref.TARGETS,
                "Target indices differ from author's notebook")
    conditions = {"source_members_verified": len(hashes), "comparison": comparisons,
                  "program_imaging_settings": settings, "control_text_changes": changes,
                  "p1_rectangles_sha256": ref.P1_ROI_SHA, "targets_zero_based": ref.TARGETS,
                  "rounds": len(ref.SHOTS), "paired_frames": 2 * len(ref.SHOTS),
                  "image_header_hex": ref.TGA_HEADER.hex(), "image_width": 100, "image_height": 180}
    return boxes, conditions


def read_pixels(archive, boxes, ref):
    sites, records = [], {}
    previous_time = None
    for shot in ref.SHOTS:
        stem = ref.BASE + f"P3_{shot}"
        log_path = stem + ".dat"
        lines = [line.split() for line in archive.read(log_path).decode("ascii").splitlines() if line.strip()]
        if shot == 1:
            ref.require(lines[0] == SOURCE_HEADER, "P3 first-shot DAT column order")
        if lines[0] == SOURCE_HEADER:
            lines = lines[1:]
        ref.require(len(lines) == 1, "Expected one record in " + log_path)
        record = dict(zip(SOURCE_HEADER, lines[0], strict=True))
        ref.require([record[k] for k in ("Series", "DataSetNr", "RunNr")] == ["23", "3", str(shot)],
                    "File/record shot mismatch: " + log_path)
        timestamp = record["Date"] + " " + record["Time"]
        time = datetime.strptime(timestamp, "%Y.%m.%d %H:%M:%S::%f")
        ref.require(previous_time is None or time > previous_time, "Unordered round timestamps")
        previous_time = time
        records[shot] = {"shot": shot, "attempt_id": f"P3_{shot}", "recorded_time": timestamp,
                         "source_log": log_path, "logged_scan_field": record["RbRepumpDPAOMB2Intensity1"]}
        for frame in (1, 2):
            bits = record[f"Pic{frame}"]
            ref.require(re.fullmatch(r"[01]{36}", bits), "Invalid Pic bit string: " + log_path)
            frame_path = stem + f"_{frame}.tga"
            raw = archive.read(frame_path)
            ref.require(len(raw) == 36018 and raw[:18] == ref.TGA_HEADER, "Unexpected TGA: " + frame_path)
            for roi, (x0, y0, x1, y1) in enumerate(boxes):
                counts = sum(sum(ref.ROW_SUM.unpack_from(raw, 18 + 2 * (100 * y + x0))) for y in range(y0, y1))
                sites.append({"shot": shot, "frame": frame, "roi": roi, "target": int(roi in ref.TARGETS),
                              "raw_x0": x0, "raw_y0": y0, "raw_x1_exclusive": x1, "raw_y1_exclusive": y1,
                              "counts": counts, "log_bit": int(bits[roi]), "fixed_bit": int(counts > DECISIONS[0]),
                              "frame_member": frame_path, "log_member": log_path})
    return sites, records


def round_table(sites, records, ref):
    rows = []
    for offset, shot in enumerate(ref.SHOTS):
        row = dict(records[shot])
        for frame in (1, 2):
            first = offset * 72 + (frame - 1) * 36
            pixels = sites[first:first + 36]
            row[f"pic{frame}_disagreement_rois"] = " ".join(
                str(p["roi"]) for p in pixels if p["log_bit"] != p["fixed_bit"])
            for rule in ("log", "fixed"):
                bits = "".join(str(p[rule + "_bit"]) for p in pixels)
                row[f"{rule}_pic{frame}"] = bits
                row[f"{rule}_pic{frame}_n"] = bits.count("1")
                if frame == 1:
                    row[rule + "_selected"] = int(bits.count("1") >= ref.MIN_ATOMS)
                else:
                    row[rule + "_target_n"] = sum(bits[i] == "1" for i in ref.TARGETS)
        rows.append(row)
    return rows


def summarize_threshold(threshold, rows, sites, ref):
    shots = set(ref.SHOTS)
    logged = {r["shot"] for r in rows if r["log_selected"]}
    fixed = {r["shot"] for r in rows if r["fixed_selected"]}
    masks = {"all": shots, "log_in": logged, "log_out": shots - logged, "fixed_in": fixed,
             "fixed_out": shots - fixed, "both": logged & fixed, "log_only": logged - fixed,
             "fixed_only": fixed - logged, "neither": shots - logged - fixed}
    cohorts = []
    for name, mask in masks.items():
        group = ref.summarize(mask, rows, sites)
        cmp = group["comparisons"]
        n = group["rounds"]
        record = {"threshold": threshold, "cohort": name, "shots": " ".join(map(str, group["shots"])), "rounds": n}
        for rule, counts in group["counts"].items():
            for short, key in (("initial", "initial_occupied"), ("final", "final_occupied"),
                               ("target", "final_target_occupied"), ("full", "full_target_rounds")):
                record[f"{rule}_{short}_n"] = counts[key]["n"]
        record.update(site_denominator=36*n, target_denominator=16*n, round_denominator=n,
                      disagreements=cmp["all"]["disagreements"], decision_denominator=cmp["all"]["denominator"],
                      pic1_disagreements=cmp["pic1"]["disagreements"], pic2_disagreements=cmp["pic2"]["disagreements"],
                      pic2_target_disagreements=cmp["pic2_targets"]["disagreements"],
                      log0_fixed1=cmp["all"]["log0_fixed1"], log1_fixed0=cmp["all"]["log1_fixed0"])
        cohorts.append(record)
    differences = [{"threshold": threshold, **s} for s in sites if s["log_bit"] != s["fixed_bit"]]
    bits = "".join(str(row["fixed_bit"]) for row in sites)
    summary = {"decision_sha256": ref.digest(bits.encode("ascii")), "disagreements": len(differences),
               "decision_denominator": len(sites), "discrepant_shots": sorted({d["shot"] for d in differences}),
               "equal_to_threshold": sum(r["counts"] == threshold for r in sites),
               "selected_log": sorted(logged), "selected_fixed": sorted(fixed)}
    return summary, cohorts, differences


def write_csv(path, rows, fields, ref):
    with path.open("w", newline="", encoding="utf-8") as stream:
        ref.write_csv(stream, fields, rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("source_manifest", type=Path)
    parser.add_argument("out", type=Path)
    args = parser.parse_args()
    ref = load_reference()
    ref.require(not args.out.exists(), "Output directory already exists")
    manifest = json.loads(args.source_manifest.read_text())
    with ZipFile(args.archive) as archive:
        boxes, conditions = inspect_archive(archive, manifest, ref)
        baseline_sites, records = read_pixels(archive, boxes, ref)

    cohorts, differences, thresholds = [], [], {}
    for threshold in DECISIONS:
        sites = [dict(s, fixed_bit=int(s["counts"] > threshold)) for s in baseline_sites]
        rounds = round_table(sites, records, ref)
        entry, groups, diff = summarize_threshold(threshold, rounds, sites, ref)
        cohorts.extend(groups)
        differences.extend(diff)
        thresholds[str(threshold)] = entry
        if threshold == DECISIONS[0]:
            baseline_rounds = rounds

    summary = {
        "source_doi": "10.21942/uva.28166483.v1", "archive_sha256": ref.PACKAGE_SHA,
        "source_manifest_sha256": ref.digest(args.source_manifest.read_bytes()),
        "evidence": "Same-series S23/P3 holdout in 88Sr; cross-apparatus comparison for Senoo 171Yb. CAL/VAL deferred.",
        "conditions": conditions, "rule": "Strict raw 3x3 pixel sum > T, frozen P1ROIs.dat; no offset or background subtraction.",
        "baseline_candidate": DECISIONS[0], "p2_log_compatible_integer_thresholds": list(DECISIONS[1:]),
        "minimum_first_frame_atoms": ref.MIN_ATOMS, "thresholds": thresholds,
        "p2_thresholds_matching_all_p3_decisions": [t for t in DECISIONS[1:] if thresholds[str(t)]["disagreements"] == 0],
        "decision_hash_encoding": "7200 ASCII 0/1 digits, numeric ascending shot, frame, zero-based ROI, no delimiters",
    }
    args.out.mkdir()
    with (args.out / "sites.csv.gz").open("wb") as raw, gzip.GzipFile(
            filename="", mode="wb", fileobj=raw, mtime=0) as compressed:
        with io.TextIOWrapper(compressed, encoding="utf-8", newline="") as stream:
            ref.write_csv(stream, baseline_sites[0], baseline_sites)
    write_csv(args.out / "rounds.csv", baseline_rounds, baseline_rounds[0], ref)
    write_csv(args.out / "cohorts.csv", cohorts, cohorts[0], ref)
    write_csv(args.out / "differences.csv", differences, ["threshold", *baseline_sites[0]], ref)
    (args.out / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")


if __name__ == "__main__":
    main()
