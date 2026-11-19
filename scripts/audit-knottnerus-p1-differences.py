"""Controlled threshold and coordinate comparisons for the published 88Sr S23/P1 images."""

import argparse
import ast
import csv
import gzip
import importlib.util
import io
import json
from itertools import groupby, product
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile


# The earlier replay owns the TGA reader, crop, nine-window sum and frozen input validation.
helper_file = Path(__file__).with_name("replay-knottnerus-p1-pixels.py")
spec = importlib.util.spec_from_file_location("knottnerus_p1", helper_file)
replay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(replay)

PRIOR_SITES_SHA256 = "7eeadba9b6679ae54807416baad5221d9fa11b0971a40a48e965eb3bb6bc8d4e"
STAGES = ("log_bit", "author6300", "author6436", "roi6436")
SIX = (5, 9, 30, 83, 93, 96)
CANDIDATE = 6436


def geometry(archive, manifest, author_centers):
    roi_file = replay.BASE + "P1ROIs.dat"
    params_file = replay.BASE + "params.dat"
    control_hashes = manifest["referenceSha256"]
    roi_text = replay.checked(archive.read(roi_file), control_hashes[roi_file], roi_file).decode("ascii")
    params_text = replay.checked(archive.read(params_file), control_hashes[params_file], params_file).decode("ascii")
    config = {parts[0]: parts[1] for line in params_text.splitlines() if line.strip()
              for parts in [line.split(";")]}
    if int(config["threshold"]) != CANDIDATE:
        raise ValueError("Candidate does not match the archived batch parameter")
    parameter_boxes = ast.literal_eval(config["rois"])
    lines = roi_text.splitlines()
    start = next(i for i, s in enumerate(lines) if s.split() == ["NrROIS", "36"])
    rectangles = [list(map(int, s.split())) for s in lines[start + 1:] if s.strip()]
    if rectangles != manifest["rawInstrumentRoiRectangles"] or len(rectangles) != len(parameter_boxes) or len(rectangles) != 36:
        raise ValueError("ROI roster differs from source manifest")
    rows = []
    for roi, ((left, top, right, bottom), (x, y), parameter_box) in enumerate(zip(rectangles, author_centers, parameter_boxes)):
        if right - left != 3 or bottom - top != 3:
            raise ValueError(f"ROI {roi} is not 3 x 3 under the half-open interpretation")
        roi_x, roi_y = left + 1, top - 80 + 1
        cropped_box = [left, right, top - 80, bottom - 80]
        rows.append({"roi": roi, "raw_box_xyxy": rectangles[roi], "author_cropped_xy": [x, y],
                     "roi_cropped_xy": [roi_x, roi_y], "shift_xy": [roi_x - x, roi_y - y],
                     "params_cropped_xxyy": parameter_box, "box_matches_params": cropped_box == parameter_box})
    return rows


def collect(args):
    manifest, notebook_sha, centers, targets, previous_rounds, baseline = replay.read_inputs(args)
    if replay.digest(args.prior_sites) != PRIOR_SITES_SHA256:
        raise ValueError("Unexpected previous site table")
    with gzip.open(args.prior_sites, "rt", newline="") as file:
        previous = list(csv.DictReader(file))
    if len(previous) != len(baseline):
        raise ValueError("Incomplete previous site table")
    with ZipFile(args.archive) as archive:
        coordinates = geometry(archive, manifest, centers)
        new_centers = [c["roi_cropped_xy"] for c in coordinates]
        sites = []
        for (shot, frame), sample in groupby(baseline, key=lambda s: (s["shot"], s["frame"])):
            original = list(sample)
            bits = "".join(str(r["log_bit"]) for r in original)
            name = replay.BASE + f"P1_{shot}_{frame}.tga"
            raw = archive.read(name)
            updated = replay.inspect_frame(raw, new_centers, bits, shot, frame, targets)
            for old, new in zip(original, updated, strict=True):
                prior = previous[len(sites)]
                fields = ("shot", "frame", "roi", "x_cropped", "y_cropped", "log_bit", "pixel_bit", "max_counts", *replay.SUM_COLUMNS)
                if any(int(prior[f]) != old[f] for f in fields):
                    raise ValueError(f"Frozen sums or decisions not reproduced for {name}, ROI {old['roi']}")
                author_sum = int(prior["max_counts"])
                row = {"shot": shot, "frame": frame, "roi": old["roi"], "target": old["target"], "log_bit": old["log_bit"],
                       "author_x": old["x_cropped"], "author_y": old["y_cropped"],
                       "roi_x": new["x_cropped"], "roi_y": new["y_cropped"],
                       "author_max_counts": author_sum, "roi_max_counts": new["max_counts"],
                       "author6300": int(author_sum > replay.THRESHOLD), "author6436": int(author_sum > CANDIDATE),
                       "roi6436": int(new["max_counts"] > CANDIDATE)}
                for field in replay.SUM_COLUMNS:
                    row["roi_" + field] = new[field]
                sites.append(row)
    return manifest, notebook_sha, targets, previous_rounds, coordinates, sites


def round_table(sites, previous_rounds):
    rounds = []
    for shot, samples in groupby(sites, key=lambda s: s["shot"]):
        observations = list(samples)
        row = {"shot": shot, "attempt_id": f"P1_{shot}", "recorded_time": previous_rounds[shot - 1]["recorded_time"]}
        for frame in (1, 2):
            sample = [s for s in observations if s["frame"] == frame]
            for stage in STAGES:
                bits = "".join(str(s[stage]) for s in sample)
                row[f"{stage}_pic{frame}"] = bits
                row[f"{stage}_pic{frame}_n"] = bits.count("1")
                if frame == 2:
                    missing = [s["roi"] for s in sample if s["target"] and not s[stage]]
                    row[f"{stage}_missing_targets"] = " ".join(map(str, missing))
                    row[f"{stage}_filled_targets"] = sum(s["target"] * s[stage] for s in sample)
                if stage != "log_bit":
                    row[f"{stage}_pic{frame}_diff_rois"] = " ".join(str(s["roi"]) for s in sample if s[stage] != s["log_bit"])
        rounds.append(row)
    return rounds


def compare(sample):
    # Encode error membership vs Pic1 or Pic2 at A=author6300, B=author6436, C=roi6436.
    patterns = {"".join(bits): 0 for bits in product("01", repeat=3)}
    for s in sample:
        key = "".join(str(int(s[stage] != s["log_bit"])) for stage in STAGES[1:])
        patterns[key] += 1
    pairs = {}
    for previous, current in ((0, 1), (1, 2), (0, 2)):
        previous_bad = sum(n for bits, n in patterns.items() if bits[previous] == "1")
        kept = sum(n for bits, n in patterns.items() if bits[previous] == bits[current] == "1")
        introduced = sum(n for bits, n in patterns.items() if bits[previous] == "0" and bits[current] == "1")
        resolved = previous_bad - kept
        pairs[STAGES[previous + 1] + "_to_" + STAGES[current + 1]] = {
            "before": previous_bad, "corrected": resolved, "still_different": kept, "introduced": introduced,
            "after": kept + introduced, "net_reduction": resolved - introduced,
        }
    stages = {}
    for stage in STAGES[1:]:
        stages[stage] = {
            "log0_result1": sum(s[stage] == 1 and s["log_bit"] == 0 for s in sample),
            "log1_result0": sum(s[stage] == 0 and s["log_bit"] == 1 for s in sample),
        }
    return {"denominator": len(sample), "error_membership_ABC": patterns, "transitions": pairs, "direction": stages}


def group_report(rounds, sites, ids):
    selected_rows = [r for r in rounds if r["shot"] in ids]
    sample = [s for s in sites if s["shot"] in ids]
    n = len(selected_rows)
    counts = {}
    for stage in STAGES:
        counts[stage] = {
            "initial_occupied": replay.ratio(sum(r[f"{stage}_pic1_n"] for r in selected_rows), n * 36),
            "final_occupied": replay.ratio(sum(r[f"{stage}_pic2_n"] for r in selected_rows), n * 36),
            "final_target_occupied": replay.ratio(sum(r[f"{stage}_filled_targets"] for r in selected_rows), n * 16),
            "full_target_rounds": replay.ratio(sum(r[f"{stage}_filled_targets"] == 16 for r in selected_rows), n),
        }
    return {"rounds": n, "counts": counts, "differences": {
        "all_site_frames": compare(sample), "pic1": compare([s for s in sample if s["frame"] == 1]),
        "pic2": compare([s for s in sample if s["frame"] == 2]),
        "pic2_targets": compare([s for s in sample if s["frame"] == 2 and s["target"]]),
    }}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ("archive", "run", "manifest", "prior-sites", "out"):
        parser.add_argument("--" + key, type=Path, required=True)
    args = parser.parse_args()
    if args.out.exists() and (not args.out.is_dir() or any(args.out.iterdir())):
        raise ValueError("Use a new or empty output directory")
    manifest, notebook_sha, targets, previous, coordinates, sites = collect(args)
    rounds = round_table(sites, previous)
    all_ids = {r["shot"] for r in rounds}
    masks = {"all": all_ids}
    for name, stage in zip(("log", "author6300", "author6436", "roi6436"), STAGES, strict=True):
        ids = {r["shot"] for r in rounds if r[f"{stage}_pic1_n"] >= 16}
        masks[name + "_ge16"] = ids
        masks[name + "_lt16"] = all_ids - ids
    masks["original_six"] = masks["author6300_ge16"] - masks["log_ge16"]
    if masks["original_six"] != set(SIX) or masks["log_ge16"] - masks["author6300_ge16"]:
        raise ValueError("Initial cohort differs from the archived 40/46 comparison")
    differences = [s for s in sites if any(s[k] != s["log_bit"] for k in STAGES[1:])]
    if sum(s["log_bit"] != s["author6300"] for s in differences) != 39:
        raise ValueError("Original 39 differences were not recovered")
    report = {
        "evidence": "Cross-apparatus conditional comparison on Knottnerus 88Sr S23/P1, not Senoo calibration.",
        "threshold_scope": "6436 is a candidate based on the analysis setting in S23/params.dat; actual online rule unverified.",
        "method": "For P1ROIs.dat use raw rectangles as half-open [x0,x1),[y0,y1), center=(x0+1,y0+1); subtract 80 rows. "
                  "Every branch retains the same maximum over nine 3 x 3 sums and strict greater-than test.",
        "method_limits": "Half-open indexing is a coordinate interpretation, not a measured description of the online detector.",
        "error_pattern_order": ["author6300", "author6436", "roi6436"],
        "coordinate_audit": coordinates, "target_rois": targets,
        "equalities": {key: sum(s[key] == threshold for s in sites) for key, threshold in (
            ("author_max_counts", CANDIDATE), ("roi_max_counts", CANDIDATE))},
        "selection_shots": {k: sorted(v) for k, v in masks.items()},
        "groups": {k: group_report(rounds, sites, ids) for k, ids in masks.items()},
        "special_roi14": [s for s in sites if s["shot"] in (6, 16, 40) and s["roi"] == 14],
        "special_six": [r for r in rounds if r["shot"] in SIX],
        "input_sha256": {"archive": replay.digest(args.archive), "run": replay.digest(args.run), "manifest": replay.digest(args.manifest),
                         "prior_sites": PRIOR_SITES_SHA256, "original_public_zip": manifest["archiveSha256"], "author_notebook": notebook_sha,
                         "roi_file": manifest["referenceSha256"][replay.BASE + "P1ROIs.dat"],
                         "params_file": manifest["referenceSha256"][replay.BASE + "params.dat"],
                         "baseline_helper": replay.digest(helper_file), "worker": replay.digest(Path(__file__))},
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=args.out.parent) as tmp:
        directory = Path(tmp) / "results"
        directory.mkdir()
        for name, table in (("rounds.csv", rounds), ("differences.csv", differences)):
            with (directory / name).open("w", encoding="utf-8", newline="") as f:
                replay.write_table(f, table)
        with (directory / "sites.csv.gz").open("wb") as out, gzip.GzipFile(filename="", fileobj=out, mode="wb", mtime=0) as gz:
            with io.TextIOWrapper(gz, encoding="utf-8", newline="") as f:
                replay.write_table(f, sites)
        report["output_sha256"] = {name: replay.digest(directory / name) for name in ("rounds.csv", "differences.csv", "sites.csv.gz")}
        (directory / "summary.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        directory.replace(args.out)
    print("Compared 100 rounds / 200 original frames / 7200 site-frames, with all 39 baseline differences verified.")


if __name__ == "__main__":
    main()
