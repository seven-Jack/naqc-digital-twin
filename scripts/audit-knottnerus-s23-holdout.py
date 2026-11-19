"""Replay one prespecified S23 holdout against frozen P1 rectangles and P2 integer thresholds."""
import argparse
import ast
from datetime import datetime
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
from zipfile import ZipFile


P3_SCRIPT_SHA = "2abc7d677fe51abbf2015f16f761f4ec8e131beb5d3dfd8f3be168b8178b7fab"



def reference_methods():
    path = Path(__file__).with_name("audit-knottnerus-s23-p3.py")
    if hashlib.sha256(path.read_bytes()).hexdigest() != P3_SCRIPT_SHA:
        raise ValueError("P3 reference implementation differs from v0.1.4")
    spec = importlib.util.spec_from_file_location("p3", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module, module.load_reference()


def inspect_inputs(archive, manifest, ref, point):
    label = f"P{point}"
    names = archive.namelist()
    ref.require(len(set(names)) == len(names), "Duplicate ZIP entries")
    ref.require(manifest["archive_sha256"] == ref.PACKAGE_SHA, "Unexpected full author archive hash")
    required = {ref.BASE + f"{label}_{shot}{extension}" for shot in ref.SHOTS
                for extension in (".dat", "_1.tga", "_2.tga")}
    raw_paths = {name for name in names if re.fullmatch(re.escape(ref.BASE) + rf"{label}_\d+(?:\.dat|_\d+\.tga)", name)}
    ref.require(raw_paths == required, "Unexpected holdout round logs or image roster")
    controls = (".txt", "ROIs.dat", "_timinglist.dat", "_outputlist.dat")
    required.update(ref.BASE + f"P{dataset}{suffix}" for dataset in (1, point) for suffix in controls)
    required.update((ref.NOTEBOOK, ref.BASE + "params.dat"))
    hashes = manifest["member_sha256"]
    ref.require(required <= hashes.keys(), "Incomplete source manifest")
    for name, digest in hashes.items():
        ref.require(ref.digest(archive.read(name)) == digest, "Source member hash: " + name)
    comparisons = {}
    for suffix in controls:
        p1, current = (hashes[ref.BASE + f"P{dataset}{suffix}"] for dataset in (1, point))
        comparisons[suffix] = dict(p1_sha256=p1, holdout_sha256=current, identical=p1 == current)
        if suffix != ".txt":
            ref.require(p1 == current, "Different holdout geometry/timing/output: " + suffix)
    ref.require(comparisons["ROIs.dat"]["p1_sha256"] == ref.P1_ROI_SHA, "Frozen P1 ROI changed")
    p1, current = (archive.read(ref.BASE + f"P{dataset}.txt").decode().splitlines() for dataset in (1, point))
    differences = []
    for line, (before, after) in enumerate(zip(p1, current, strict=True), 1):
        if before == after:
            continue
        key = before.partition("=")[0]
        allowed = key in ("DRbRepumpDPAOMB2Intensity1", "DLastEndTime") or re.fullmatch(r"SLastMessageList\d+", key)
        ref.require(allowed and key == after.partition("=")[0], "Other holdout control differs: " + key)
        differences.append(dict(line=line, p1=before, holdout=after))
    settings = [current[i-1] for i in (*range(519, 527), 530)]
    ref.require("DSortAtomsWithSLMImagingDuration=200.00000" in settings
                and "BSortAtomsTakeVerificationImage=TRUE" in settings, "Missing expected nominal imaging settings")
    ref.require("threshold;6436;int" in archive.read(ref.BASE + "params.dat").decode().splitlines(),
                "Candidate setting changed")
    code = json.loads(archive.read(ref.NOTEBOOK))["cells"][9]["source"]
    target_line = next(line for line in code if line.startswith("targets = "))
    ref.require(tuple(ast.literal_eval(target_line.partition("=")[2].strip())) == ref.TARGETS, "Target ROI indices changed")
    boxes = ref.rectangle_table(archive.read(ref.BASE + "P1ROIs.dat"))
    conditions = dict(comparison=comparisons, source_members_verified=len(hashes),
                      control_text_changes=differences, program_imaging_settings=settings,
                      image_width=100, image_height=180, image_header_hex=ref.TGA_HEADER.hex(),
                      rounds=len(ref.SHOTS), paired_frames=2*len(ref.SHOTS), targets_zero_based=ref.TARGETS,
                      p1_rectangles_sha256=ref.P1_ROI_SHA)
    return boxes, conditions


def read_shots(archive, boxes, p3, ref, point):
    records, sites = {}, []
    previous = None
    for shot in ref.SHOTS:
        attempt = f"P{point}_{shot}"
        stem = ref.BASE + attempt
        log_path = stem + ".dat"
        rows = [line.split() for line in archive.read(log_path).decode("ascii").splitlines() if line.strip()]
        if shot == 1:
            ref.require(rows[0] == p3.SOURCE_HEADER, "Unexpected holdout log columns")
        if rows[0] == p3.SOURCE_HEADER:
            rows = rows[1:]
        ref.require(len(rows) == 1, "Expected one round in " + log_path)
        log = dict(zip(p3.SOURCE_HEADER, rows[0], strict=True))
        ref.require((log["Series"], log["DataSetNr"], log["RunNr"]) == ("23", str(point), str(shot)), log_path)
        timestamp = log["Date"] + " " + log["Time"]
        instant = datetime.strptime(timestamp, "%Y.%m.%d %H:%M:%S::%f")
        ref.require(previous is None or instant > previous, "Round chronology: " + log_path)
        previous = instant
        records[shot] = dict(shot=shot, attempt_id=attempt, recorded_time=timestamp,
                             source_log=log_path, logged_scan_field=log["RbRepumpDPAOMB2Intensity1"])
        for frame in (1, 2):
            path = stem + f"_{frame}.tga"
            bits, image = log[f"Pic{frame}"], archive.read(path)
            ref.require(re.fullmatch("[01]{36}", bits), "Malformed Pic bits: " + log_path)
            ref.require(image[:18] == ref.TGA_HEADER and len(image) == 36018, "Image format: " + path)
            for roi, (x0, y0, x1, y1) in enumerate(boxes):
                counts = sum(sum(ref.ROW_SUM.unpack_from(image, 18 + 2*(100*y+x0))) for y in range(y0, y1))
                sites.append(dict(shot=shot, frame=frame, roi=roi, target=int(roi in ref.TARGETS),
                                  raw_x0=x0, raw_y0=y0, raw_x1_exclusive=x1, raw_y1_exclusive=y1,
                                  counts=counts, log_bit=int(bits[roi]), fixed_bit=int(counts > ref.THRESHOLD),
                                  frame_member=path, log_member=log_path))
    return records, sites


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ("archive", "source_manifest", "freeze", "out"):
        parser.add_argument(arg, type=Path)
    args = parser.parse_args()
    p3, ref = reference_methods()
    ref.require(not args.out.exists(), "Output directory already exists")
    manifest_bytes = args.source_manifest.read_bytes()
    freeze_bytes = args.freeze.read_bytes()
    freeze = json.loads(freeze_bytes)
    point = freeze["dataset_nr"]
    ref.require(type(point) is int and freeze["batch"] == f"241129_S23/P{point}", "Invalid frozen batch")
    ref.require(freeze["strict_gt_candidate_counts"] == ref.THRESHOLD
                and freeze["p1_roi_sha256"] == ref.P1_ROI_SHA
                and freeze["p2_log_compatible_integer_thresholds"] == list(p3.DECISIONS[1:]),
                "P1/P2 freeze differs from the published rules")
    focus = freeze["p3_p4_matching_focus_integer_thresholds"]
    ref.require(focus == list(range(6499, 6508)), "Unexpected P3/P4 focus")
    manifest = json.loads(manifest_bytes)
    ref.require(manifest["batch"] == freeze["batch"], "Manifest and frozen batch differ")
    with ZipFile(args.archive) as archive:
        boxes, conditions = inspect_inputs(archive, manifest, ref, point)
        records, baseline_sites = read_shots(archive, boxes, p3, ref, point)
    cohorts, differences, thresholds = [], [], {}
    for threshold in p3.DECISIONS:
        sites = [dict(site, fixed_bit=int(site["counts"] > threshold)) for site in baseline_sites]
        rounds = p3.round_table(sites, records, ref)
        entry, groups, diff = p3.summarize_threshold(threshold, rounds, sites, ref)
        thresholds[str(threshold)] = entry
        cohorts.extend(groups)
        differences.extend(diff)
        if threshold == ref.THRESHOLD:
            baseline_rounds = rounds

    matching = [t for t in p3.DECISIONS[1:] if not thresholds[str(t)]["disagreements"]]
    summary = dict(batch=freeze["batch"], freeze_sha256=ref.digest(freeze_bytes), source_doi="10.21942/uva.28166483.v1",
                   archive_sha256=ref.PACKAGE_SHA, source_manifest_sha256=ref.digest(manifest_bytes),
                   evidence="Same-sequence holdout on Knottnerus 88Sr; cross-apparatus comparison for Senoo 171Yb.",
                   conditions=conditions, rule="Strict raw 3x3 pixel sum > T in frozen P1 rectangles, without offsets or background correction.",
                   baseline_candidate=ref.THRESHOLD, p2_log_compatible_integer_thresholds=list(p3.DECISIONS[1:]),
                   p3_p4_focus_thresholds=focus, p2_thresholds_matching_all_holdout_decisions=matching,
                   focus_matching_all_holdout_decisions=[t for t in focus if t in matching],
                   minimum_first_frame_atoms=ref.MIN_ATOMS, thresholds=thresholds,
                   decision_hash_encoding="7200 ASCII 0/1 digits, ascending shot/frame/zero-based ROI, no delimiters")
    args.out.mkdir()
    with (args.out / "sites.csv.gz").open("wb") as raw, gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as gz:
        with io.TextIOWrapper(gz, encoding="utf-8", newline="") as stream:
            ref.write_csv(stream, baseline_sites[0], baseline_sites)
    p3.write_csv(args.out / "rounds.csv", baseline_rounds, baseline_rounds[0], ref)
    p3.write_csv(args.out / "cohorts.csv", cohorts, cohorts[0], ref)
    p3.write_csv(args.out / "differences.csv", differences, ["threshold", *baseline_sites[0]], ref)
    (args.out / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")


if __name__ == "__main__":
    main()
