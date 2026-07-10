"""Trend analysis over recorded temperature series.

Pure functions over (timestamp, °C) point lists so they're easy to test.
Rates are reported in °C/hour; ETAs come from a linear fit over a recent
window, which is the standard "pencil and paper" pitmaster estimate.
"""

from __future__ import annotations

import statistics
import time
from dataclasses import asdict, dataclass

Point = tuple[float, float]  # (unix ts, °C)

# The evaporative-cooling stall zone for large cuts (brisket/pork butt).
STALL_LOW_C = 60.0
STALL_HIGH_C = 80.0
STALL_RATE_C_PER_HR = 2.0


def c_to_f(c: float | None) -> float | None:
    return None if c is None else round(c * 9 / 5 + 32, 1)


def linear_fit(points: list[Point]) -> tuple[float, float, float] | None:
    """Least-squares fit; returns (slope °C/s, intercept, r²) or None."""
    if len(points) < 3:
        return None
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    n = len(points)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx == 0:
        return None
    sxy = sum((x - mx) * (y - my) for x, y in points)
    slope = sxy / sxx
    intercept = my - slope * mx
    syy = sum((y - my) ** 2 for y in ys)
    r2 = 0.0 if syy == 0 else (sxy * sxy) / (sxx * syy)
    return slope, intercept, r2


def rate_c_per_hour(points: list[Point]) -> float | None:
    fit = linear_fit(points)
    return None if fit is None else fit[0] * 3600.0


def window(points: list[Point], minutes: float, now: float | None = None) -> list[Point]:
    now = now if now is not None else (points[-1][0] if points else time.time())
    cutoff = now - minutes * 60
    return [p for p in points if p[0] >= cutoff]


def smooth_median(points: list[Point], k: int = 5) -> list[Point]:
    """Rolling-median smoothing to knock out single-sample glitches."""
    if len(points) < k:
        return list(points)
    half = k // 2
    out: list[Point] = []
    for i in range(len(points)):
        lo, hi = max(0, i - half), min(len(points), i + half + 1)
        out.append((points[i][0], statistics.median(y for _, y in points[lo:hi])))
    return out


@dataclass
class ProbeAnalysis:
    current_c: float | None = None
    current_f: float | None = None
    min_c: float | None = None
    max_c: float | None = None
    rate_10min_c_per_hr: float | None = None
    rate_30min_c_per_hr: float | None = None
    in_stall: bool = False
    stall_note: str | None = None
    target_c: float | None = None
    eta_minutes: float | None = None
    eta_note: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


def analyze_probe(
    points: list[Point], target_c: float | None = None, now: float | None = None
) -> ProbeAnalysis:
    a = ProbeAnalysis(target_c=target_c)
    if not points:
        return a
    pts = smooth_median(sorted(points))
    now = now if now is not None else pts[-1][0]

    a.current_c = round(pts[-1][1], 1)
    a.current_f = c_to_f(pts[-1][1])
    a.min_c = round(min(y for _, y in pts), 1)
    a.max_c = round(max(y for _, y in pts), 1)

    r10 = rate_c_per_hour(window(pts, 10, now))
    r30 = rate_c_per_hour(window(pts, 30, now))
    a.rate_10min_c_per_hr = None if r10 is None else round(r10, 2)
    a.rate_30min_c_per_hr = None if r30 is None else round(r30, 2)

    # Stall: temp parked in the stall zone with a near-flat 30-min trend.
    stall_rate = r30 if r30 is not None else r10
    if (
        stall_rate is not None
        and STALL_LOW_C <= pts[-1][1] <= STALL_HIGH_C
        and abs(stall_rate) < STALL_RATE_C_PER_HR
        and len(window(pts, 20, now)) >= 4
    ):
        a.in_stall = True
        a.stall_note = (
            "Temperature has plateaued in the evaporative-cooling stall zone "
            f"({STALL_LOW_C:.0f}-{STALL_HIGH_C:.0f} °C). This is normal; options: "
            "wait it out, or wrap (Texas crutch) to push through faster."
        )

    if target_c is not None and a.current_c is not None:
        remaining = target_c - pts[-1][1]
        if remaining <= 0:
            a.eta_minutes = 0.0
            a.eta_note = "Target reached."
        else:
            rate = r10 if (r10 is not None and r10 > 0.5) else r30
            if rate is None or rate <= 0.5:
                a.eta_note = (
                    "Temperature is flat or falling; can't project an ETA "
                    "from the recent trend."
                )
            else:
                a.eta_minutes = round(remaining / rate * 60.0, 1)
                if a.in_stall:
                    a.eta_note = (
                        "Estimate is unreliable while in the stall; actual time "
                        "to target will likely be longer unless wrapped."
                    )
    return a


def downsample(points: list[Point], max_points: int) -> list[Point]:
    """Bucket-average a series down to at most *max_points* points."""
    if max_points <= 0 or len(points) <= max_points:
        return list(points)
    bucket = len(points) / max_points
    out: list[Point] = []
    i = 0.0
    while i < len(points):
        chunk = points[int(i) : int(i + bucket)] or [points[int(i)]]
        out.append(
            (
                sum(p[0] for p in chunk) / len(chunk),
                round(sum(p[1] for p in chunk) / len(chunk), 2),
            )
        )
        i += bucket
    return out
