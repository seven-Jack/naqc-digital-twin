"""Check the P4 holdout's counts, rosters and threshold comparisons independently from the original frames."""
import argparse
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
from zipfile import ZipFile

import numpy as np


def reference_methods():
    path = Path(__file__).with_name("verify-knottnerus-s23-p3.py")
    if hashlib.sha256(path.read_bytes()).hexdigest() != "306f6f8f1426f22ef719fd61d61e6e0880bcc343f64dcca5c27ad64c75575ffa":
        raise ValueError("P3 verifier differs from v0.1.4")
    spec = importlib.util.spec_from_file_location("p3_verify", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_raw(archive, ref):
    names = archive.namelist()
    ref.require(len(set(names)) == len(names), "Duplicate source paths")
    expected = {ref.BASE + f"P4_{s}{ext}" for s in range(1, 101) for ext in (".dat", "_1.tga", "_2.tga")}
    pattern = re.compile(re.escape(ref.BASE) + r"P4_\d+(?:\.dat|_\d+\.tga)")
    ref.require({n for n in names if pattern.fullmatch(n)} == expected, "P4 source roster")
    raw_boxes = archive.read(ref.BASE + "P1ROIs.dat")
    ref.require(hashlib.sha256(raw_boxes).hexdigest() == ref.P1_ROI_SHA and
                raw_boxes == archive.read(ref.BASE + "P4ROIs.dat"), "P1/P4 frozen ROI geometry")
    boxes = np.loadtxt(io.BytesIO(raw_boxes), skiprows=4, dtype=np.int64)
    ref.require(boxes.shape == (36, 4) and np.all(boxes[:, 2:] - boxes[:, :2] == 3), "Window size")
    left, top, right, bottom = boxes.T
    counts = np.empty((100, 2, 36), dtype=np.int64)
    logged = np.empty(counts.shape, dtype=bool)
    logs = []
    header = archive.read(ref.BASE + "P4_1.dat").decode("ascii").splitlines()[0].split()
    for shot in range(1, 101):
        stem = ref.BASE + f"P4_{shot}"
        rows = [l.split() for l in archive.read(stem + ".dat").decode("ascii").splitlines() if l.strip()]
        if rows[0] == header:
            rows = rows[1:]
        ref.require(len(rows) == 1, "Expected one DAT record: " + stem)
        record = dict(zip(header, rows[0], strict=True))
        ref.require([int(record[k]) for k in ("Series", "DataSetNr", "RunNr")] == [23, 4, shot], "Round: " + stem)
        logs.append(record)
        for f in range(2):
            path = stem + f"_{f + 1}.tga"
            raw = archive.read(path)
            ref.require(raw[:18] == ref.TGA_HEADER and len(raw) == 36018, "TGA format: " + path)
            bits = record[f"Pic{f + 1}"]
            ref.require(re.fullmatch(r"[01]{36}", bits), "Malformed Pic bits: " + stem)
            logged[shot-1, f] = [b == "1" for b in bits]
            image = np.frombuffer(raw, dtype="<u2", offset=18).reshape(180, 100)
            # Four cumulative-image corners give each rectangular sum independently of the direct pixel loop.
            integral = np.pad(image.cumsum(axis=0, dtype=np.int64).cumsum(axis=1), ((1, 0), (1, 0)))
            counts[shot-1, f] = integral[bottom, right] + integral[top, left] - integral[top, right] - integral[bottom, left]
    return boxes, counts, logged, logs


def check_site(row, boxes, counts, logged, decision, ref):
    shot, frame, roi = ref.site_key(row)
    pos = (shot - 1, frame - 1, roi)
    actual = tuple(int(row[k]) for k in ("counts", "log_bit", "fixed_bit", "target"))
    ref.require(actual == (counts[pos], logged[pos], decision[pos], roi in ref.TARGETS), f"Site {pos}")
    geometry = [int(row[k]) for k in ("raw_x0", "raw_y0", "raw_x1_exclusive", "raw_y1_exclusive")]
    stem = ref.BASE + f"P4_{shot}"
    ref.require(geometry == boxes[roi].tolist() and row["frame_member"] == stem + f"_{frame}.tga" and
                row["log_member"] == stem + ".dat", f"Site source {pos}")


def check_rounds(rows, logs, logged, baseline, ref):
    ref.require([int(r["shot"]) for r in rows] == list(range(1, 101)), "Baseline round table")
    for i, (row, src) in enumerate(zip(rows, logs, strict=True)):
        shot = f"P4_{i+1}"
        ref.require(row["attempt_id"] == shot and row["source_log"] == ref.BASE + shot + ".dat" and
                    row["recorded_time"] == src["Date"] + " " + src["Time"] and
                    row["logged_scan_field"] == src["RbRepumpDPAOMB2Intensity1"], "Round source: " + shot)
        for f in range(2):
            mismatch_rois = np.flatnonzero(logged[i, f] != baseline[i, f]).tolist()
            ref.require([int(x) for x in row[f"pic{f+1}_disagreement_rois"].split()] == mismatch_rois, shot)
            for name, bits in (("log", logged[i, f]), ("fixed", baseline[i, f])):
                ref.require(row[f"{name}_pic{f+1}"] == "".join("1" if b else "0" for b in bits) and
                            int(row[f"{name}_pic{f+1}_n"]) == bits.sum(), shot)
                if f == 0:
                    ref.require(int(row[name + "_selected"]) == int(bits.sum() >= 16), shot)
                else:
                    ref.require(int(row[name + "_target_n"]) == bits[ref.TARGETS].sum(), shot)


def verify(archive_path, directory, ref):
    with ZipFile(archive_path) as archive:
        boxes, counts, logged, logs = read_raw(archive, ref)
    sites = ref.csv_rows(directory / "sites.csv.gz")
    ref.require(sorted(ref.site_key(r) for r in sites) == [(s+1, f+1, i) for s, f, i in np.ndindex(counts.shape)],
                "Incomplete baseline site grid")
    baseline = counts > 6436
    for row in sites:
        check_site(row, boxes, counts, logged, baseline, ref)
    rounds = ref.csv_rows(directory / "rounds.csv")
    check_rounds(rounds, logs, logged, baseline, ref)
    summary = json.loads((directory / "summary.json").read_text())
    reported = summary["thresholds"]
    diffs = ref.csv_rows(directory / "differences.csv")
    cohorts = ref.csv_rows(directory / "cohorts.csv")
    tested = set(map(str, ref.THRESHOLDS))
    ref.require(set(reported) == tested and {r["threshold"] for r in diffs} <= tested and
                {r["threshold"] for r in cohorts} == tested, "Threshold roster")
    log_in = logged[:, 0].sum(axis=1) >= 16
    verified, matching = {}, []
    for threshold in ref.THRESHOLDS:
        t = str(threshold)
        fixed = counts > threshold
        fixed_in = fixed[:, 0].sum(axis=1) >= 16
        keys = [(s+1, f+1, i) for s, f, i in np.argwhere(logged != fixed).tolist()]
        witnesses = [r for r in diffs if r["threshold"] == t]
        ref.require(sorted(ref.site_key(r) for r in witnesses) == keys, "Difference rows T=" + t)
        for witness in witnesses:
            check_site(witness, boxes, counts, logged, fixed, ref)
        digest = hashlib.sha256((fixed.astype(np.uint8) + ord("0")).tobytes()).hexdigest()
        fields = dict(disagreements=len(keys), decision_denominator=counts.size,
                      decision_sha256=digest, discrepant_shots=sorted({k[0] for k in keys}),
                      equal_to_threshold=int(np.count_nonzero(counts == threshold)),
                      selected_log=(np.flatnonzero(log_in)+1).tolist(), selected_fixed=(np.flatnonzero(fixed_in)+1).tolist())
        ref.require(reported[t] == fields, "Summary mismatch T=" + t)
        masks = dict(all=np.ones(100, dtype=bool), log_in=log_in, log_out=~log_in, fixed_in=fixed_in,
                     fixed_out=~fixed_in, both=log_in & fixed_in, log_only=log_in & ~fixed_in,
                     fixed_only=fixed_in & ~log_in, neither=~log_in & ~fixed_in)
        cohort_rows = [r for r in cohorts if r["threshold"] == t]
        ref.require(sorted(r["cohort"] for r in cohort_rows) == sorted(masks), "Cohort roster T=" + t)
        for row in cohort_rows:
            ref.verify_cohort(row, masks[row["cohort"]], logged, fixed)
        verified[t] = dict(decision_sha256=digest, different=len(keys), log_selected=int(log_in.sum()),
                           fixed_selected=int(fixed_in.sum()))
        if threshold != 6436 and not keys:
            matching.append(threshold)
    focus = list(range(6499, 6508))
    ref.require(summary["baseline_candidate"] == 6436 and summary["p2_log_compatible_integer_thresholds"] ==
                list(range(6499, 6520)) and summary["p3_focus_thresholds"] == focus and
                summary["p2_thresholds_matching_all_p4_decisions"] == matching and
                summary["p3_focus_matching_all_p4_decisions"] == [t for t in focus if t in matching], "P2/P3 focus conclusion")
    return dict(verified=True, batch="Knottnerus S23/P4", method="Original DAT bits and independent int64 integral images",
                source_frames=200, paired_rounds=len(logs), site_rows_checked=len(sites), round_rows_checked=len(rounds),
                cohort_rows_checked=len(cohorts), difference_rows_checked=len(diffs), thresholds=verified)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ("archive", "results", "output"):
        parser.add_argument(arg, type=Path)
    args = parser.parse_args()
    report = verify(args.archive, args.results, reference_methods())
    with args.output.open("x", encoding="utf-8") as stream:
        json.dump(report, stream, indent=2)
        stream.write("\n")


if __name__ == "__main__":
    main()
