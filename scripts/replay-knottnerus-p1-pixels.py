"""Replay the Fig. 2 offline classifier on the 200 original Knottnerus S23/P1 frames."""
import argparse
import ast
import csv
import gzip
import hashlib
import io
import json
import struct
from itertools import product
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile


BASE = "Datapackage_SLM/data/241129_S23/"
NOTEBOOK = "Datapackage_SLM/AnalyzeFastSLMMovesPaper.ipynb"
RUN_SHA = "c255745518bc30ceb181e202f2293dc0b5d7e6defe349c6584cd32632e3e078c"
MANIFEST_SHA = "b6ee5fe08ba1203c148b1a8d529355cb9e28295b88d9330aa87dc96c3e2d5415"
THRESHOLD = 6300
OFFSETS = list(product((-1, 0, 1), repeat=2))
SUM_COLUMNS = [f"sum_dx{dx:+d}_dy{dy:+d}" for dx, dy in OFFSETS]
TRIPLET = struct.Struct("<3H")
FOCUS_SHOTS = [6, 11, 14, 21, 44, 45, 47, 52, 54, 57, 72, 82, 85, 90]


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def checked(data, expected, name):
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f"SHA-256 mismatch: {name}")
    return data


def notebook_array(cell, name):
    for statement in ast.parse("".join(cell["source"])).body:
        if isinstance(statement, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in statement.targets):
            value = statement.value
            return ast.literal_eval(value.args[0] if isinstance(value, ast.Call) else value)
    raise ValueError(f"Missing author array: {name}")


def inspect_frame(raw, centers, log_bits, shot, frame, targets):
    width, height = struct.unpack_from("<HH", raw, 12)
    if (width, height) != (100, 180) or len(raw) != 18 + 2 * width * height:
        raise ValueError(f"Unexpected TGA dimensions or payload length: P1_{shot}_{frame}")
    crop_y = height - width  # Notebook cell 2 retains the last width rows.
    observations = []
    for roi, (x, y) in enumerate(centers):
        if not (2 <= x < width - 2 and 2 <= y < width - 2):
            raise ValueError(f"ROI {roi} has a truncated candidate window")
        sums = []
        for dx, dy in OFFSETS:
            left = x + dx - 1
            top = y + crop_y + dy - 1
            total = 0
            for row in range(top, top + 3):
                total += sum(TRIPLET.unpack_from(raw, 18 + 2 * (row * width + left)))
            sums.append(total)
        maximum = max(sums)
        best_dx, best_dy = OFFSETS[sums.index(maximum)]
        obs = {
            "shot": shot, "frame": frame, "roi": roi, "target": int(roi in targets),
            "x_cropped": x, "y_cropped": y, "max_counts": maximum,
            "best_dx": best_dx, "best_dy": best_dy, "n_max_ties": sums.count(maximum),
            "margin_counts": maximum - THRESHOLD, "log_bit": int(log_bits[roi]),
            "pixel_bit": int(maximum > THRESHOLD),
        }
        obs.update(zip(SUM_COLUMNS, sums))
        observations.append(obs)
    return observations


def read_inputs(args):
    run = json.loads(checked(args.run.read_bytes(), RUN_SHA, args.run))
    manifest = json.loads(checked(args.manifest.read_bytes(), MANIFEST_SHA, args.manifest))
    rows, observations = [], []
    with ZipFile(args.archive) as archive:
        names = archive.namelist()
        if len(set(names)) != len(names):
            raise ValueError("Duplicate member paths in input ZIP")
        notebook_sha = manifest["referenceSha256"][NOTEBOOK]
        cells = json.loads(checked(archive.read(NOTEBOOK), notebook_sha, NOTEBOOK))["cells"]
        centers = notebook_array(cells[4], "rois_sort_6x6")
        targets = notebook_array(cells[9], "targets")
        if centers != manifest["offlineNotebookCentersInCroppedPixels"] or len(centers) != 36:
            raise ValueError("Cropped ROI centers differ from the archived author coordinates")
        if [f"roi{i}" for i in targets] != run["finalLayout"]["targetSiteIds"] or len(set(targets)) != 16:
            raise ValueError("Target subset differs from frozen run")
        header = archive.read(BASE + "P1_1.dat").decode("ascii").splitlines()[0].split()
        for shot, attempt in enumerate(run["attempts"], 1):
            stem = BASE + f"P1_{shot}"
            name = stem + ".dat"
            if attempt["attemptId"] != f"P1_{shot}" or attempt["sourceRef"] != name:
                raise ValueError(f"Unexpected round or source in frozen input: {shot}")
            dat = checked(archive.read(name), manifest["logSha256"][name], name)
            lines = [line.split() for line in dat.decode("ascii").splitlines() if line.strip()]
            if shot == 1:
                lines = lines[1:]
            if len(lines) != 1 or len(lines[0]) != len(header):
                raise ValueError(f"Unexpected log format: {name}")
            log = dict(zip(header, lines[0]))
            if [int(log[k]) for k in ("Series", "DataSetNr", "RunNr")] != [23, 1, shot]:
                raise ValueError(f"Log identity mismatch: {name}")
            row = {"shot": shot, "attempt": attempt["attemptId"], "recorded_time": attempt["recordedTime"]}
            for frame, phase in enumerate(("initial", "final"), 1):
                frame_source = attempt[phase]
                frame_name = stem + f"_{frame}.tga"
                log_bits = log[f"Pic{frame}"]
                if frame_name != frame_source["rawFrameRef"] or log_bits != frame_source["occupancy"]:
                    raise ValueError(f"Frame or online bit string mismatch: {frame_name}")
                raw = checked(archive.read(frame_name), frame_source["rawFrameSha256"], frame_name)
                sites = inspect_frame(raw, centers, log_bits, shot, frame, targets)
                observations.extend(sites)
                prefix = f"pic{frame}"
                row[prefix + "_member"] = frame_name
                row[prefix + "_sha256"] = frame_source["rawFrameSha256"]
                for method in ("log", "pixel"):
                    bits = "".join(str(s[method + "_bit"]) for s in sites)
                    row[f"{prefix}_{method}_bits"] = bits
                    row[f"{prefix}_{method}_ones"] = bits.count("1")
                    if frame == 2:
                        missing = [roi for roi in targets if bits[roi] == "0"]
                        row[method + "_target_ones"] = len(targets) - len(missing)
                        row[method + "_missing_targets"] = " ".join(map(str, missing))
                row[prefix + "_diff_rois"] = " ".join(str(s["roi"]) for s in sites if s["log_bit"] != s["pixel_bit"])
            rows.append(row)
    if len(rows) != 100 or len(observations) != 7200:
        raise ValueError("Incomplete S23/P1 acquisition")
    return manifest, notebook_sha, centers, targets, rows, observations


def ratio(numerator, denominator):
    return {"n": numerator, "d": denominator}


def group(rows, sites, ids):
    trials = [r for r in rows if r["shot"] in ids]
    selected = [s for s in sites if s["shot"] in ids]
    result = {"rounds": len(trials)}
    for method in ("log", "pixel"):
        n = len(trials)
        result[method] = {
            "initial_occupied": ratio(sum(t[f"pic1_{method}_ones"] for t in trials), 36 * n),
            "final_occupied": ratio(sum(t[f"pic2_{method}_ones"] for t in trials), 36 * n),
            "final_target_occupied": ratio(sum(t[method + "_target_ones"] for t in trials), 16 * n),
            "full_target_rounds": ratio(sum(t[method + "_target_ones"] == 16 for t in trials), n),
        }
    for label, sample in (
        ("pic1", [s for s in selected if s["frame"] == 1]),
        ("pic2", [s for s in selected if s["frame"] == 2]),
        ("pic2_targets", [s for s in selected if s["frame"] == 2 and s["target"]]),
        ("all_site_frames", selected),
    ):
        different = [s for s in sample if s["log_bit"] != s["pixel_bit"]]
        result[label] = {
            "different": ratio(len(different), len(sample)),
            "log0_pixel1": sum(s["pixel_bit"] for s in different),
            "log1_pixel0": sum(s["log_bit"] for s in different),
            "max_exactly_6300": sum(s["max_counts"] == THRESHOLD for s in sample),
            "affected_rounds": sorted({s["shot"] for s in different}),
        }
    return result


def summarize(rows, sites):
    all_shots = {r["shot"] for r in rows}
    eligible = {m: {r["shot"] for r in rows if r[f"pic1_{m}_ones"] >= 16} for m in ("log", "pixel")}
    online, offline = eligible["log"], eligible["pixel"]
    masks = {"all": all_shots, "log_ge16": online, "pixel_ge16": offline, "both_ge16": online & offline,
             "log_only_ge16": online - offline, "pixel_only_ge16": offline - online, "neither_ge16": all_shots - online - offline}
    actual_focus = [r["shot"] for r in rows if r["shot"] in online and r["log_target_ones"] < 16]
    if actual_focus != FOCUS_SHOTS:
        raise ValueError("Frozen online defect cohort differs from the archived intake")
    return {
        "groups": {name: group(rows, sites, ids) for name, ids in masks.items()},
        "selection_shots": {name: sorted(ids) for name, ids in masks.items() if name != "all"},
        "online_eligible_defects": [
            {k: r[k] for k in ("shot", "pic1_log_ones", "pic1_pixel_ones", "log_target_ones", "pixel_target_ones",
                                "log_missing_targets", "pixel_missing_targets", "pic1_diff_rois", "pic2_diff_rois")}
            for r in rows if r["shot"] in FOCUS_SHOTS
        ],
        "roi14_special": [s for s in sites if s["roi"] == 14 and s["shot"] in (16, 40)],
    }


def write_table(file, rows):
    writer = csv.DictWriter(file, fieldnames=rows[0].keys(), lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ("archive", "run", "manifest", "out"):
        parser.add_argument("--" + key, type=Path, required=True)
    args = parser.parse_args()
    if args.out.exists() and (not args.out.is_dir() or any(args.out.iterdir())):
        raise ValueError(f"Use a new or empty result directory: {args.out}")
    manifest, notebook_sha, centers, targets, rows, sites = read_inputs(args)
    report = summarize(rows, sites)
    report.update({
        "evidence": "Cross-apparatus reproduction of published 88Sr SLM image decisions; Senoo CAL/VAL deferred.",
        "source_doi": manifest["datasetDoi"], "original_archive_sha256": manifest["archiveSha256"],
        "input_zip_sha256": digest(args.archive), "notebook_sha256": notebook_sha, "run_sha256": RUN_SHA,
        "manifest_sha256": MANIFEST_SHA, "worker_sha256": digest(Path(__file__)),
        "input_verified": {"raw_frames": 200, "raw_round_logs": 100, "author_notebook": 1},
        "settings": {"crop": "raw rows 80:180, columns 0:100; little-endian uint16 after 18 bytes",
                     "roi_centers_cropped_xy": centers, "target_rois_0based": targets, "offset_xy_order": OFFSETS,
                     "rule": "max of nine 3x3 sums > 6300 counts; zero-based ROI indexing",
                     "first_frame_selection": "at least 16 occupied out of 36; applied independently by decision source"},
        "individual_transport_survival": {"identified_outcomes": 0, "actual_moves": None},
    })
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=args.out.parent, prefix=".knottnerus-p1-") as tmp:
        result = Path(tmp) / "result"
        result.mkdir()
        with (result / "rounds.csv").open("w", encoding="utf-8", newline="") as f:
            write_table(f, rows)
        with (result / "sites.csv.gz").open("wb") as f, gzip.GzipFile(filename="", fileobj=f, mode="wb", mtime=0) as gz:
            with io.TextIOWrapper(gz, encoding="utf-8", newline="") as csv_file:
                write_table(csv_file, sites)
        report["output_sha256"] = {name: digest(result / name) for name in ("rounds.csv", "sites.csv.gz")}
        (result / "summary.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        result.replace(args.out)
    print("P1 replay complete: 100 rounds, 200 frames, 7200 site-frame decisions")


if __name__ == "__main__":
    main()
