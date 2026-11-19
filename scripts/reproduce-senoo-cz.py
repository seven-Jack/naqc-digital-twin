"""Reproduce the Fig. 3b–d CZ benchmarking summaries from the publisher XLS."""

import argparse
import csv
from dataclasses import dataclass
from hashlib import sha256
import json
from math import fsum, isfinite, sqrt
from pathlib import Path

import xlrd

from senoo_cz_count_inference import infer_binomial_counts


ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "references/library/171yb/yb-senoo-source-fig3.xls"
WORKBOOK_SHA256 = "6f1ee3166116ca72325f07397d1eaf3a095a4d398e8ecdf529a85df819728ff6"
DOI = "10.1038/s41567-026-03258-8"
DEPTHS = (0, 4, 8, 12, 16, 20)
HEADERS = ["", "X", "Y", "Y error lower", "Y error upper"]


@dataclass(frozen=True)
class Point:
    depth: int
    observed: float
    lower_error: float
    upper_error: float
    cells: str

    @property
    def inverse_error(self):
        return 2 / (self.lower_error + self.upper_error)

    @property
    def weight(self):
        return self.inverse_error**2


def read_series(book, name):
    sheet = book.sheet_by_name(name)
    if (sheet.nrows, sheet.ncols) != (5, 7) or sheet.col_values(0) != HEADERS:
        raise ValueError(f"Unexpected worksheet layout for {name}")
    points = []
    for index, depth in enumerate(DEPTHS):
        column = index + 1
        label = xlrd.colname(column)
        cells = f"{name}!{label}2:{label}5"
        values = sheet.col_slice(column)
        if any(cell.ctype != xlrd.XL_CELL_NUMBER or not isfinite(cell.value) for cell in values):
            raise ValueError(f"Expected finite numerical cells in {cells}")
        source_index, x, y, lower, upper = [cell.value for cell in values]
        if source_index != index or x != depth or not (0 <= y <= 1 and lower > 0 and upper > 0):
            raise ValueError(f"Unexpected index, depth, or probability interval in {cells}")
        points.append(Point(depth, y, lower, upper, cells))
    return points


def read_panel_d(book):
    sheet = book.sheet_by_name("Fig3d")
    headers = ["", "X", "Y", "Y error"]
    labels = [r"$p_\mathrm{single}$", r"$p_\mathrm{corr}$", r"$p_\mathrm{single}^2$"]
    if (sheet.nrows, sheet.ncols) != (4, 4) or sheet.col_values(0) != headers or sheet.row_values(1)[1:] != labels:
        raise ValueError("Unexpected Fig3d workbook layout")
    rows = {}
    for column, metric in enumerate(("site_loss", "correlated_pair_loss", "independent_pair_reference"), start=1):
        col = xlrd.colname(column)
        value, error = sheet.col_values(column, start_rowx=2)
        if not all(isinstance(item, float) and isfinite(item) and 0 < item < 1 for item in (value, error)):
            raise ValueError(f"Invalid Fig3d values at {col}3:{col}4")
        rows[metric] = {"cells": f"Fig3d!{col}3:{col}4", "value": value, "error": error}
    return rows


def residual_metrics(points, predictions):
    residuals = [value - point.observed for point, value in zip(points, predictions, strict=True)]
    squares = fsum(residual**2 for residual in residuals)
    weighted_sse = fsum((residual * point.inverse_error)**2
                        for residual, point in zip(residuals, points, strict=True))
    return {
        "rmse": sqrt(squares / len(points)),
        "weighted_sse": weighted_sse,
        "inside_source_intervals": sum(-point.lower_error <= residual <= point.upper_error
                                       for residual, point in zip(residuals, points, strict=True)),
    }


def fit_grb(points, floor):
    def profile(decay):
        basis = [decay**point.depth for point in points]
        weighted_norm = fsum(point.weight * x*x for point, x in zip(points, basis, strict=True))
        numerator = fsum(point.weight * x * (point.observed - floor)
                         for point, x in zip(points, basis, strict=True))
        amplitude = min(1 - floor, max(0, numerator / weighted_norm))
        predictions = [amplitude * x + floor for x in basis]
        return residual_metrics(points, predictions)["weighted_sse"], amplitude, basis, predictions

    # Profile out a, locate the best p on [0, 1], then refine its grid bracket.
    grid = [step / 1000 for step in range(1001)]
    best = min(grid, key=lambda decay: profile(decay)[0])
    left, right = max(0, best - 0.001), min(1, best + 0.001)
    ratio = (sqrt(5) - 1) / 2
    for _ in range(60):
        lo = right - ratio*(right - left)
        hi = left + ratio*(right - left)
        if profile(lo)[0] < profile(hi)[0]:
            right = hi
        else:
            left = lo
    decay = min((best, left, right, (left + right)/2), key=lambda value: profile(value)[0])
    sse, amplitude, basis, predictions = profile(decay)
    if not (0 < decay < 1 and 0 < amplitude < 1 - floor):
        raise ValueError("A boundary solution needs a different uncertainty analysis")

    derivative = [amplitude * point.depth * decay**(point.depth - 1) for point in points]
    norm_a = fsum(point.weight * x*x for point, x in zip(points, basis, strict=True))
    norm_p = fsum(point.weight * x*x for point, x in zip(points, derivative, strict=True))
    cross = fsum(point.weight*x*dx for point, x, dx in zip(points, basis, derivative, strict=True))
    variance_p = (sse / (len(points) - 2)) * norm_a / (norm_a * norm_p - cross**2)
    return predictions, {
        "a": amplitude, "p": decay, "b": floor,
        "fidelity_per_cz": 1 - (1 - floor)*(1 - decay),
        "fidelity_standard_error": (1 - floor)*sqrt(variance_p),
    }


def fit_loss(points):
    total_weight = fsum(point.weight for point in points)
    mean_x = fsum(point.weight * point.depth for point in points) / total_weight
    mean_y = fsum(point.weight * point.observed for point in points) / total_weight
    moment_xx = fsum(point.weight * (point.depth - mean_x)**2 for point in points)
    moment_xy = fsum(point.weight * (point.depth - mean_x)*(point.observed - mean_y) for point in points)
    slope = moment_xy / moment_xx
    intercept = mean_y - slope * mean_x
    predicts = [intercept + slope*point.depth for point in points]
    sse = residual_metrics(points, predicts)["weighted_sse"]
    return predicts, {
        "intercept": intercept,
        "slope_per_cz": slope,
        "slope_standard_error": sqrt(sse / ((len(points) - 2)*moment_xx)),
    }


def compare_series(points, condition, unit, predictions):
    rows = []
    for point, prediction in zip(points, predictions, strict=True):
        counts = infer_binomial_counts(point.observed, point.lower_error, point.upper_error)
        residual = prediction - point.observed
        rows.append({
            "source_cells": point.cells, "condition": condition, "denominator_unit": unit,
            "cz_depth": point.depth, "observed_probability": point.observed,
            "source_error_lower": point.lower_error, "source_error_upper": point.upper_error,
            "fitted_probability": prediction, "fit_minus_observation": residual,
            "residual_over_mean_error": residual * point.inverse_error,
            "inside_source_interval": -point.lower_error <= residual <= point.upper_error,
            "inferred_numerator": counts["numerator"], "inferred_denominator": counts["denominator"],
            "count_provenance": "inferred_from_68pct_clopper_pearson",
            "cp_lower_tail": counts["cp_lower_tail"], "cp_upper_tail": counts["cp_upper_tail"],
        })
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path", type=Path, help="Destination for the Fig. 3b and 3c observations and residuals")
    args = parser.parse_args()
    content = WORKBOOK.read_bytes()
    digest = sha256(content).hexdigest()
    if digest != WORKBOOK_SHA256:
        raise ValueError(f"Unexpected Fig. 3 XLS SHA-256: {digest}")
    book = xlrd.open_workbook(file_contents=content)

    results_b, results_c, result_rows = {}, {}, []
    for condition, floor, paper_percent, paper_error_percent in (
        ("prep", 0.0, 99.37, 0.07), ("decay", 0.0, 99.51, 0.06), ("loss", 0.25, 99.78, 0.04),
    ):
        points = read_series(book, f"Fig3b_{condition}")
        predictions, summary = fit_grb(points, floor)
        results_b[condition] = {
            **summary, **residual_metrics(points, predictions),
            "paper_fidelity": paper_percent / 100,
            "paper_fidelity_error": paper_error_percent / 100,
        }
        result_rows.extend(compare_series(points, condition, "atom_pair", predictions))

    for sheet, metric, unit in (
        ("Fig3c_single", "site_loss", "atom_site"),
        ("Fig3c_corr", "correlated_pair_loss", "atom_pair"),
    ):
        points = read_series(book, sheet)
        predictions, summary = fit_loss(points)
        results_c[metric] = {**summary, **residual_metrics(points, predictions)}
        result_rows.extend(compare_series(points, "prep_" + metric, unit, predictions))

    d = read_panel_d(book)
    for metric in ("site_loss", "correlated_pair_loss"):
        d[metric]["fitted_minus_source"] = results_c[metric]["slope_per_cz"] - d[metric]["value"]
        d[metric]["fit_se_minus_source_error"] = results_c[metric]["slope_standard_error"] - d[metric]["error"]
    single = d["site_loss"]["value"]
    independent = d["independent_pair_reference"]
    independent["square_minus_source"] = single**2 - independent["value"]
    independent["derived_from"] = d["site_loss"]["cells"]
    corr_to_independent = d["correlated_pair_loss"]["value"] / independent["value"]

    args.csv_path.parent.mkdir(parents=True, exist_ok=True)
    with args.csv_path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=list(result_rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(result_rows)
    print(json.dumps({
        "evidence_kind": "literature_reproduction", "doi": DOI, "workbook_sha256": digest,
        "figure_3b": results_b, "figure_3b_caption_approx_valid_measurements_per_point": [2800, 3200],
        "figure_3c": results_c, "figure_3d": d, "correlated_to_independent_ratio": corr_to_independent,
        "rows": len(result_rows),
    }, indent=2))


if __name__ == "__main__":
    main()
