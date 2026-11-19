"""Replay Exp33 fluorescence with previously verified Exp33 coordinates on Taiyi."""

import argparse
import csv
import json
from pathlib import Path
import runpy
from tempfile import mkdtemp

import numpy as np


CROSS = runpy.run_path(str(Path(__file__).with_name("validate-kim-cross-batch.py")))
STACK = runpy.run_path(str(Path(__file__).with_name("reproduce-kim-mis-exp34-stack.py")))
SUMMARY_SHA = "aca5d78868575a65e9e5e3dd921b1e41922537d6307c30ea25aef37d9a7bbbf8"
ROI_SHA = "28a6939e7de9a0f5d9732a9e3f20fa11e2a1a463a374e27f0e93681c6c9e9e5d"
SITES = CROSS["SITES"]
TOL = STACK["THRESHOLD_TOL_COUNTS"]


def table(path):
    with path.open(newline="") as stream:
        return list(csv.DictReader(stream))


def save_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def read_inputs(args):
    result = args.prior_dir / "returned-results"
    summary_file = result / "summary.json"
    centers_file = result / "roi-diagnostic.csv"
    manifest_file = args.prior_dir / "payload/manifest.json"
    digest = CROSS["digest"]
    if digest(summary_file) != SUMMARY_SHA or digest(centers_file) != ROI_SHA:
        raise ValueError("Prior summary or frozen coordinates changed")
    previous = json.loads(summary_file.read_text())
    if digest(manifest_file) != previous["manifest_sha256"] or digest(args.donor_thresholds) != previous["thresholds_sha256"]:
        raise ValueError("Source manifest or Exp34 thresholds changed")
    manifest = json.loads(manifest_file.read_text())
    for item in [manifest["mat"], *manifest["parts"]]:
        path = args.input_dir / item["name"]
        if path.stat().st_size != item["bytes"] or digest(path, "md5") != item["md5"]:
            raise ValueError(f"Raw Figshare input changed: {path.name}")
    thresholds = table(args.donor_thresholds)
    if [int(r["site_1based"]) for r in thresholds] != list(range(1, SITES + 1)):
        raise ValueError("Unexpected Exp34 site identifiers")
    coords = table(centers_file)
    parts = []
    for item, audited in zip(manifest["parts"], previous["primary"]["parts"], strict=True):
        name = item["name"]
        rows = sorted((r for r in coords if r["part"] == name), key=lambda r: int(r["site"]))
        if name != audited["name"] or [int(r["site"]) for r in rows] != list(range(1, SITES + 1)):
            raise ValueError(f"Incomplete frozen coordinates: {name}")
        if any(int(r["verified_center"]) != 1 or int(r["exact_candidates"]) != 1 for r in rows):
            raise ValueError(f"Unverified center: {name}")
        parts.append((name, audited["pages"], rows))
    if len(coords) != len(parts) * SITES:
        raise ValueError("Unexpected extra coordinates")
    return manifest, parts, np.array([float(r["threshold_counts"]) for r in thresholds]), previous


def read_pixels(directory, parts):
    pages = []
    blocks = []
    slices = {}
    for name, expected_pages, rows in parts:
        xy = np.array([(int(r["diagnostic_x"]), int(r["diagnostic_y"])) for r in rows])
        y0, x0, _, _ = CROSS["box_bounds"](xy)
        ys = y0[:, None, None] + np.arange(5)[None, :, None]
        xs = x0[:, None, None] + np.arange(5)[None, None, :]
        start = len(pages)
        block = np.empty((SITES, expected_pages), dtype=np.int64)
        for page, pixels in CROSS["images"](directory / name):
            if page > expected_pages:
                raise ValueError(f"Extra page in {name}")
            block[:, page - 1] = pixels[ys, xs].sum(axis=(1, 2), dtype=np.int64)
            pages.append((name, page))
        if len(pages) - start != expected_pages:
            raise ValueError(f"Short TIFF {name}")
        blocks.append(block)
        slices[name] = slice(start, len(pages))
    return np.concatenate(blocks, axis=1), pages, slices


def transitions(old, new, reference):
    old_error = old != reference
    new_error = new != reference
    return {
        "observations": int(reference.size), "old_mismatches": int(old_error.sum()),
        "new_mismatches": int(new_error.sum()), "corrected": int(np.count_nonzero(old_error & ~new_error)),
        "introduced": int(np.count_nonzero(~old_error & new_error)),
        "still_wrong": int(np.count_nonzero(old_error & new_error)),
        "old_0_new_1": int(np.count_nonzero(~old & new)),
        "old_1_new_0": int(np.count_nonzero(old & ~new)),
    }


def report(args, output):
    manifest, parts, old_thresholds, previous = read_inputs(args)
    sums, pages, slices = read_pixels(args.input_dir, parts)
    counts = sums / 25
    fitted = [STACK["threshold_bins"](series) for series in counts]
    new_thresholds = np.array([values[0] for values in fitted])
    old = counts >= old_thresholds[:, None]
    new = counts >= new_thresholds[:, None]
    print(f"Read {len(pages)} pages and selected 198 thresholds before loading archive observables.", flush=True)

    ref_sums, archive, archive_thresholds = CROSS["load_reference"](
        args.input_dir / manifest["mat"]["name"], len(pages), manifest["rounds"])
    archive_rule = counts >= archive_thresholds[:, None]
    cube_shape = (SITES, manifest["rounds"], 2)
    old_pairs, new_pairs, ref_pairs = (a.reshape(cube_shape) for a in (old, new, archive))
    round_numbers = np.arange(1, manifest["rounds"] + 1)
    holdout_rounds = round_numbers % 4 != 1
    holdout = np.repeat(holdout_rounds, 2)
    count_errors = sums != ref_sums
    old_errors = old != archive
    new_errors = new != archive
    # A count inside [lower, upper) changes its decision under the published >= rule.
    between = (counts >= np.minimum(old_thresholds, new_thresholds)[:, None]) & (
        counts < np.maximum(old_thresholds, new_thresholds)[:, None])
    if not np.array_equal(between, old != new):
        raise ValueError("Endpoint convention disagrees with the decision change")
    explained = old_errors & ~new_errors & between & ~count_errors & (archive_rule == archive)

    def stats(page_selection):
        selected = np.asarray(page_selection)
        if not np.array_equal(selected[::2], selected[1::2]):
            raise ValueError("Selection divides an ordered pair")
        rounds = selected[::2]
        mismatch_pairs = np.any(new_pairs[:, rounds] != ref_pairs[:, rounds], axis=-1)
        mismatch_old_pairs = np.any(old_pairs[:, rounds] != ref_pairs[:, rounds], axis=-1)
        return {
            **transitions(old[:, selected], new[:, selected], archive[:, selected]),
            "count_mismatches": int(count_errors[:, selected].sum()),
            "max_abs_count_difference": float(np.abs(sums[:, selected] - ref_sums[:, selected]).max() / 25),
            "old_errors_explained_by_threshold": int(explained[:, selected].sum()),
            "replay_counts_at_archive_threshold_mismatches": int(np.count_nonzero(archive_rule[:, selected] != archive[:, selected])),
            "site_pairs": int(mismatch_pairs.size), "pair_mismatches": int(mismatch_pairs.sum()),
            "old_pair_mismatches": int(mismatch_old_pairs.sum()), "rounds": int(rounds.sum()),
            "rounds_with_mismatch": int(np.any(mismatch_pairs, axis=0).sum()),
            "patterns_00_01_10_11": CROSS["pattern_counts"](new_pairs[:, rounds]),
            "archive_patterns_00_01_10_11": CROSS["pattern_counts"](ref_pairs[:, rounds]),
        }

    per_part = {}
    for name, _, rows in parts:
        selected = np.zeros(len(pages), dtype=bool)
        selected[slices[name]] = True
        local_holdout = selected & holdout
        prior_per_site = [int(r["diagnostic_holdout_bit_mismatches"]) for r in rows]
        if not np.array_equal(old_errors[:, local_holdout].sum(axis=1), prior_per_site):
            raise ValueError(f"New inputs do not reproduce the prior site-level comparison for {name}")
        per_part[name] = {"all": stats(selected), "holdout": stats(local_holdout)}
    if old_errors[:, holdout].sum() != 2817:
        raise ValueError("Prior holdout difference count has changed")

    with (output / "sites.csv").open("w", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(("site", "frames", "counts_mismatched", "old_threshold", "new_threshold", "archive_threshold",
                         "new_minus_archive", "selected_bin", "within_tolerance", "old_bit_errors", "new_bit_errors",
                         "holdout_frames", "holdout_old_errors", "holdout_new_errors", "holdout_explained"))
        for site, (_, _, _, selected_bin) in enumerate(fitted):
            delta = new_thresholds[site] - archive_thresholds[site]
            writer.writerow((site+1, len(pages), count_errors[site].sum(), old_thresholds[site], new_thresholds[site],
                             archive_thresholds[site], delta, selected_bin, int(abs(delta) <= TOL), old_errors[site].sum(),
                             new_errors[site].sum(), holdout.sum(), old_errors[site, holdout].sum(), new_errors[site, holdout].sum(),
                             explained[site, holdout].sum()))
    save_json(output / "histograms.json", [
        dict(site=i+1, edges=edges, frequencies=frequencies, selected_bin=bin_no,
             outside=len(pages)-sum(frequencies)) for i, (_, edges, frequencies, bin_no) in enumerate(fitted)])
    with (output / "affected-frames.csv").open("w", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(("site", "part", "local_page", "global_page", "round", "frame", "holdout", "pixel_sum",
                         "counts", "archive_counts", "exp34_threshold", "exp33_threshold", "archive_threshold",
                         "exp34_bit", "exp33_bit", "archive_bit", "between_thresholds", "explained"))
        for page, site in np.argwhere((old_errors | new_errors | count_errors).T):
            writer.writerow((site+1, *pages[page], page+1, page//2+1, page%2+1, int(holdout[page]), sums[site,page],
                             counts[site,page], ref_sums[site,page]/25, old_thresholds[site], new_thresholds[site],
                             archive_thresholds[site], int(old[site,page]), int(new[site,page]), int(archive[site,page]),
                             int(between[site,page]), int(explained[site,page])))
    with (output / "rounds.csv").open("w", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(("round", "holdout", "part1", "local1", "global1", "part2", "local2", "global2",
                         "site_pairs", "site_frames", "count_errors", "old_bit_errors", "new_bit_errors",
                         "old_pair_errors", "new_pair_errors", "explained", "n00", "n01", "n10", "n11"))
        for r in range(manifest["rounds"]):
            i = 2*r
            block = slice(i, i+2)
            writer.writerow((r+1, int(holdout_rounds[r]), *pages[i], i+1, *pages[i+1], i+2, SITES, SITES*2,
                             count_errors[:,block].sum(), old_errors[:,block].sum(), new_errors[:,block].sum(),
                             old_errors[:,block].any(axis=1).sum(), new_errors[:,block].any(axis=1).sum(),
                             explained[:,block].sum(), *CROSS["pattern_counts"](new_pairs[:,r])))
    np.savez_compressed(output / "ordered-pairs.npz", exp34_bits=old_pairs, exp33_bits=new_pairs, archive_bits=ref_pairs,
                        holdout_round=holdout_rounds)
    digest = CROSS["digest"]
    summary = {
        "evidence": "Kim 87Rb Exp33 same-batch reproduction; cross-apparatus comparison for Senoo",
        "prior_summary_sha256": SUMMARY_SHA, "roi_sha256": ROI_SHA, "manifest_sha256": previous["manifest_sha256"],
        "exp34_threshold_sha256": digest(args.donor_thresholds), "worker_sha256": digest(Path(__file__)),
        "helper_sha256": {name: digest(Path(__file__).with_name(name)) for name in
                          ("validate-kim-cross-batch.py","reproduce-kim-mis-exp34-stack.py")},
        "input_files_verified": [manifest["mat"], *manifest["parts"]],
        "threshold_population": "All 11272 pages per site including ROI holdout frames", "threshold_tolerance": TOL,
        "thresholds_in_tolerance": int(np.count_nonzero(np.abs(new_thresholds-archive_thresholds) <= TOL)),
        "max_abs_threshold_delta_counts": float(np.abs(new_thresholds-archive_thresholds).max()),
        "all": stats(np.ones(len(pages), dtype=bool)), "holdout": stats(holdout), "parts": per_part,
        "output_sha256": {f.name: digest(f) for f in sorted(output.iterdir())},
    }
    save_json(output / "summary.json", summary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ("input-dir", "prior-dir", "donor-thresholds", "output-dir"):
        parser.add_argument("--"+flag, type=Path, required=True)
    args = parser.parse_args()
    if args.output_dir.exists():
        parser.error("Select an unused output directory")
    args.output_dir.parent.mkdir(parents=True, exist_ok=True)
    output = Path(mkdtemp(prefix=args.output_dir.name+".partial-",dir=args.output_dir.parent))
    report(args, output)
    if args.output_dir.exists():
        raise FileExistsError(args.output_dir)
    output.rename(args.output_dir)


if __name__ == "__main__":
    main()
