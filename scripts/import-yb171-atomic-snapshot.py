#!/usr/bin/env python3
"""Import the reviewed local 171YbDatabase snapshot into the digital twin."""

import argparse
import hashlib
import json
import math
from decimal import Decimal
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src/data/yb171AtomicSnapshot.generated.json"
CLOCK_OUTPUT = ROOT / "src/data/yb171ClockReference.generated.json"
MANIFEST_SHA256 = "7fee71aed8995307d1dd708b7710d8b0de29f16a8822152b579dbe6454d16aa2"
DECAY_SHA256 = "fdae6eabc6673cc7abc2746223376ab46806a7c16584751db42411923c1155bf"
FILES = ("levels", "transitions", "hyperfine", "sources", "decay", "rydberg-series")

# The electron-volt conversion is exact. The Bohr radius is from CODATA 2022.
EA0_IN_COULOMB_METRE = 1.602176634e-19 * 5.29177210544e-11
SI = {
    "nm": ("m", 1e-9), "Hz": ("Hz", 1), "MHz": ("Hz", 1e6), "THz": ("Hz", 1e12),
    "ns": ("s", 1e-9), "s^-1": ("s^-1", 1),
    "eV": ("J", 1.602176634e-19), "cm^-1": ("m^-1", 100),
    "e*a0": ("C m", EA0_IN_COULOMB_METRE), "dimensionless": ("1", 1),
}


def read_checked_json(path: Path, expected_digest: str) -> dict:
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected_digest:
        raise ValueError(f"SHA-256 mismatch: {path}")
    record = json.loads(raw)
    if record["schemaVersion"] != 1:
        raise ValueError(f"Unsupported schema version: {path}")
    return record


def finite_or_unknown(value):
    if value is None:
        return value
    if type(value) not in (int, float) or not math.isfinite(value):
        raise ValueError(f"Expected a finite numeric value or null, received {value!r}")
    return value


def convert_quantity(quantity: dict, source_ids: set) -> dict:
    if quantity["sourceId"] not in source_ids:
        raise ValueError(f"Unknown quantity source: {quantity['sourceId']}")
    unit, factor = SI[quantity["unit"]]
    value = finite_or_unknown(quantity["value"])
    uncertainty = finite_or_unknown(quantity["uncertainty"])
    if uncertainty is not None and uncertainty < 0:
        raise ValueError("Uncertainty must be nonnegative or unknown")
    return {
        **quantity,
        "siUnit": unit,
        "siValue": None if value is None else value * factor,
        "siUncertainty": None if uncertainty is None else uncertainty * factor,
    }


def keyed_catalogue(records: list) -> dict:
    catalogue = {record["id"]: record for record in records}
    if len(catalogue) != len(records):
        raise ValueError("Duplicate atomic record ID")
    return catalogue


def make_snapshot(database: Path) -> dict:
    manifest = read_checked_json(database / "data/dataset.json", MANIFEST_SHA256)
    digests = {entry["path"]: entry["sha256"] for entry in manifest["files"]}
    files = {f"data/{name}.json": DECAY_SHA256 if name == "decay" else digests[f"data/{name}.json"] for name in FILES}
    inputs = {name: read_checked_json(database / f"data/{name}.json", files[f"data/{name}.json"]) for name in FILES}
    for name in ("levels", "transitions", "hyperfine", "rydberg-series"):
        if inputs[name]["isotope"] != 171:
            raise ValueError(f"Unexpected isotope in {name}")

    references = keyed_catalogue(inputs["sources"]["references"] + inputs["sources"]["sources"])
    sources = {}
    for source_id, reference in references.items():
        fields = (
            "id", "title", "detail", "doi", "url", "arxivVersion", "reviewStatus",
            "identityStatus", "numericalValidation", "rightsStatus",
        )
        sources[source_id] = {field: reference[field] for field in fields if field in reference}
    source_ids = set(sources)

    levels = keyed_catalogue(inputs["levels"]["records"])
    for record in levels.values():
        if record["isotope"] != 171:
            raise ValueError(f"Unexpected isotope in {record['id']}")
        record["quantities"] = {name: convert_quantity(value, source_ids) for name, value in record["quantities"].items()}

    transitions = keyed_catalogue(inputs["transitions"]["records"])
    for record in transitions.values():
        for field in ("lowerLevelId", "upperLevelId"):
            if record[field] not in levels:
                raise ValueError(f"Unknown level in {record['id']}: {record[field]}")
        record.pop("views")
        record["quantities"] = {name: convert_quantity(value, source_ids) for name, value in record["quantities"].items()}

    # The T3 sourceDecimal is in THz. Convert before casting to binary64 to
    # preserve the sub-Hz reference and avoid rounding the THz input twice.
    clock_frequency = transitions["T3"]["quantities"]["frequency_THz"]
    if clock_frequency["unit"] != "THz":
        raise ValueError("Unexpected T3 frequency unit")
    frequency_hz = Decimal(clock_frequency["conditions"]["sourceDecimal"]) * Decimal("1e12")
    clock_frequency["siDecimalValue"] = str(frequency_hz)
    clock_frequency["siValue"] = float(frequency_hz)

    hyperfine = inputs["hyperfine"]
    for state in hyperfine["states"].values():
        if state["levelId"] not in levels or state["sourceId"] not in sources or state["unit"] != "MHz":
            raise ValueError(f"Invalid hyperfine reference: {state['levelId']}")
        state["aOverHHz"] = finite_or_unknown(state["legacy"]["A"]) * 1e6
        state["sublevelsHz"] = [
            {"F": finite_or_unknown(sublevel["F"]), "shiftHz": finite_or_unknown(sublevel["shift"]) * 1e6}
            for sublevel in state["legacy"]["levels"]
        ]

    decay = inputs["decay"]
    decay_source_ids = set(keyed_catalogue(decay["sources"]))
    for record in decay["records"]:
        if record["levelId"] not in levels:
            raise ValueError(f"Unknown decay level: {record['levelId']}")
        for entry in [record, *record["branches"], *record["rateEvidence"]]:
            if set(entry["sourceIds"]) - decay_source_ids:
                raise ValueError(f"Unknown decay source for {record['levelId']}")
            if "value" in entry:
                finite_or_unknown(entry["value"])
                finite_or_unknown(entry["uncertainty"])

    rydberg = inputs["rydberg-series"]
    if rydberg["B_T"] != 0 or rydberg["E_V_m"] != 0 or rydberg["sourceId"] not in sources:
        raise ValueError("R017 snapshot must have a declared zero-field source")
    branches = {(state["n"], state["Fp"]) for state in rydberg["states"]}
    if len(rydberg["states"]) != 144 or branches != {(n, f) for n in range(29, 101) for f in (0.5, 1.5)}:
        raise ValueError("R017 snapshot does not contain both branches for n=29–100")
    for state in rydberg["states"]:
        for field in ("nu", "level_Hz", "frequency_Hz", "dipole_ea0", "wavelength_nm"):
            finite_or_unknown(state[field])
        state["wavelengthM"] = state["wavelength_nm"] * 1e-9
        state["signedReducedDipoleCM"] = state["dipole_ea0"] * EA0_IN_COULOMB_METRE

    return {
        "schemaVersion": 1,
        "isotope": 171,
        "dataset": {
            "version": manifest["datasetVersion"],
            "sourceCommit": manifest["sourceCommit"],
            "contentHash": manifest["contentHash"],
            "manifestSha256": MANIFEST_SHA256,
            "files": files,
        },
        "sources": sources,
        "levels": levels,
        "transitions": transitions,
        "hyperfine": hyperfine,
        "decay": decay,
        "rydbergZeroField": {
            **rydberg,
            "matrixElementConvention": "Signed F-reduced D_F for ³P₀ → S-like states",
            "applicability": "Zero-field theoretical catalogue. Physical uncertainty and same-device validation are unestablished.",
        },
    }


def make_clock_reference(snapshot: dict) -> dict:
    transition = snapshot["transitions"]["T3"]
    frequency = transition["quantities"]["frequency_THz"]
    wavelength = transition["quantities"]["wavelength_vac_nm"]

    def clock_level(level_id: str) -> dict:
        term = snapshot["levels"][level_id]["attributes"]["term"]
        hyperfine = snapshot["hyperfine"]["states"][term]
        return {"levelId": level_id, "term": term, "allowedF": [level["F"] for level in hyperfine["sublevelsHz"]]}

    return {
        "isotope": snapshot["isotope"],
        "dataset": {key: snapshot["dataset"][key] for key in ("version", "sourceCommit", "contentHash")},
        "transitionId": transition["id"],
        "lower": clock_level(transition["lowerLevelId"]),
        "upper": clock_level(transition["upperLevelId"]),
        "sourceUrl": snapshot["sources"][frequency["sourceId"]]["url"],
        "frequency": {
            **{key: frequency[key] for key in (
                "sourceLocator", "siValue", "siDecimalValue", "siUncertainty",
                "evidenceKind", "reviewStatus", "sourceId", "convention",
            )},
            "sourceDecimal": frequency["conditions"]["sourceDecimal"],
        },
        "wavelength": {key: wavelength[key] for key in ("value", "siValue", "sourceLocator")},
    }


def write_or_check(path: Path, data: dict, check: bool):
    serialized = json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    if check:
        if not path.exists() or path.read_text(encoding="utf-8") != serialized:
            raise SystemExit(f"Snapshot needs regeneration: {path}")
    else:
        path.write_text(serialized, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", nargs="?", type=Path, help="Local 171YbDatabase checkout. Omit to use the checked-in snapshot for the clock reference.")
    parser.add_argument("--check", action="store_true", help="Compare generated files without writing")
    args = parser.parse_args()
    if args.database is None:
        snapshot = json.loads(OUTPUT.read_text(encoding="utf-8"))
    else:
        snapshot = make_snapshot(args.database)
        write_or_check(OUTPUT, snapshot, args.check)
        print(f"{snapshot['dataset']['version']}: {len(snapshot['levels'])} levels, "
              f"{len(snapshot['transitions'])} transitions, {len(snapshot['hyperfine']['states'])} hyperfine entries, "
              f"{len(snapshot['decay']['records'])} decay records, {len(snapshot['rydbergZeroField']['states'])} zero-field states")
    write_or_check(CLOCK_OUTPUT, make_clock_reference(snapshot), args.check)
    print(f"{snapshot['dataset']['version']}: isolated T3 clock reference")


if __name__ == "__main__":
    main()
