"""Replay Kim Exp34 from raw pixels and frozen per-part ROIs on Taiyi."""

import argparse
import csv
import gzip
import json
from pathlib import Path
import runpy
from tempfile import mkdtemp

import numpy as np


STACK = runpy.run_path(str(Path(__file__).with_name("reproduce-kim-mis-exp34-stack.py")))
PARTS = STACK["PARTS"]
SITES = STACK["SITE_COUNT"]
ROUNDS = STACK["ROUND_COUNT"]
SEAM_ROUND = 2501
THRESHOLD_TOL = STACK["THRESHOLD_TOL_COUNTS"]
REFIT_SUMMARY_SHA256 = "61604bbf4211e5e1bdcd8346e753b20e9986c85932fcc2cea3d123536efb9508"
PATTERNS = ("00", "01", "10", "11")


def frozen_centers(directory, initial):
    summary_path = directory / "summary.json"
    centers_path = directory / "roi-centers.csv"
    if STACK["digest"](summary_path, "sha256") != REFIT_SUMMARY_SHA256:
        raise ValueError("Unexpected prior ROI result SHA-256")
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    centers_digest = STACK["digest"](centers_path, "sha256")
    if centers_digest != summary["output_sha256"][centers_path.name]:
        raise ValueError("Unexpected frozen ROI centers SHA-256")
    expected = {(name, site) for name, _, _, _ in PARTS for site in range(1, SITES + 1)}
    by_part = {name: np.zeros((SITES, 2), dtype=np.int64) for name, _, _, _ in PARTS}
    with centers_path.open(newline="", encoding="utf-8") as stream:
        for row in csv.DictReader(stream):
            name, site = row["part"], int(row["site_1based"])
            if (name, site) not in expected:
                raise ValueError(f"Unexpected or duplicate ROI for {(name, site)}")
            expected.remove((name, site))
            if tuple(initial[site - 1]) != (int(row["initial_x"]), int(row["initial_y"])):
                raise ValueError(f"ROI index disagrees with the public source at site {site}")
            if int(row["localization_exact_candidates"]) != 1:
                raise ValueError(f"Ambiguous frozen ROI for {(name, site)}")
            by_part[name][site - 1] = (int(row["refit_x"]), int(row["refit_y"]))
    if expected:
        raise ValueError("Missing frozen ROI rows")
    return by_part, centers_digest


def raw_roi_counts(tiff_dir, centers):
    relative = np.arange(-2, 3)
    height, width = STACK["FRAME_SHAPE"]
    boxes = {}
    for name, xy in centers.items():
        rows = xy[:, 1, None, None] - 1 + relative[None, :, None]
        columns = xy[:, 0, None, None] - 1 + relative[None, None, :]
        if rows.min() < 0 or columns.min() < 0 or rows.max() >= height or columns.max() >= width:
            raise ValueError(f"ROI outside the TIFF at {name}")
        boxes[name] = (rows, columns)
    sums = np.empty((SITES, 2 * ROUNDS), dtype=np.int64)
    pages = []
    for index, (name, local_page, pixels) in enumerate(STACK["tiff_pages"](tiff_dir, PARTS)):
        rows, columns = boxes[name]
        sums[:, index] = pixels[rows, columns].sum(axis=(1, 2), dtype=np.int64)
        pages.append((name, local_page))
    if len(pages) != 2 * ROUNDS:
        raise ValueError("Incorrect total page count")
    seam = 2 * (SEAM_ROUND - 1)
    if pages[seam:seam + 2] != [("Exp34_X1.tif", 5001), ("Exp34_X2.tif", 1)]:
        raise ValueError("Round 2501 does not cross X1/X2 in the expected order")
    print(f"Integrated {len(pages)} pages in X1/X2/X3 order", flush=True)
    return sums, pages


def pattern_counts(bits):
    if bits.shape[-1] != 2:
        raise ValueError("Occupancy patterns require two ordered frames")
    return np.bincount((2 * bits[..., 0] + bits[..., 1]).ravel().astype(np.int64), minlength=4).tolist()


def summarize_frames(residual, bit_error, archived_threshold_error):
    return {
        "site_frames": residual.size,
        "count_mismatches": int(np.count_nonzero(residual)),
        "max_abs_count_difference": float(np.abs(residual).max() / 25),
        "bit_mismatches": int(np.count_nonzero(bit_error)),
        "bit_mismatches_using_archived_thresholds": int(np.count_nonzero(archived_threshold_error)),
    }


def compare(tiff_dir, reference_dir, refit_dir, output):
    inputs = STACK["verify_inputs"](tiff_dir, reference_dir)
    initial, archived_sums, archived_bits, archived_thresholds = STACK["read_reference"](reference_dir)
    centers, centers_digest = frozen_centers(refit_dir, initial)
    print("Verified TIFF and MAT fingerprints and frozen ROI table", flush=True)
    sums, pages = raw_roi_counts(tiff_dir, centers)
    counts, archived_counts = sums / 25, archived_sums / 25
    histograms = []
    threshold_results = [STACK["threshold_bins"](series) for series in counts]
    thresholds = np.array([value for value, _, _, _ in threshold_results])
    residual = sums - archived_sums
    threshold_delta = thresholds - archived_thresholds
    bits = counts >= thresholds[:, None]
    bit_error = bits != archived_bits
    archived_threshold_error = (counts >= archived_thresholds[:, None]) != archived_bits

    with (output / "threshold-comparison.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(("site_1based", "input_frames", "selected_bin_1based", "threshold_counts",
                         "archived_threshold_counts", "threshold_delta_counts", "within_tolerance",
                         "frames_outside_histogram_bounds", "count_mismatches", "bit_mismatches"))
        for site, (threshold, edges, frequencies, selected) in enumerate(threshold_results):
            outside = len(pages) - sum(frequencies)
            histograms.append({"site_1based": site + 1, "edges_counts": edges, "frequencies": frequencies,
                               "selected_bin_1based": selected, "frames_outside_histogram_bounds": outside})
            writer.writerow((site + 1, len(pages), selected, threshold, archived_thresholds[site], threshold_delta[site],
                             int(abs(threshold_delta[site]) <= THRESHOLD_TOL), outside,
                             np.count_nonzero(residual[site]), np.count_nonzero(bit_error[site])))
    (output / "histograms.json").write_text(json.dumps(histograms, indent=2) + "\n", encoding="utf-8")

    paired_bits = bits.reshape(SITES, ROUNDS, 2)
    paired_reference = archived_bits.reshape(SITES, ROUNDS, 2)
    pair_error = np.any(paired_bits != paired_reference, axis=-1)
    pairs_header = ("round_1based", "site_1based", "pixel_sum_frame_1", "pixel_sum_frame_2", "counts_frame_1", "counts_frame_2",
                    "archived_counts_frame_1", "archived_counts_frame_2", "bit_frame_1", "bit_frame_2", "archived_bit_frame_1",
                    "archived_bit_frame_2", "pair_mismatch")
    page_header = ("frame_1_part", "frame_1_local_page", "frame_1_global_page", "frame_2_part", "frame_2_local_page", "frame_2_global_page")
    with (
        gzip.open(output / "paired-comparison.csv.gz", "wt", newline="", encoding="utf-8", compresslevel=5) as pair_stream,
        (output / "round-comparison.csv").open("w", newline="", encoding="utf-8") as round_stream,
        (output / "round-2501.csv").open("w", newline="", encoding="utf-8") as seam_stream,
    ):
        pair_writer, round_writer, seam_writer = map(csv.writer, (pair_stream, round_stream, seam_stream))
        pair_writer.writerow(pairs_header)
        round_writer.writerow(("round_1based", *page_header, "site_pairs", "site_frames", "count_mismatches", "bit_mismatches",
                               "pair_mismatches", *[f"replay_{p}" for p in PATTERNS], *[f"archive_{p}" for p in PATTERNS]))
        seam_writer.writerow((*pairs_header, *page_header, "threshold_counts", "archived_threshold_counts",
                              "frame_1_roi_x", "frame_1_roi_y", "frame_2_roi_x", "frame_2_roi_y"))
        for index in range(ROUNDS):
            p1 = index * 2
            p2 = p1 + 1
            first, second = pages[p1], pages[p2]
            page_fields = (*first, p1 + 1, *second, p2 + 1)
            pair_rows = [(index + 1, site + 1, sums[site, p1], sums[site, p2], counts[site, p1], counts[site, p2],
                          archived_counts[site, p1], archived_counts[site, p2], int(bits[site, p1]), int(bits[site, p2]),
                          int(archived_bits[site, p1]), int(archived_bits[site, p2]), int(pair_error[site, index]))
                         for site in range(SITES)]
            pair_writer.writerows(pair_rows)
            round_writer.writerow((index + 1, *page_fields, SITES, 2 * SITES, np.count_nonzero(residual[:, p1:p2 + 1]),
                                   np.count_nonzero(bit_error[:, p1:p2 + 1]), np.count_nonzero(pair_error[:, index]),
                                   *pattern_counts(paired_bits[:, index]), *pattern_counts(paired_reference[:, index])))
            if index + 1 == SEAM_ROUND:
                seam_writer.writerows((*row, *page_fields, thresholds[site], archived_thresholds[site],
                                       *centers[first[0]][site], *centers[second[0]][site]) for site, row in enumerate(pair_rows))

    part_totals = []
    offset = 0
    for name, n_pages, _, _ in PARTS:
        columns = slice(offset, offset + n_pages)
        part_totals.append({"part": name, "global_pages_1based": [offset + 1, offset + n_pages],
                            **summarize_frames(residual[:, columns], bit_error[:, columns], archived_threshold_error[:, columns])})
        offset += n_pages
    seam_index = SEAM_ROUND - 1
    seam_pages = slice(2 * seam_index, 2 * seam_index + 2)
    summary = {
        "evidence": "Kim Exp34 87Rb cross-apparatus same-batch reconstruction",
        "inputs": inputs, "frozen_roi_summary_sha256": REFIT_SUMMARY_SHA256, "frozen_roi_centers_sha256": centers_digest,
        "script_sha256": STACK["digest"](Path(__file__), "sha256"),
        "stack_script_sha256": STACK["digest"](Path(STACK["__file__"]), "sha256"),
        "pages": len(pages), "sites": SITES, "rounds": ROUNDS, "site_pairs": pair_error.size,
        "threshold_rule": "70 equal bins from mean−45 to mean+75, first minimum across bins 10–25, left edge; count >= threshold",
        "threshold_input_frames_per_site": len(pages), "threshold_tolerance_counts": THRESHOLD_TOL,
        "thresholds_within_tolerance": int(np.count_nonzero(np.abs(threshold_delta) <= THRESHOLD_TOL)),
        "maximum_abs_threshold_difference_counts": float(np.abs(threshold_delta).max()),
        "minimum_count_margin_to_recalculated_threshold_counts": float(np.min(np.abs(counts - thresholds[:, None]))),
        **summarize_frames(residual, bit_error, archived_threshold_error),
        "site_pair_mismatches": int(np.count_nonzero(pair_error)), "rounds_with_pair_mismatch": int(np.any(pair_error, axis=0).sum()),
        "replayed_patterns": dict(zip(PATTERNS, pattern_counts(paired_bits), strict=True)),
        "archived_patterns": dict(zip(PATTERNS, pattern_counts(paired_reference), strict=True)),
        "parts": part_totals,
        "round_2501": {"round_1based": SEAM_ROUND,
                       "frames": [{"part": name, "local_page": page, "global_page": 2 * seam_index + frame, "frame": frame}
                                  for frame, (name, page) in enumerate(pages[seam_pages], start=1)],
                       **summarize_frames(residual[:, seam_pages], bit_error[:, seam_pages], archived_threshold_error[:, seam_pages]),
                       "site_pairs": SITES, "site_pair_mismatches": int(pair_error[:, seam_index].sum()),
                       "replayed_patterns": dict(zip(PATTERNS, pattern_counts(paired_bits[:, seam_index]), strict=True)),
                       "archived_patterns": dict(zip(PATTERNS, pattern_counts(paired_reference[:, seam_index]), strict=True)),
                       "swapped_frame_pair_mismatches": int(np.any(paired_bits[:, seam_index, ::-1] != paired_reference[:, seam_index],
                                                                   axis=-1).sum())},
        "output_sha256": {path.name: STACK["digest"](path, "sha256") for path in sorted(output.iterdir())},
    }
    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(f"Checked {SITES} thresholds, {pair_error.size} ordered site pairs and round {SEAM_ROUND}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ("--tiff-dir", "--reference-dir", "--refit-dir", "--output-dir"):
        parser.add_argument(option, type=Path, required=True)
    args = parser.parse_args()
    if args.output_dir.exists():
        parser.error("Select a new output directory")
    args.output_dir.parent.mkdir(parents=True, exist_ok=True)
    output = Path(mkdtemp(prefix=f"{args.output_dir.name}.partial-", dir=args.output_dir.parent))
    compare(args.tiff_dir, args.reference_dir, args.refit_dir, output)
    if args.output_dir.exists():
        raise FileExistsError(args.output_dir)
    output.rename(args.output_dir)


if __name__ == "__main__":
    main()
