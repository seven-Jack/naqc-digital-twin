"""Reproduce the loss-detected Bell-state observables of Senoo Fig. 1c, 1d, or 2f."""

import argparse
import csv
from dataclasses import dataclass
from hashlib import sha256
import json
from math import atan2, hypot, isfinite, sqrt, tau
from pathlib import Path

import numpy as np
import xlrd

from senoo_cz_count_inference import clopper_pearson_interval, infer_binomial_counts


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "references/library/171yb/yb-senoo-source-fig1.xls"
SOURCE_SHA256 = "4541abdfa77a39fc4f8da775ec968a74c30682a0f4c5c0188511818c59b56cee"
PXP_SOURCE = ROOT / "references/library/171yb/yb-senoo-source-fig2.xls"
PXP_SOURCE_SHA256 = "81a4c54bd1619b23ce8d60e6f136b2c20912c0f22d8dcef8a053b36a400688f4"
DOI = "10.1038/s41567-026-03258-8"
HEADERS = ["", "X", "Y", "Y error lower", "Y error upper"]
HARMONIC_SEARCH_BOUNDS = (0.85, 1.15)
METASTABLE_STATES = ("00", "01", "10", "11")
CLOCK_STATES = ("gg", "gm", "mg", "mm")
PANEL_LAYOUTS = {
    "1c": ((0, 1, 10, 11), METASTABLE_STATES, 41),
    "1d": (tuple(f"${state}$" for state in CLOCK_STATES), CLOCK_STATES, 60),
}


@dataclass(frozen=True)
class SourcePoint:
    x: float | str
    observed: float
    lower_error: float
    upper_error: float
    cells: str


def read_sheet(book, sheet_name, count, population_axis=None):
    sheet = book.sheet_by_name(sheet_name)
    if (sheet.nrows, sheet.ncols) != (5, count + 1) or sheet.col_values(0) != HEADERS:
        raise ValueError(f"Unexpected layout for {sheet_name}")
    points = []
    for column in range(1, sheet.ncols):
        col = xlrd.colname(column)
        cells = f"{sheet_name}!{col}2:{col}5"
        series = sheet.col_slice(column)
        numeric_cells = series if population_axis is None else [series[0], *series[2:]]
        if any(cell.ctype != xlrd.XL_CELL_NUMBER or not isfinite(cell.value) for cell in numeric_cells):
            raise ValueError(f"Expected finite numerical cells at {cells}")
        index, x, observed, lower, upper = [cell.value for cell in series]
        if population_axis is not None and x != population_axis[column - 1]:
            raise ValueError(f"Unexpected state at {cells}")
        if index != column - 1 or not (lower >= 0 and upper >= 0 and lower + upper > 0):
            raise ValueError(f"Unexpected index or error bars at {cells}")
        points.append(SourcePoint(x, observed, lower, upper, cells))
    return points


def fit_parity(points, fit_harmonic=False):
    x = np.array([point.x for point in points])
    observed = np.array([point.observed for point in points])
    inverse_error = np.array([2 / (point.lower_error + point.upper_error) for point in points])
    weighted_observed = observed * inverse_error
    base_phase = tau * x

    def linear_fit(harmonic):
        phase = base_phase * harmonic
        design = np.column_stack([np.ones_like(x), np.cos(phase), np.sin(phase)])
        weighted = design * inverse_error[:, None]
        coefficients, _, rank, _ = np.linalg.lstsq(weighted, weighted_observed, rcond=None)
        if rank != 3:
            raise ValueError("Parity phase samples do not identify all three coefficients")
        predicts = design @ coefficients
        residual = predicts - observed
        scaled_sse = float(np.sum((residual * inverse_error)**2))
        return scaled_sse, coefficients, predicts, residual, weighted

    harmonic = 1.0
    if fit_harmonic:
        grid = np.linspace(*HARMONIC_SEARCH_BOUNDS, 301)
        min_index = min(range(len(grid)), key=lambda idx: linear_fit(grid[idx])[0])
        if min_index in (0, len(grid) - 1):
            raise ValueError("Expected an interior harmonic minimum in the search interval")
        left, right = grid[min_index - 1], grid[min_index + 1]
        inverse_golden_ratio = (sqrt(5) - 1) / 2
        for _ in range(36):
            abscissa_left = right - inverse_golden_ratio * (right - left)
            abscissa_right = left + inverse_golden_ratio * (right - left)
            if linear_fit(abscissa_left)[0] <= linear_fit(abscissa_right)[0]:
                right = abscissa_right
            else:
                left = abscissa_left
        harmonic = float((left + right) / 2)

    scaled_sse, coefficients, predicts, residual, weighted = linear_fit(harmonic)
    offset, cosine, sine = coefficients
    amplitude = hypot(cosine, sine)
    amplitude_gradient = np.array([0, cosine / amplitude, sine / amplitude])
    if fit_harmonic:
        phase = base_phase * harmonic
        frequency_derivative = base_phase * (-cosine * np.sin(phase) + sine * np.cos(phase))
        weighted = np.column_stack([weighted, frequency_derivative * inverse_error])
        amplitude_gradient = np.append(amplitude_gradient, 0)
    covariance = np.linalg.inv(weighted.T @ weighted) * scaled_sse / (len(points) - weighted.shape[1])
    largest = int(np.argmax(np.abs(residual)))
    summary = {
        "offset": float(offset), "cosine": float(cosine), "sine": float(sine),
        "amplitude": amplitude,
        "phase_in_sine_model_rad": atan2(cosine, sine),
        "amplitude_standard_error": sqrt(amplitude_gradient @ covariance @ amplitude_gradient),
        "rmse": sqrt(float(np.mean(residual**2))),
        "scaled_residual_rms": sqrt(scaled_sse / len(points)),
        "inside_source_intervals": sum(-pt.lower_error <= float(err) <= pt.upper_error
                                       for pt, err in zip(points, residual, strict=True)),
        "largest_absolute_residual": {
            "cells": points[largest].cells, "phase_over_pi": points[largest].x, "residual": float(residual[largest]),
        },
    }
    if fit_harmonic:
        summary.update({
            "phase_frequency_multiplier": harmonic,
            "phase_frequency_multiplier_standard_error": sqrt(covariance[-1, -1]),
            "phase_frequency_multiplier_search_bounds": HARMONIC_SEARCH_BOUNDS,
        })
    return predicts, summary


def data_row(point, observable, event, count_result, state=None, phase=None, prediction=None):
    observed_count = count_result["numerator"]
    valid_pairs = count_result["denominator"]
    residual = None if prediction is None else prediction - point.observed
    return {
        "source_cells": point.cells, "observable": observable, "state": state, "phase_over_pi": phase,
        "observed": point.observed, "source_error_lower": point.lower_error, "source_error_upper": point.upper_error,
        "fitted_parity": prediction, "fit_minus_observed": residual,
        "inside_source_interval": None if residual is None else -point.lower_error <= residual <= point.upper_error,
        "selection": "loss_detected", "inferred_event": event,
        "inferred_event_count": observed_count, "inferred_complement_count": valid_pairs - observed_count,
        "inferred_valid_pairs": valid_pairs, "count_provenance": "inferred_from_68pct_clopper_pearson",
        "cp_lower_tail": count_result["cp_lower_tail"], "cp_upper_tail": count_result["cp_upper_tail"],
    }


def public_matrix_population_check(populations):
    # Table 1 contains prepared-state probabilities, including preparation effects.
    # This checks population sensitivity only; the actual Fig. 1c matrix is unpublished.
    table_matrix = np.array([[0.949, 0.0018], [0.0070, 0.969]])
    results = {}
    for name, matrix in (("table1_full", table_matrix), ("table1_loss_only", np.diag(np.diag(table_matrix)))):
        corrected = np.linalg.solve(np.kron(matrix, matrix), np.array(populations))
        if np.any(corrected < 0):
            raise ValueError("The Table 1 population check needs a non-negative count solution")
        results[name] = float(corrected[[0, 3]].sum() / corrected.sum())
    return {"table1_matrix_proxy": table_matrix.tolist(), **results}


def analyse_population(populations, states, target_parity):
    if any(not 0 <= point.observed <= 1 for point in populations):
        raise ValueError("Expected populations within [0, 1]")
    population_counts = [infer_binomial_counts(point.observed, point.lower_error, point.upper_error)
                         for point in populations]
    valid_pairs = population_counts[0]["denominator"]
    if any(item["denominator"] != valid_pairs for item in population_counts) or sum(
        item["numerator"] for item in population_counts
    ) != valid_pairs:
        raise ValueError("The reconstructed populations do not close to one joint count table")
    target_indices = (0, 3) if target_parity == "even" else (1, 2)
    target_pairs = sum(population_counts[index]["numerator"] for index in target_indices)
    target_population = target_pairs / valid_pairs
    target_standard_error = sqrt(target_population * (1 - target_population) / valid_pairs)
    rows = [data_row(point, "population", f"state_{state}", counts, state=state)
            for point, state, counts in zip(populations, states, population_counts, strict=True)]
    summary = {
        "counts": dict(zip(states, (item["numerator"] for item in population_counts), strict=True)),
        "inferred_valid_pairs": valid_pairs, f"inferred_{target_parity}_pairs": target_pairs,
        f"{target_parity}_population": target_population,
        f"{target_parity}_population_standard_error": target_standard_error,
        f"{target_parity}_population_68pct_clopper_pearson": clopper_pearson_interval(target_pairs, valid_pairs),
    }
    return rows, summary


def analyse_parity(parity, caption_count, include_free_harmonic=False):
    if any(not -1 <= point.observed <= 1 for point in parity) or any(
        left.x >= right.x for left, right in zip(parity, parity[1:])
    ):
        raise ValueError("Expected ordered parity samples within [-1, 1]")
    predictions, parity_fit = fit_parity(parity)
    rows = []
    phase_counts = []
    for point, prediction in zip(parity, predictions, strict=True):
        counts = infer_binomial_counts((point.observed + 1) / 2, point.lower_error / 2, point.upper_error / 2)
        phase_counts.append(counts)
        rows.append(data_row(point, "parity", "even_parity", counts, phase=point.x, prediction=float(prediction)))

    parity_denominators = [item["denominator"] for item in phase_counts]
    summary = {
        **parity_fit, "phase_points": len(parity),
        "inferred_valid_pairs_per_phase_range": [min(parity_denominators), max(parity_denominators)],
        "sum_of_inferred_pairs_over_different_phases": sum(parity_denominators),
        f"phases_with_fewer_than_{caption_count}_valid_pairs": [
            {"cells": point.cells, "denominator": count}
            for point, count in zip(parity, parity_denominators, strict=True) if count < caption_count
        ],
    }
    if include_free_harmonic:
        free_predictions, free_fit = fit_parity(parity, fit_harmonic=True)
        for row, point, prediction in zip(rows, parity, free_predictions, strict=True):
            residual = float(prediction) - point.observed
            row.update({
                "fitted_parity_free_harmonic": float(prediction),
                "free_harmonic_fit_minus_observed": residual,
                "inside_source_interval_free_harmonic": -point.lower_error <= residual <= point.upper_error,
            })
    else:
        free_fit = None
    return rows, summary, free_fit


def bell_fidelity(population, parity):
    # Distinct population and parity acquisitions; aggregate XLS gives no cross-covariance.
    return {
        "fidelity": (population["even_population"] + parity["amplitude"]) / 2,
        "standard_error": hypot(population["even_population_standard_error"], parity["amplitude_standard_error"]) / 2,
    }


def analyse_panel(book, panel):
    population_axis, states, phase_count = PANEL_LAYOUTS[panel]
    populations = read_sheet(book, f"Fig{panel}_left", len(states), population_axis=population_axis)
    parity = read_sheet(book, f"Fig{panel}_right", phase_count)
    population_rows, population = analyse_population(populations, states, "even")
    parity_rows, parity_summary, _ = analyse_parity(parity, 200)
    rows = population_rows + parity_rows
    summary = {
        "population": population,
        "parity": parity_summary,
        "uncorrected_reconstructed": bell_fidelity(population, parity_summary),
    }
    return populations, rows, summary


def panel_differences(clock, metastable):
    quantities = {
        "population": ("population", "even_population", "even_population_standard_error"),
        "parity_amplitude": ("parity", "amplitude", "amplitude_standard_error"),
        "fidelity": ("uncorrected_reconstructed", "fidelity", "standard_error"),
    }
    return {
        name: {
            "delta": clock[section][value] - metastable[section][value],
            "standard_error_assuming_independent_panels": hypot(clock[section][error], metastable[section][error]),
        }
        for name, (section, value, error) in quantities.items()
    }


def analyse_pxp(figure1, figure2):
    layouts = (
        ("r_to_m_odd", "left_bottom", tuple(f"${state}$" for state in METASTABLE_STATES),
         METASTABLE_STATES, "odd", None),
        ("m_even", "left_top", (0, 1, 10, 11), METASTABLE_STATES, "even", "right_top"),
        ("o_even", "center_bottom", tuple(f"${state}$" for state in CLOCK_STATES),
         CLOCK_STATES, "even", "right_bottom"),
    )
    reported = {
        "m_even": {
            "uncorrected": {"fidelity": 0.963, "error": 0.008},
            "even_population": {"value": 0.968, "error": 0.003},
            "parity_amplitude": {"value": 0.958, "error": 0.015},
        },
        "o_even": {
            "uncorrected": {"fidelity": 0.924, "error": 0.009},
            "even_population": {"value": 0.964, "error": 0.003},
            "parity_amplitude": {"value": 0.883, "error": 0.018},
        },
    }
    stages = {}
    rows = []
    for name, population_sheet, axis, states, target_parity, parity_sheet in layouts:
        populations = read_sheet(figure2, f"Fig2f_{population_sheet}", len(states), population_axis=axis)
        population_rows, population = analyse_population(populations, states, target_parity)
        stage = {"population": population}
        stage_rows = population_rows
        if parity_sheet is not None:
            parity = read_sheet(figure2, f"Fig2f_{parity_sheet}", 31)
            parity_rows, parity_summary, free_fit = analyse_parity(parity, 100, include_free_harmonic=True)
            stage.update({
                "parity": parity_summary,
                "uncorrected_reconstructed": bell_fidelity(population, parity_summary),
                "free_harmonic_sensitivity": {
                    "parity": free_fit,
                    "uncorrected_reconstructed": bell_fidelity(population, free_fit),
                },
                "paper_reported": reported[name],
            })
            stage_rows += parity_rows
        stages[name] = stage
        for row in stage_rows:
            rows.append({
                "stage": name, **row,
                "fitted_parity_free_harmonic": row.get("fitted_parity_free_harmonic"),
                "free_harmonic_fit_minus_observed": row.get("free_harmonic_fit_minus_observed"),
                "inside_source_interval_free_harmonic": row.get("inside_source_interval_free_harmonic"),
            })

    _, _, figure1c = analyse_panel(figure1, "1c")
    _, _, figure1d = analyse_panel(figure1, "1d")
    metastable, clock = stages["m_even"], stages["o_even"]
    return rows, {
        "workbook_sha256": PXP_SOURCE_SHA256,
        "comparison_workbook_sha256": SOURCE_SHA256,
        "caption_population_valid_measurements_range": [3000, 4000],
        "caption_parity_valid_measurements_per_phase_more_than": 100,
        "stages": stages,
        "matched_differences": {
            "2f_m_minus_1c": panel_differences(metastable, figure1c),
            "2f_o_minus_1d": panel_differences(clock, figure1d),
            "2f_o_minus_2f_m": panel_differences(clock, metastable),
            "2f_o_minus_2f_m_free_harmonic": panel_differences(
                {**clock, **clock["free_harmonic_sensitivity"]},
                {**metastable, **metastable["free_harmonic_sensitivity"]},
            ),
        },
    }


def open_workbook(source, expected_sha256, figure):
    original = source.read_bytes()
    digest = sha256(original).hexdigest()
    if digest != expected_sha256:
        raise ValueError(f"Unexpected Fig. {figure} XLS SHA-256: {digest}")
    return xlrd.open_workbook(file_contents=original)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--panel", choices=[*PANEL_LAYOUTS, "2f"], default="1c", help="Select the data panel (default: 1c)")
    parser.add_argument("csv_path", type=Path, help="Destination for the selected populations and parity residuals")
    args = parser.parse_args()
    book = open_workbook(SOURCE, SOURCE_SHA256, 1)
    if args.panel == "2f":
        figure2 = open_workbook(PXP_SOURCE, PXP_SOURCE_SHA256, 2)
        rows, summary = analyse_pxp(book, figure2)
        result = {"evidence_kind": "literature_reproduction", "doi": DOI, "condition": "loss_detected", **summary}
    else:
        populations, rows, summary = analyse_panel(book, args.panel)
        result = {
            "evidence_kind": "literature_reproduction", "doi": DOI, "workbook_sha256": SOURCE_SHA256,
            "condition": "loss_detected", "atom_pairs_reported": 9, **summary,
        }
    if args.panel == "1c":
        population_sensitivity = public_matrix_population_check([point.observed for point in populations])
        population_only_reference = (population_sensitivity["table1_full"] + summary["parity"]["amplitude"]) / 2
        result["paper_reported"] = {
            "uncorrected": {"fidelity": 0.986, "error": 0.003},
            "loss_imbalance_only_sensitivity": {"fidelity": 0.987, "error": 0.003},
            "measurement_error_corrected": {"fidelity": 0.990, "error": 0.003},
        }
        result["population_only_sensitivity"] = {
            **population_sensitivity,
            "bell_reference_with_raw_parity_amplitude": population_only_reference,
        }
    elif args.panel == "1d":
        _, _, metastable = analyse_panel(book, "1c")
        result["paper_reported"] = {
            "uncorrected": {"fidelity": 0.938, "error": 0.006},
            "even_population": {"value": 0.986, "error": 0.002},
            "parity_amplitude": {"value": 0.891, "error": 0.001},
        }
        result["difference_1d_minus_1c"] = panel_differences(summary, metastable)

    args.csv_path.parent.mkdir(parents=True, exist_ok=True)
    with args.csv_path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
