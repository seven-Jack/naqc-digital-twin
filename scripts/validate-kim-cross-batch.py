"""Validate frozen Kim Exp34 readout against a different archive on Taiyi."""

import argparse
from collections import Counter
import csv
import gzip
import hashlib
from itertools import product
import json
from pathlib import Path
import re
from tempfile import mkdtemp

import numpy as np
from PIL import Image
from scipy.io import loadmat


SITES = 198
FRAME_SHAPE = (301, 541)
CENTERS_SHA = "f61f3678371e572dadb14938078e18d9cd70c09270ae86c367d7f9c96d3de518"
THRESHOLDS_SHA = "1def1cdf937bfac4d4da93a768eb02d1e0d54f699d5db0a83be8c9055475ee58"
PATTERNS = ("00", "01", "10", "11")
OFFSETS = np.array(list(product(range(-5, 6), repeat=2)))


def digest(path, algorithm="sha256"):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, algorithm).hexdigest()


def load_inputs(manifest_path, directory, centers_path, thresholds_path):
    manifest = json.loads(manifest_path.read_text())
    target = manifest["target_experiment"]
    if not re.fullmatch(r"Exp[0-9]+", target) or target == "Exp34":
        raise ValueError(f"Invalid independent target {target}")
    parts = manifest["parts"]
    files = [manifest["mat"], *parts]
    if not parts or len({item["name"] for item in files}) != len(files):
        raise ValueError("Empty or duplicate source manifest entries")
    for item in files:
        name = item["name"]
        if Path(name).name != name or not name.startswith(target):
            raise ValueError(f"Invalid source file name {name}")
        path = directory / name
        if path.stat().st_size != item["bytes"] or digest(path, "md5") != item["md5"]:
            raise ValueError(f"Source length or MD5 differs for {name}")
    if digest(centers_path) != CENTERS_SHA or digest(thresholds_path) != THRESHOLDS_SHA:
        raise ValueError("Frozen Exp34 ROI or recalculated threshold fingerprint changed")
    donor_centers = {}
    for donor in ("Exp34_X1.tif", "Exp34_X2.tif", "Exp34_X3.tif"):
        donor_centers[donor] = np.empty((SITES, 2), dtype=np.int64)
    initial = np.empty((SITES, 2), dtype=np.int64)
    seen = set()
    with centers_path.open(newline="") as stream:
        for row in csv.DictReader(stream):
            donor = row["part"]
            i = int(row["site_1based"]) - 1
            if not 0 <= i < SITES or (donor, i) in seen:
                raise ValueError("Invalid frozen center table")
            seen.add((donor, i))
            initial[i] = int(row["initial_x"]), int(row["initial_y"])
            donor_centers[donor][i] = int(row["refit_x"]), int(row["refit_y"])
    if len(seen) != 3 * SITES:
        raise ValueError("Incomplete frozen center table")
    with thresholds_path.open(newline="") as stream:
        rows = list(csv.DictReader(stream))
    if [int(row["site_1based"]) for row in rows] != list(range(1, SITES + 1)):
        raise ValueError("Unexpected frozen threshold order")
    thresholds = np.array([float(row["threshold_counts"]) for row in rows])
    if any(part["exp34_part"] != "Exp34_X1.tif" for part in parts):
        raise ValueError("Primary mapping must use the predeclared common X1/X2 coordinates on every target part")
    if not np.array_equal(donor_centers["Exp34_X1.tif"], donor_centers["Exp34_X2.tif"]):
        raise ValueError("X1/X2 center identity differs from the frozen source")
    centers = {part["name"]: donor_centers[part["exp34_part"]] for part in parts}
    return manifest, initial, centers, donor_centers["Exp34_X3.tif"], thresholds


def images(path):
    with Image.open(path) as im:
        page = 0
        while True:
            try:
                im.seek(page)
            except EOFError:
                break
            pixels = np.asarray(im)
            if pixels.shape != FRAME_SHAPE or pixels.dtype.kind != "u" or pixels.dtype.itemsize != 2:
                raise ValueError(f"Incompatible image at {path.name} page {page + 1}")
            page += 1
            yield page, pixels


def box_bounds(xy):
    x, y = np.moveaxis(xy, -1, 0) - 1
    if np.any((x < 2) | (y < 2) | (x + 2 >= FRAME_SHAPE[1]) | (y + 2 >= FRAME_SHAPE[0])):
        raise ValueError("ROI exceeds the 5×5 integration domain")
    return y - 2, x - 2, y + 3, x + 3


def integral_sums(pixels, bounds):
    integral = np.zeros((pixels.shape[0] + 1, pixels.shape[1] + 1), dtype=np.int64)
    integral[1:, 1:] = pixels.cumsum(axis=0, dtype=np.int64).cumsum(axis=1, dtype=np.int64)
    y0, x0, y1, x1 = bounds
    return integral[y1, x1] - integral[y0, x1] - integral[y1, x0] + integral[y0, x0]


def predict_frozen(manifest, directory, centers, alternate, thresholds):
    pages = []
    parts = []
    columns = []
    for item in manifest["parts"]:
        name = item["name"]
        begin = len(pages)
        y0, x0, _, _ = box_bounds(np.stack((centers[name], alternate)))
        rows = y0[..., None, None] + np.arange(5)[None, :, None]
        cols = x0[..., None, None] + np.arange(5)[None, None, :]
        for local_page, pixels in images(directory / name):
            columns.append(pixels[rows, cols].sum(axis=(-2, -1), dtype=np.int64))
            pages.append((name, local_page))
        if begin == len(pages):
            raise ValueError(f"Empty TIFF {name}")
        parts.append((name, begin, len(pages)))
    sums = np.stack(columns, axis=-1)
    return pages, parts, sums, sums / 25 >= thresholds[:, None]


def load_reference(path, pages, expected_rounds):
    mat = loadmat(path, variable_names=["fluoAreshape", "fluodigreshape", "threshold"])
    counts, archive_bits, thresholds = (mat[name] for name in ("fluoAreshape", "fluodigreshape", "threshold"))
    if counts.ndim != 3 or counts.shape[:2] != (SITES, 2) or archive_bits.shape != counts.shape:
        raise ValueError(f"Target MAT arrays have incompatible dimensions {counts.shape}, {archive_bits.shape}")
    rounds = counts.shape[2]
    if pages != rounds * 2 or (expected_rounds is not None and expected_rounds != rounds):
        raise ValueError(f"TIFF pages={pages}, MAT ordered rounds={rounds}, manifest rounds={expected_rounds}")
    if thresholds.shape not in ((SITES, 1), (1, SITES)) or not np.all(np.isfinite(thresholds)):
        raise ValueError("Invalid archived thresholds")
    thresholds = thresholds.ravel()
    counts = counts.transpose(0, 2, 1).reshape(SITES, pages)
    bits = archive_bits.transpose(0, 2, 1).reshape(SITES, pages)
    sums = np.rint(counts * 25).astype(np.int64)
    if not np.array_equal(sums / 25, counts) or not np.all((bits == 0) | (bits == 1)):
        raise ValueError("Invalid target archive count lattice or occupancy values")
    return sums, bits.astype(bool), thresholds


def pattern_counts(bits):
    codes = 2 * bits[..., 0].astype(np.int8) + bits[..., 1]
    return np.bincount(codes.ravel(), minlength=4).tolist()


def frame_metrics(residual, decisions, reference_bits):
    return {
        "site_frames": residual.size,
        "count_mismatches": int(np.count_nonzero(residual)),
        "mean_delta_counts": float(residual.mean() / 25),
        "mean_abs_delta_counts": float(np.abs(residual).mean() / 25),
        "max_abs_delta_counts": float(np.abs(residual).max() / 25),
        "bit_mismatches": int(np.count_nonzero(decisions != reference_bits)),
        "archive_0_replay_1": int(np.count_nonzero(decisions & ~reference_bits)),
        "archive_1_replay_0": int(np.count_nonzero(~decisions & reference_bits)),
    }


def part_metrics(parts, delta, bits, archive_bits, pair_errors):
    result = []
    for name, begin, end in parts:
        # Attribute each ordered pair to its first frame, including any cross-part pair.
        start_pair = (begin + 1) // 2
        stop_pair = (end + 1) // 2
        errors = pair_errors[:, start_pair:stop_pair]
        result.append({"name": name, "pages": end-begin, "first_global_page": begin+1, "last_global_page": end,
                       **frame_metrics(delta[:,begin:end], bits[:,begin:end], archive_bits[:,begin:end]),
                       "rounds_starting_in_part": errors.shape[1], "site_pairs_starting_in_part": errors.size,
                       "pair_mismatches_starting_in_part": int(errors.sum()),
                       "rounds_with_mismatch_starting_in_part": int(np.any(errors, axis=0).sum())})
    return result


def write_primary(output, pages, parts, sums, bits, alternate_sums, alternate_bits, thresholds, reference, archive_bits, archive_thresholds):
    delta = sums - reference
    rounds = len(pages) // 2
    replay = bits.reshape(SITES, rounds, 2)
    archived = archive_bits.reshape(SITES, rounds, 2)
    pair_errors = np.any(replay != archived, axis=-1)
    alternate_delta = alternate_sums - reference
    alternate_replay = alternate_bits.reshape(SITES, rounds, 2)
    alternate_pair_errors = np.any(alternate_replay != archived, axis=-1)
    target_rule = sums / 25 >= archive_thresholds[:, None]
    archive_internal = reference / 25 >= archive_thresholds[:, None]
    with (output / "sites.csv").open("w", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(("site", "frames", "pairs", "exp34_threshold", "target_threshold", "count_mismatches",
                         "bit_mismatches", "pair_mismatches", "max_abs_delta_counts", "bit_mismatches_at_target_threshold",
                         "x3_count_mismatches", "x3_bit_mismatches", "x3_pair_mismatches"))
        for i in range(SITES):
            writer.writerow((i+1, len(pages), rounds, thresholds[i], archive_thresholds[i], np.count_nonzero(delta[i]),
                             np.count_nonzero(bits[i] != archive_bits[i]), pair_errors[i].sum(), np.abs(delta[i]).max()/25,
                             np.count_nonzero(target_rule[i] != archive_bits[i]), np.count_nonzero(alternate_delta[i]),
                             np.count_nonzero(alternate_bits[i] != archive_bits[i]), alternate_pair_errors[i].sum()))
    with (output / "rounds.csv").open("w", newline="") as group, gzip.open(
        output / "pairs.csv.gz", "wt", newline="", compresslevel=5
    ) as long:
        rw, pw = csv.writer(group), csv.writer(long)
        rw.writerow(("round", "part1", "local_page1", "global_page1", "part2", "local_page2", "global_page2",
                     "sites", "count_mismatches_f1", "count_mismatches_f2", "bit_mismatches_f1", "bit_mismatches_f2",
                     "pair_mismatches", *["replay_"+p for p in PATTERNS], *["archive_"+p for p in PATTERNS]))
        pw.writerow(("round", "site", "counts_f1", "counts_f2", "archive_counts_f1", "archive_counts_f2",
                     "bit_f1", "bit_f2", "archive_bit_f1", "archive_bit_f2", "pair_mismatch"))
        for k in range(rounds):
            f1, f2 = 2*k, 2*k+1
            rw.writerow((k+1, *pages[f1], f1+1, *pages[f2], f2+1, SITES,
                         np.count_nonzero(delta[:, f1]), np.count_nonzero(delta[:, f2]),
                         np.count_nonzero(bits[:, f1] != archive_bits[:, f1]), np.count_nonzero(bits[:, f2] != archive_bits[:, f2]),
                         np.count_nonzero(pair_errors[:, k]), *pattern_counts(replay[:, k]), *pattern_counts(archived[:, k])))
            pw.writerows((k+1, i+1, sums[i,f1]/25, sums[i,f2]/25, reference[i,f1]/25, reference[i,f2]/25,
                          int(bits[i,f1]), int(bits[i,f2]), int(archive_bits[i,f1]), int(archive_bits[i,f2]),
                          int(pair_errors[i,k])) for i in range(SITES))
    return {
        **frame_metrics(delta, bits, archive_bits), "pages": len(pages), "rounds": rounds, "site_pairs": SITES * rounds,
        "pair_mismatches": int(pair_errors.sum()), "rounds_with_mismatch": int(np.any(pair_errors, axis=0).sum()),
        "replay_patterns": dict(zip(PATTERNS, pattern_counts(replay), strict=True)),
        "archive_patterns": dict(zip(PATTERNS, pattern_counts(archived), strict=True)),
        "bit_mismatches_at_target_thresholds": int(np.count_nonzero(target_rule != archive_bits)),
        "archive_counts_at_archive_threshold_vs_archive_bit_mismatches": int(np.count_nonzero(archive_internal != archive_bits)),
        "max_abs_target_minus_frozen_threshold_counts": float(np.abs(archive_thresholds-thresholds).max()),
        "parts": part_metrics(parts, delta, bits, archive_bits, pair_errors),
        "x3_frozen_sensitivity": {
            **frame_metrics(alternate_delta, alternate_bits, archive_bits), "rounds": rounds, "site_pairs": SITES * rounds,
            "pair_mismatches": int(alternate_pair_errors.sum()),
            "rounds_with_mismatch": int(np.any(alternate_pair_errors, axis=0).sum()),
            "replay_patterns": dict(zip(PATTERNS, pattern_counts(alternate_replay), strict=True)),
            "parts": part_metrics(parts, alternate_delta, alternate_bits, archive_bits, alternate_pair_errors)},
        "cross_part_rounds": [1+i for i in range(rounds) if pages[2*i][0] != pages[2*i+1][0]],
    }


def diagnose_part(path, begin, end, initial, fixed, thresholds, sums, reference, archive_bits):
    """Use every fourth whole round for coordinate fitting; score only the remaining rounds."""
    candidates = initial[:,None,:] + OFFSETS
    bounds = box_bounds(candidates)
    errors = np.zeros(candidates.shape[:2], dtype=np.int64)
    total_abs = np.zeros_like(errors)
    fit_mask = ((np.arange(begin, end)//2 + 1) % 4) == 1
    train_n = int(fit_mask.sum())
    held_n = len(fit_mask) - train_n
    if train_n == 0 or held_n == 0:
        return {"name": path.name, "localization_frames": train_n, "holdout_frames": held_n,
                "status": "insufficient split for diagnostic"}, []
    for page, pixels in images(path):
        if fit_mask[page-1]:
            residual = integral_sums(pixels, bounds) - reference[:,begin+page-1,None]
            errors += residual != 0
            total_abs += np.abs(residual)
    sites = np.arange(SITES)
    best = np.lexsort((total_abs,errors), axis=1)[:,0]
    best_errors = errors[sites,best]
    tie_count = ((errors == best_errors[:,None]) & (total_abs == total_abs[sites,best,None])).sum(axis=1)
    exact_count = (errors == 0).sum(axis=1)
    centers = candidates[sites,best]
    new_bounds = box_bounds(centers)
    held_sums = []
    for page, pixels in images(path):
        if not fit_mask[page-1]:
            held_sums.append(integral_sums(pixels, new_bounds))
    held_sums = np.column_stack(held_sums)
    held_indices = np.flatnonzero(~fit_mask) + begin
    compare_sums = reference[:,held_indices]
    compare_bits = archive_bits[:,held_indices]
    new_bits = held_sums/25 >= thresholds[:,None]
    fixed_sums = sums[:,held_indices]
    fixed_bits = fixed_sums/25 >= thresholds[:,None]
    fixed_count_errors = fixed_sums != compare_sums
    fitted_count_errors = held_sums != compare_sums
    fixed_bit_errors = fixed_bits != compare_bits
    fitted_bit_errors = new_bits != compare_bits
    verified = (exact_count == 1) & ~fitted_count_errors.any(axis=1)
    shifts = centers-fixed
    rows = [(path.name, i+1, *fixed[i], *centers[i], *shifts[i], train_n, held_n, best_errors[i], exact_count[i],
             tie_count[i], int(verified[i]), int(fixed_count_errors[i].sum()), int(fitted_count_errors[i].sum()),
             int(fixed_bit_errors[i].sum()), int(fitted_bit_errors[i].sum())) for i in sites]
    return {
        "name": path.name, "localization_frames": train_n, "holdout_frames": held_n,
        "verified_centers": int(verified.sum()), "unique_exact_fit_sites": int(np.count_nonzero(exact_count==1)),
        "nonunique_or_no_exact_fit_sites": (np.flatnonzero(exact_count != 1)+1).tolist(),
        "heldout_count_residual_sites": (np.flatnonzero(fitted_count_errors.any(axis=1))+1).tolist(),
        "verified_shifts": [{"dx": dx, "dy": dy, "sites": n} for (dx,dy),n in
                            sorted(Counter(map(tuple, shifts[verified].tolist())).items())],
        "heldout_frozen": frame_metrics(fixed_sums-compare_sums, fixed_bits, compare_bits),
        "heldout_diagnostic": frame_metrics(held_sums-compare_sums, new_bits, compare_bits),
        "holdout_count_corrected": int(np.count_nonzero(fixed_count_errors & ~fitted_count_errors)),
        "holdout_count_introduced": int(np.count_nonzero(~fixed_count_errors & fitted_count_errors)),
        "holdout_bit_corrected": int(np.count_nonzero(fixed_bit_errors & ~fitted_bit_errors)),
        "holdout_bit_introduced": int(np.count_nonzero(~fixed_bit_errors & fitted_bit_errors)),
    }, rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ("manifest", "input-dir", "roi-centers", "thresholds", "output-dir"):
        parser.add_argument("--"+option, type=Path, required=True)
    args = parser.parse_args()
    if args.output_dir.exists():
        parser.error("Select an unused output directory")
    manifest, initial, centers, alternate, thresholds = load_inputs(args.manifest, args.input_dir, args.roi_centers, args.thresholds)
    pages, parts, all_sums, all_bits = predict_frozen(manifest, args.input_dir, centers, alternate, thresholds)
    sums, alternate_sums = all_sums
    bits, alternate_bits = all_bits
    print(f"Frozen predictions complete for {len(pages)} pages before opening target MAT arrays.", flush=True)
    reference, archive_bits, archive_thresholds = load_reference(
        args.input_dir / manifest["mat"]["name"], len(pages), manifest.get("rounds"))
    args.output_dir.parent.mkdir(parents=True, exist_ok=True)
    output = Path(mkdtemp(prefix=args.output_dir.name+".partial-", dir=args.output_dir.parent))
    primary = write_primary(output, pages, parts, sums, bits, alternate_sums, alternate_bits, thresholds,
                            reference, archive_bits, archive_thresholds)
    diagnostics = []
    with (output / "roi-diagnostic.csv").open("w", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(("part","site","fixed_x","fixed_y","diagnostic_x","diagnostic_y","dx","dy","localization_frames",
                         "holdout_frames","localization_mismatches","exact_candidates","best_ties","verified_center",
                         "fixed_holdout_count_mismatches","diagnostic_holdout_count_mismatches",
                         "fixed_holdout_bit_mismatches","diagnostic_holdout_bit_mismatches"))
        for name, begin, end in parts:
            stats, rows = diagnose_part(args.input_dir/name, begin, end, initial, centers[name], thresholds, sums, reference, archive_bits)
            diagnostics.append(stats)
            writer.writerows(rows)
            print(f"{name} primary and held-out diagnostic written", flush=True)
    summary = {"evidence": "87Rb Kim apparatus, Exp34 frozen parameter transfer to another experiment; cross-apparatus for Senoo",
               "target_experiment": manifest["target_experiment"], "manifest_sha256": digest(args.manifest),
               "worker_sha256": digest(Path(__file__)), "centers_sha256": CENTERS_SHA, "thresholds_sha256": THRESHOLDS_SHA,
               "target_files": [manifest["mat"], *manifest["parts"]], "primary": primary,
               "diagnostic_rule": "round mod 4 = 1 for localization; hold out other complete rounds; 121 candidate integer centers within ±5 px of public initial coordinate; minimize exact mismatches then sum absolute residual then (x,y); thresholds remain Exp34 for diagnostic",
               "roi_diagnostics": diagnostics,
               "output_sha256": {p.name:digest(p) for p in sorted(output.iterdir())}}
    (output/"summary.json").write_text(json.dumps(summary, indent=2)+"\n")
    if args.output_dir.exists():
        raise FileExistsError(args.output_dir)
    output.rename(args.output_dir)


if __name__ == "__main__":
    main()
