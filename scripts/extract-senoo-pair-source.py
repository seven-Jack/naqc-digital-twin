"""Extract the archived Senoo Extended Data 5f, 4f and 4e observations as JSON."""

from hashlib import sha256
import json
from math import isfinite
from pathlib import Path

import xlrd


LIBRARY = Path(__file__).resolve().parents[1] / "references/library/171yb"
ED4_SHA256 = "3d9b826aebf68aa42e68a58cda041e85fd3884814bd1faf5320e17f574b7938a"
ED5_SHA256 = "50e0c772922806070d0396798eb8f3cf3f2d10d106b9fda69ada5ac0d2c0a3c0"


def open_archive(filename, expected_hash):
    original = (LIBRARY / filename).read_bytes()
    digest = sha256(original).hexdigest()
    if digest != expected_hash:
        raise ValueError(f"Unexpected archive SHA-256 for {filename}: {digest}")
    return xlrd.open_workbook(file_contents=original), digest


def source_columns(book, sheet_name, headers, count):
    sheet = book.sheet_by_name(sheet_name)
    if (sheet.nrows, sheet.ncols) != (len(headers), count + 1) or sheet.col_values(0) != headers:
        raise ValueError(f"Unexpected row layout in {sheet_name}")
    for column in range(1, sheet.ncols):
        letter = xlrd.colname(column)
        locator = f"{sheet_name}!{letter}2:{letter}5"
        cells = sheet.col_slice(column)
        if any(cell.ctype != xlrd.XL_CELL_NUMBER or not isfinite(cell.value) for cell in cells):
            raise ValueError(f"Expected finite numeric cells in {locator} and its index")
        index, *values = [cell.value for cell in cells]
        if index != column - 1:
            raise ValueError(f"Unexpected index in {sheet_name}!{letter}1")
        yield locator, values


def extract_shifts(book):
    headers = ["", "X", "Y", "Y error", "X error"]
    points = []
    for sheet, direction, count in (("ExtendedDataFig5f_1", "perpendicular", 4),
                                    ("ExtendedDataFig5f_2", "parallel", 1)):
        for cells, (distance, shift, shift_error, distance_error) in source_columns(book, sheet, headers, count):
            if not (0 < distance_error < distance and shift > 0 and shift_error > 0):
                raise ValueError(f"Invalid distance, shift or error magnitude in {cells}")
            points.append({
                "cells": cells,
                "direction": direction,
                "distanceUm": distance,
                "distanceErrorUm": distance_error,
                "shiftMHz": shift,
                "shiftErrorMHz": shift_error,
            })
    return points


def extract_population(book, sheet_name):
    headers = ["", "X", "Y", "Y error lower", "Y error upper"]
    points = []
    for index, (cells, (time, population, lower, upper)) in enumerate(
        source_columns(book, sheet_name, headers, 60)
    ):
        if time < 0 or (points and time <= points[-1]["timeUs"]):
            raise ValueError(f"Unexpected time or time order in {cells}")
        if not (0 <= population <= 1 and lower >= 0 and upper >= 0 and lower + upper > 0):
            raise ValueError(f"Invalid population or error magnitude in {cells}")
        points.append({
            "cells": cells,
            "timeUs": time,
            "population": population,
            "lowerError": lower,
            "upperError": upper,
            "window": index // 15 + 1,
        })
    return points


def main():
    ed4, ed4_digest = open_archive("yb-senoo-source-edfig4.xls", ED4_SHA256)
    ed5, ed5_digest = open_archive("yb-senoo-source-edfig5.xls", ED5_SHA256)
    print(json.dumps({
        "doi": "10.1038/s41567-026-03258-8",
        "ed4Sha256": ed4_digest,
        "ed5Sha256": ed5_digest,
        "shifts": extract_shifts(ed5),
        "blockade": extract_population(ed4, "ExtendedDataFig4f"),
        "singleAtom": extract_population(ed4, "ExtendedDataFig4e"),
    }, allow_nan=False))


if __name__ == "__main__":
    main()
