"""Compare per-part Kim Exp34 ROI centers on held-out rounds on Taiyi."""

import argparse
from collections import Counter
import csv
import gzip
from itertools import product
import json
from pathlib import Path
import runpy
from tempfile import mkdtemp

import numpy as np


STACK = runpy.run_path(str(Path(__file__).with_name("reproduce-kim-mis-exp34-stack.py")))
PARTS = STACK["PARTS"]
SITE_COUNT = STACK["SITE_COUNT"]
CANDIDATE_OFFSETS = np.array(list(product(range(-5, 6), repeat=2)))
PRIOR_SPOTCHECK_ROUNDS = (*range(1, 9), 2500, 2501, 2502, 3201, 3202, 3479)
BASELINE = "whole_stack"
REFIT = "part_refit"
UNIFORM_SHIFT = "whole_stack_x_plus_1"
SELECTIVE_SHIFT = "whole_stack_selective_x_plus_1"
METRICS = ("count_mismatches", "bit_mismatches", "count_corrected", "count_introduced",
           "bit_corrected", "bit_introduced")
BASELINE_SUMMARY_SHA256 = "a36dde663c90679029f2303d05026ee4b34c4fd9159cb6678a315c0557a66544"


def is_localization_round(round_number):
    return round_number % 4 == 1 or round_number in PRIOR_SPOTCHECK_ROUNDS


def read_baseline(directory, initial, thresholds):
    summary_path = directory / "summary.json"
    site_path = directory / "site-comparison.csv"
    digest = STACK["digest"]
    if digest(summary_path, "sha256") != BASELINE_SUMMARY_SHA256:
        raise ValueError("Unexpected whole-stack summary SHA-256")
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    if digest(site_path, "sha256") != summary["output_sha256"][site_path.name]:
        raise ValueError("Unexpected whole-stack site CSV SHA-256")
    with site_path.open(newline="", encoding="utf-8") as stream:
        rows = list(csv.DictReader(stream))
    if [int(row["site_1based"]) for row in rows] != list(range(1, SITE_COUNT + 1)):
        raise ValueError("Unexpected whole-stack site order")
    if not np.array_equal([[int(row["initial_x"]), int(row["initial_y"])] for row in rows], initial):
        raise ValueError("Whole-stack initial coordinates differ from the MAT input")
    if not np.array_equal([float(row["archived_threshold_counts"]) for row in rows], thresholds):
        raise ValueError("Whole-stack thresholds differ from the MAT input")
    centers = np.array([[int(row["global_x"]), int(row["global_y"])] for row in rows])
    expected = np.array([[int(row["count_mismatches"]), int(row["bit_mismatches_at_archived_threshold"])]
                         for row in rows])
    return centers, expected, summary


def box_coordinates(centers):
    x, y = np.moveaxis(centers, -1, 0) - 1
    height, width = STACK["FRAME_SHAPE"]
    if np.any((x < 2) | (y < 2) | (x + 2 >= width) | (y + 2 >= height)):
        raise ValueError("A 5 × 5 ROI leaves the TIFF image")
    return y - 2, x - 2, y + 3, x + 3


def roi_sums(pixels, bounds):
    # Integral image with a zero top row and left column. The differences are exact integers.
    integral = np.zeros((pixels.shape[0] + 1, pixels.shape[1] + 1), dtype=np.int64)
    integral[1:, 1:] = pixels.cumsum(axis=0, dtype=np.int64).cumsum(axis=1, dtype=np.int64)
    y0, x0, y1, x1 = bounds
    return integral[y1, x1] - integral[y0, x1] - integral[y1, x0] + integral[y0, x0]


def fit_part(tiff_dir, part, offset, reference_sums, candidates):
    bounds = box_coordinates(candidates)
    mismatches = np.zeros(candidates.shape[:-1], dtype=np.int64)
    absolute_sums = np.zeros_like(mismatches)
    localization_pages = []
    for _, local_page, pixels in STACK["tiff_pages"](tiff_dir, (part,)):
        page = offset + local_page
        if is_localization_round((page + 1) // 2):
            localization_pages.append(page)
            residual = roi_sums(pixels, bounds) - reference_sums[:, page - 1, None]
            mismatches += residual != 0
            absolute_sums += np.abs(residual)
    # np.lexsort is stable. Exact ties keep the first (x, y) in MATLAB column-major order.
    best = np.lexsort((absolute_sums, mismatches), axis=1)[:, 0]
    sites = np.arange(SITE_COUNT)
    ties = (mismatches == mismatches[sites, best, None]) & (absolute_sums == absolute_sums[sites, best, None])
    return localization_pages, mismatches, absolute_sums, best, ties


def verify_part(tiff_dir, part, offset, reference_sums, reference_bits, thresholds, models, page_writer):
    bounds = box_coordinates(np.stack(list(models.values())))
    totals = np.zeros((len(models), SITE_COUNT, len(METRICS)), dtype=np.int64)
    baseline_all_pages = np.zeros((SITE_COUNT, 2), dtype=np.int64)
    max_residuals = np.zeros((len(models), SITE_COUNT), dtype=np.int64)
    held_out = []
    for name, local_page, pixels in STACK["tiff_pages"](tiff_dir, (part,)):
        page = offset + local_page
        round_number = (page + 1) // 2
        sums = roi_sums(pixels, bounds)
        residual = sums - reference_sums[:, page - 1]
        count_error = residual != 0
        bit_error = (sums / 25 >= thresholds) != reference_bits[:, page - 1]
        if np.any(bit_error & ~count_error):
            raise ValueError(f"Exact count has a different decision at global page {page}")
        baseline_all_pages += np.stack((count_error[0], bit_error[0]), axis=-1)
        if is_localization_round(round_number):
            continue
        held_out.append(page)
        outcomes = np.stack((count_error, bit_error, count_error[0] & ~count_error, ~count_error[0] & count_error,
                             bit_error[0] & ~bit_error, ~bit_error[0] & bit_error), axis=-1)
        totals += outcomes
        np.maximum(max_residuals, np.abs(residual), out=max_residuals)
        for model, row in zip(models, outcomes.sum(axis=1), strict=True):
            page_writer.writerow((name, local_page, page, round_number, 1 + (page - 1) % 2, model, SITE_COUNT, *row))
    if not np.array_equal(totals[:, :, :2], totals[0, :, :2] - totals[:, :, [2, 4]] + totals[:, :, [3, 5]]):
        raise ValueError("Mismatch totals disagree with the correction and introduction counts")
    return held_out, totals, max_residuals, baseline_all_pages


def compare(tiff_dir, reference_dir, baseline_dir, output):
    inputs = STACK["verify_inputs"](tiff_dir, reference_dir)
    print("Three TIFF sizes/MD5 and both MAT SHA-256 verified", flush=True)
    initial, reference_sums, reference_bits, thresholds = STACK["read_reference"](reference_dir)
    global_centers, expected_baseline, baseline_summary = read_baseline(baseline_dir, initial, thresholds)
    candidates = initial[:, None, :] + CANDIDATE_OFFSETS
    summaries = []
    ambiguities = []
    held_out_pages = []
    accumulated_baseline = np.zeros_like(expected_baseline)
    offset = 0
    with (output / "roi-centers.csv").open("w", newline="", encoding="utf-8") as center_stream, \
         (output / "holdout-site-comparison.csv").open("w", newline="", encoding="utf-8") as site_stream, \
         (output / "holdout-page-comparison.csv").open("w", newline="", encoding="utf-8") as page_stream, \
         gzip.open(output / "localization-candidate-scores.csv.gz", "wt", newline="", encoding="utf-8") as candidate_stream:
        center_writer, site_writer, page_writer, candidate_writer = map(
            csv.writer, (center_stream, site_stream, page_stream, candidate_stream))
        center_writer.writerow(("part", "site_1based", "initial_x", "initial_y", "whole_stack_x", "whole_stack_y",
                                "refit_x", "refit_y", "dx_from_whole_stack", "dy_from_whole_stack", "dx_from_x1", "dy_from_x1",
                                "localization_pages", "localization_count_mismatches", "localization_exact_candidates",
                                "localization_best_ties", "holdout_count_mismatches", "holdout_bit_mismatches"))
        site_writer.writerow(("part", "site_1based", "model", "holdout_pages", *METRICS, "max_abs_count_difference"))
        page_writer.writerow(("part", "local_page_1based", "global_page_1based", "round_1based", "frame", "model",
                              "site_frames", *METRICS))
        candidate_writer.writerow(("part", "site_1based", "x", "y", "localization_count_mismatches",
                                   "localization_total_abs_pixel_sum_difference"))

        for part, prior in zip(PARTS, baseline_summary["parts"], strict=True):
            name, pages, _, _ = part
            location_pages, fit_errors, fit_residuals, best, ties = fit_part(tiff_dir, part, offset, reference_sums, candidates)
            refit_centers = candidates[np.arange(SITE_COUNT), best]
            delta = refit_centers - global_centers
            exact_candidates = (fit_errors == 0).sum(axis=1)
            models = {BASELINE: global_centers, REFIT: refit_centers}
            if offset == 0:
                x1_centers = refit_centers
            if part == PARTS[-1]:
                plus_one = np.array([1, 0])
                selected = (exact_candidates == 1) & np.all(delta == plus_one, axis=1)
                models[UNIFORM_SHIFT] = global_centers + plus_one
                models[SELECTIVE_SHIFT] = global_centers + selected[:, None] * plus_one
            held_out, totals, max_residuals, baseline_all_pages = verify_part(
                tiff_dir, part, offset, reference_sums, reference_bits, thresholds, models, page_writer)
            if len(location_pages) + len(held_out) != pages or len(set(location_pages) & set(held_out)):
                raise ValueError(f"Invalid frame split in {name}")
            held_out_pages.extend(held_out)
            if baseline_all_pages[:, 0].sum() != prior["count_mismatches"]:
                raise ValueError(f"Full-part baseline count mismatch total changed in {name}")
            accumulated_baseline += baseline_all_pages
            for site, center in enumerate(refit_centers):
                site_number = site + 1
                best_count = fit_errors[site, best[site]]
                held_count, held_bit = totals[1, site, :2]
                center_writer.writerow((name, site_number, *initial[site], *global_centers[site], *center, *delta[site],
                                        *(center - x1_centers[site]), len(location_pages), best_count, exact_candidates[site],
                                        ties[site].sum(), held_count, held_bit))
                candidate_writer.writerows((name, site_number, *xy, mismatches, residual) for xy, mismatches, residual in
                                           zip(candidates[site], fit_errors[site], fit_residuals[site], strict=True))
                for model_index, model in enumerate(models):
                    site_writer.writerow((name, site_number, model, len(held_out), *totals[model_index, site],
                                          max_residuals[model_index, site] / 25))
                if exact_candidates[site] != 1 or held_count or held_bit:
                    ambiguities.append({"part": name, "site_1based": site_number, "selected_xy": center.tolist(),
                                        "exact_localization_candidates_xy": candidates[site, fit_errors[site] == 0].tolist(),
                                        "tied_best_candidates_xy": candidates[site, ties[site]].tolist(),
                                        "localization_count_mismatches": int(best_count),
                                        "holdout_count_mismatches": int(held_count), "holdout_bit_mismatches": int(held_bit)})
            summaries.append({
                "part": name, "global_pages_1based": [offset + 1, offset + pages],
                "localization_pages": len(location_pages), "holdout_pages": len(held_out),
                "holdout_site_frames": len(held_out) * SITE_COUNT,
                "whole_stack_full_part_errors": dict(zip(METRICS[:2], baseline_all_pages.sum(axis=0).tolist(), strict=True)),
                "unique_exact_localization_sites": int(np.count_nonzero(exact_candidates == 1)),
                "no_exact_localization_sites": int(np.count_nonzero(exact_candidates == 0)),
                "multiple_exact_localization_sites": int(np.count_nonzero(exact_candidates > 1)),
                "refit_shift_from_whole_stack": shift_distribution(delta),
                "refit_shift_from_x1": shift_distribution(refit_centers - x1_centers),
                "selective_x_plus_1_sites": (np.flatnonzero(selected) + 1).tolist() if SELECTIVE_SHIFT in models else [],
                "holdout_models": {
                    model: {**dict(zip(METRICS, totals[index].sum(axis=0).tolist(), strict=True)),
                            "max_abs_count_difference": float(max_residuals[index].max() / 25)}
                    for index, model in enumerate(models)
                },
            })
            offset += pages
            print(f"{name}: {len(location_pages)} localization and {len(held_out)} holdout pages checked", flush=True)
    if not np.array_equal(accumulated_baseline, expected_baseline):
        raise ValueError("Whole-stack baseline per-site totals changed")
    holdout_pairs = zip(held_out_pages[::2], held_out_pages[1::2], strict=True)
    if any(first % 2 != 1 or second != first + 1 for first, second in holdout_pairs):
        raise ValueError("The holdout must contain complete two-frame rounds")
    (output / "ambiguities.json").write_text(json.dumps(ambiguities, indent=2) + "\n", encoding="utf-8")
    summary = {"evidence": "87Rb cross-apparatus comparison, Kim Exp34",
               "localization_rule": "global round modulo 4 equals 1 or in prior_spotcheck_rounds",
               "prior_spotcheck_rounds": PRIOR_SPOTCHECK_ROUNDS,
               "holdout_rounds": len(held_out_pages) // 2,
               "threshold_rule": "Same archived per-site threshold for each model; counts >= threshold",
               "candidate_selection": "initial ROI ±5 px; minimize mismatch count, then total absolute integer residual, then x/y order",
               "whole_stack_summary_sha256": BASELINE_SUMMARY_SHA256, "inputs": inputs,
               "script_sha256": STACK["digest"](Path(__file__), "sha256"),
               "stack_script_sha256": STACK["digest"](Path(STACK["__file__"]), "sha256"),
               "parts": summaries, "unresolved_part_sites": len(ambiguities),
               "output_sha256": {file.name: STACK["digest"](file, "sha256") for file in sorted(output.iterdir())}}
    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")


def shift_distribution(delta):
    return [{"dx": dx, "dy": dy, "sites": count} for (dx, dy), count in sorted(Counter(map(tuple, delta.tolist())).items())]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for argument in ("--tiff-dir", "--reference-dir", "--baseline-dir", "--output-dir"):
        parser.add_argument(argument, type=Path, required=True)
    args = parser.parse_args()
    if args.output_dir.exists():
        parser.error("Select a new output directory")
    args.output_dir.parent.mkdir(parents=True, exist_ok=True)
    staged = Path(mkdtemp(prefix=f"{args.output_dir.name}.partial-", dir=args.output_dir.parent))
    compare(args.tiff_dir, args.reference_dir, args.baseline_dir, staged)
    if args.output_dir.exists():
        raise FileExistsError(args.output_dir)
    staged.rename(args.output_dir)


if __name__ == "__main__":
    main()
