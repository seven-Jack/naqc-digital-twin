"""Infer effective counts from published 68% Clopper–Pearson bars."""

from math import exp, expm1, fsum, lgamma, log, log1p
from typing import TypedDict


TAIL_TARGET = 0.16
TAIL_TOLERANCE = 1e-8


class InferredCounts(TypedDict):
    numerator: int
    denominator: int
    cp_lower_tail: float | None
    cp_upper_tail: float | None


def _binomial_range_mass(trials: int, probability: float, outcomes: range) -> float:
    log_factorial = lgamma(trials + 1)
    log_success = log(probability)
    log_failure = log1p(-probability)
    return fsum(
        exp(
            log_factorial
            - lgamma(outcome + 1)
            - lgamma(trials - outcome + 1)
            + outcome * log_success
            + (trials - outcome) * log_failure
        )
        for outcome in outcomes
    )


def clopper_pearson_interval(numerator: int, denominator: int) -> tuple[float, float]:
    """Return the exact equal-tailed 68% binomial interval."""
    if not 0 <= numerator <= denominator or denominator < 1:
        raise ValueError("Expected a binomial count with a positive denominator")
    boundary = log(TAIL_TARGET) / denominator
    if numerator == 0:
        return 0.0, -expm1(boundary)
    if numerator == denominator:
        return exp(boundary), 1.0

    def find_endpoint(left, right, outcomes, increasing):
        for _ in range(64):
            midpoint = (left + right) / 2
            mass = _binomial_range_mass(denominator, midpoint, outcomes)
            if (mass < TAIL_TARGET) == increasing:
                left = midpoint
            else:
                right = midpoint
        return (left + right) / 2

    estimate = numerator / denominator
    lower = find_endpoint(0.0, estimate, range(numerator, denominator + 1), increasing=True)
    upper = find_endpoint(estimate, 1.0, range(numerator + 1), increasing=False)
    return lower, upper


def _infer_boundary_counts(probability, lower_error, upper_error, max_trials) -> InferredCounts:
    if probability == 0 and lower_error == 0 and 0 < upper_error < 1:
        log_factor = log1p(-upper_error)
    elif probability == 1 and upper_error == 0 and 0 < lower_error < 1:
        log_factor = log1p(-lower_error)
    else:
        raise ValueError("Expected zero error at the clipped binomial endpoint and a finite error on the other side")
    estimate = log(TAIL_TARGET) / log_factor
    if not 1.5 <= estimate <= max_trials + 0.5:
        raise ValueError(f"No compatible boundary count up to {max_trials} trials")
    trials = round(estimate)
    tail = exp(trials * log_factor)
    if not 2 <= trials <= max_trials or abs(tail - TAIL_TARGET) > TAIL_TOLERANCE:
        raise ValueError(f"No compatible boundary count up to {max_trials} trials")
    return {
        "numerator": trials if probability == 1 else 0,
        "denominator": trials,
        "cp_lower_tail": tail if probability == 1 else None,
        "cp_upper_tail": tail if probability == 0 else None,
    }


def infer_binomial_counts(
    probability: float, lower_error: float, upper_error: float, max_trials: int = 10000
) -> InferredCounts:
    """Recover one compatible effective count pair, with no raw shot assignment.

    The low endpoint of an equal-tailed 68% Clopper–Pearson interval gives
    P(X >= k) = 0.16. The high endpoint gives P(X <= k) = 0.16.
    A clipped boundary has no corresponding tail probability.
    """
    if max_trials < 2:
        raise ValueError("The denominator search requires at least two possible trials")
    if probability in (0, 1):
        return _infer_boundary_counts(probability, lower_error, upper_error, max_trials)
    lower_bound = probability - lower_error
    upper_bound = probability + upper_error
    if not 0 < lower_bound < probability < upper_bound < 1:
        raise ValueError("Expected an interior binomial estimate with two positive errors")

    matches: list[InferredCounts] = []
    for trials in range(2, max_trials + 1):
        successes = round(probability * trials)
        if not 0 < successes < trials or abs(successes / trials - probability) > 1e-12:
            continue

        lower_tail = _binomial_range_mass(trials, lower_bound, range(successes, trials + 1))
        if abs(lower_tail - TAIL_TARGET) > TAIL_TOLERANCE:
            continue
        upper_tail = _binomial_range_mass(trials, upper_bound, range(successes + 1))
        if abs(upper_tail - TAIL_TARGET) <= TAIL_TOLERANCE:
            matches.append(
                {
                    "numerator": successes,
                    "denominator": trials,
                    "cp_lower_tail": lower_tail,
                    "cp_upper_tail": upper_tail,
                }
            )

    if len(matches) != 1:
        raise ValueError(
            f"Expected one compatible effective count pair up to {max_trials} trials "
            f"for probability {probability:.16g}, found {len(matches)}"
        )
    return matches[0]
