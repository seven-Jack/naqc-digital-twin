"""Compare the fixed P1 rectangle to the nine-window maximum on the public 88Sr data."""
import argparse
import csv
import gzip
import hashlib
import io
import json
import struct
from collections import Counter
from itertools import groupby
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile


BASE = "Datapackage_SLM/data/241129_S23/"
THRESHOLD = 6436
RULES = ("log_bit", "max_bit", "fixed_bit")
RUN_SHA = "c255745518bc30ceb181e202f2293dc0b5d7e6defe349c6584cd32632e3e078c"
MANIFEST_SHA = "b6ee5fe08ba1203c148b1a8d529355cb9e28295b88d9330aa87dc96c3e2d5415"
PRIOR_SHA = "97d0a7d6397bdfdec58dd5084e5508475f1c99b829b83a39086b5f3c62882ceb"
BOX_ROW = struct.Struct("<3H")


def digest(path):
    with path.open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def checked(data, expected, name):
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f"SHA-256 mismatch for {name}")
    return data


def source_geometry(archive, manifest):
    hashes = manifest["referenceSha256"]
    path = BASE + "params.dat"
    params = checked(archive.read(path), hashes[path], path).decode("ascii").splitlines()
    if f"threshold;{THRESHOLD};int" not in params:
        raise ValueError("Candidate threshold differs from the archived parameter")
    path = BASE + "P1ROIs.dat"
    lines = checked(archive.read(path), hashes[path], path).decode("ascii").splitlines()
    start = next(i for i, line in enumerate(lines) if line.split() == ["NrROIS", "36"])
    boxes = [list(map(int, line.split())) for line in lines[start + 1:] if line.strip()]
    if boxes != manifest["rawInstrumentRoiRectangles"] or len(boxes) != 36:
        raise ValueError("ROI roster differs from frozen raw bounds")
    for x0, y0, x1, y1 in boxes:
        if not (0 <= x0 < x1 <= 100 and 80 <= y0 < y1 <= 180 and x1 - x0 == y1 - y0 == 3):
            raise ValueError("Invalid half-open rectangle in the retained image")
    return boxes


def observations(args):
    run = json.loads(checked(args.run.read_bytes(), RUN_SHA, args.run))
    manifest = json.loads(checked(args.manifest.read_bytes(), MANIFEST_SHA, args.manifest))
    if digest(args.prior_sites) != PRIOR_SHA:
        raise ValueError("Unexpected nine-window baseline table")
    targets = set(run["finalLayout"]["targetSiteIds"])
    sites = []
    with ZipFile(args.archive) as archive, gzip.open(args.prior_sites, "rt", newline="") as f:
        prior = csv.DictReader(f)
        boxes = source_geometry(archive, manifest)
        for shot, trial in enumerate(run["attempts"], 1):
            stem = BASE + f"P1_{shot}"
            log = checked(archive.read(stem + ".dat"), manifest["logSha256"][stem + ".dat"], stem).splitlines()[-1].split()
            if list(map(int, log[2:5])) != [23, 1, shot] or trial["attemptId"] != f"P1_{shot}":
                raise ValueError(f"Unexpected round identity for {stem}")
            for frame, phase in enumerate(("initial", "final"), 1):
                src = trial[phase]
                name = stem + f"_{frame}.tga"
                raw = checked(archive.read(name), src["rawFrameSha256"], name)
                bits = log[-3 + frame].decode("ascii")
                if (src["rawFrameRef"] != name or src["occupancy"] != bits or len(bits) != 36
                        or struct.unpack_from("<HH", raw, 12) != (100, 180) or len(raw) != 36018):
                    raise ValueError(f"Frame or log mismatch for {name}")
                for roi, (x0, y0, x1, y1) in enumerate(boxes):
                    old = next(prior)
                    # Use the raw rectangle directly; it covers the same pixels as the cropped zero-offset window.
                    fixed_counts = sum(sum(BOX_ROW.unpack_from(raw, 18 + 2 * (100 * y + x0))) for y in range(y0, y1))
                    max_counts = int(old["roi_max_counts"])
                    fixed_bit, max_bit, log_bit = int(fixed_counts > THRESHOLD), int(max_counts > THRESHOLD), int(bits[roi])
                    target = int(f"roi{roi}" in targets)
                    expected = (shot, frame, roi, target, x0 + 1, y0 - 79, log_bit, max_bit, fixed_counts)
                    keys = ("shot", "frame", "roi", "target", "roi_x", "roi_y", "log_bit", "roi6436", "roi_sum_dx+0_dy+0")
                    if tuple(int(old[key]) for key in keys) != expected or fixed_counts > max_counts:
                        raise ValueError(f"Fixed sum, baseline or coordinates differ at {shot}/{frame}/{roi}")
                    status = {(False, False): "agreed", (True, False): "resolved",
                              (False, True): "introduced", (True, True): "persistent"}[max_bit != log_bit, fixed_bit != log_bit]
                    sites.append(dict(shot=shot, frame=frame, roi=roi, target=target, roi_x=x0 + 1, roi_y=y0 - 79,
                                      log_bit=log_bit, max_bit=max_bit, fixed_bit=fixed_bit, max_counts=max_counts,
                                      fixed_counts=fixed_counts, status=status))
        if next(prior, None) is not None or len(sites) != 7200:
            raise ValueError("Unexpected site-frame count")
    return run, manifest, sites


def per_round(run, sites):
    rows = []
    for shot, records in groupby(sites, key=lambda s: s["shot"]):
        sites_in_round = list(records)
        trial = run["attempts"][shot - 1]
        row = dict(shot=shot, attempt_id=trial["attemptId"], recorded_time=trial["recordedTime"])
        for f in (1, 2):
            frame = [s for s in sites_in_round if s["frame"] == f]
            for rule in RULES:
                bits = "".join(str(s[rule]) for s in frame)
                row[f"{rule}_pic{f}"] = bits
                row[f"{rule}_pic{f}_n"] = bits.count("1")
                if f == 2:
                    row[rule + "_missing_targets"] = " ".join(str(s["roi"]) for s in frame if s["target"] and not s[rule])
                    row[rule + "_filled_targets"] = sum(s["target"] * s[rule] for s in frame)
            for label in ("persistent", "resolved", "introduced"):
                row[f"pic{f}_{label}_rois"] = " ".join(str(s["roi"]) for s in frame if s["status"] == label)
        rows.append(row)
    return rows


def compare(sites):
    counts = Counter(s["status"] for s in sites)
    return {
        "denominator": len(sites), "before": counts["persistent"] + counts["resolved"],
        "after": counts["persistent"] + counts["introduced"], "resolved": counts["resolved"],
        "persistent": counts["persistent"], "introduced": counts["introduced"],
        "net_reduction": counts["resolved"] - counts["introduced"],
        "direction": {rule: {"log0_result1": sum(s["log_bit"] == 0 and s[rule] == 1 for s in sites),
                             "log1_result0": sum(s["log_bit"] == 1 and s[rule] == 0 for s in sites)}
                      for rule in ("max_bit", "fixed_bit")},
    }


def summarize(shot_ids, rounds, sites):
    chosen = [r for r in rounds if r["shot"] in shot_ids]
    sample = [s for s in sites if s["shot"] in shot_ids]
    n = len(chosen)
    def ratio(count, denominator):
        return {"n": count, "d": denominator}
    counts = {}
    for rule in RULES:
        filled = [r[rule + "_filled_targets"] for r in chosen]
        counts[rule] = {
            "initial_occupied": ratio(sum(r[rule + "_pic1_n"] for r in chosen), 36 * n),
            "final_occupied": ratio(sum(r[rule + "_pic2_n"] for r in chosen), 36 * n),
            "final_target_occupied": ratio(sum(filled), 16 * n), "full_target_rounds": ratio(filled.count(16), n),
        }
    return {"shots": sorted(shot_ids), "rounds": n, "counts": counts,
            "differences": {"all_site_frames": compare(sample), "pic1": compare([s for s in sample if s["frame"] == 1]),
                            "pic2": compare([s for s in sample if s["frame"] == 2]),
                            "pic2_targets": compare([s for s in sample if s["frame"] == 2 and s["target"]])}}


def write_csv(file, rows):
    writer = csv.DictWriter(file, fieldnames=rows[0], lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ("archive", "run", "manifest", "prior-sites", "out"):
        parser.add_argument("--" + key, required=True, type=Path)
    args = parser.parse_args()
    if args.out.exists() and (not args.out.is_dir() or any(args.out.iterdir())):
        raise ValueError("Use a new or empty output directory")
    run, manifest, sites = observations(args)
    rounds = per_round(run, sites)
    all_ids = set(range(1, 101))
    masks = {"all": all_ids}
    for name, rule in zip(("log", "max", "fixed"), RULES, strict=True):
        selected = {r["shot"] for r in rounds if r[rule + "_pic1_n"] >= 16}
        masks[name + "_ge16"], masks[name + "_lt16"] = selected, all_ids - selected
    logged, old, new = (masks[m + "_ge16"] for m in ("log", "max", "fixed"))
    masks.update(both_ge16=old & new, either_ge16=old | new, entered=new - old, exited=old - new,
                 neither_ge16=all_ids - old - new, fixed_only_vs_log=new - logged, log_only_vs_fixed=logged - new)
    groups = {k: summarize(ids, rounds, sites) for k, ids in masks.items()}
    if groups["all"]["differences"]["all_site_frames"]["before"] != 26 or len(old) != 44 or len(logged) != 40:
        raise ValueError("Previous 26 disagreements or previous entry rosters changed")
    report = {"evidence": "Cross-apparatus, 88Sr Knottnerus S23/P1, 813 nm tweezers; Senoo CAL/VAL deferred.",
              "method": "Strict >6436; half-open raw P1 rectangles. Fixed sum uses exactly the previous zero-offset 3 x 3 window.",
              "scope": "6436 is a candidate online threshold. Algorithm agreement is measured against instrument Pic1/Pic2.",
              "groups": groups, "equal_to_6436": {key: [[s["shot"], s["frame"], s["roi"]] for s in sites if s[key] == THRESHOLD]
                                                 for key in ("fixed_counts", "max_counts")},
              "input_sha256": {"archive": digest(args.archive), "run": RUN_SHA, "manifest": MANIFEST_SHA, "prior_sites": PRIOR_SHA,
                               "worker": digest(Path(__file__)), "original_public_zip": manifest["archiveSha256"],
                               "roi_file": manifest["referenceSha256"][BASE + "P1ROIs.dat"],
                               "params_file": manifest["referenceSha256"][BASE + "params.dat"]}}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=args.out.parent) as tmp:
        dest = Path(tmp) / "results"
        dest.mkdir()
        for name, table in (("rounds.csv", rounds), ("differences.csv", [s for s in sites if s["status"] != "agreed"])):
            with (dest / name).open("w", newline="", encoding="utf-8") as f:
                write_csv(f, table)
        with (dest / "sites.csv.gz").open("wb") as raw, gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as gz:
            with io.TextIOWrapper(gz, encoding="utf-8", newline="") as f:
                write_csv(f, sites)
        report["output_sha256"] = {n: digest(dest / n) for n in ("rounds.csv", "differences.csv", "sites.csv.gz")}
        (dest / "summary.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        dest.replace(args.out)
    print("Verified 100 P1 rounds, 200 images and 7200 zero-offset sums against the previous table.")


if __name__ == "__main__":
    main()
