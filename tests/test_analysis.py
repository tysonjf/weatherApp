import time

from inkbird_bbq import analysis


def _series(rate_c_per_hr: float, minutes: float, start_c: float = 50.0, step_s: float = 30.0):
    """Linear series ending at t=now."""
    now = time.time()
    n = int(minutes * 60 / step_s)
    pts = []
    for i in range(n + 1):
        t = now - (n - i) * step_s
        pts.append((t, start_c + rate_c_per_hr * ((t - (now - n * step_s)) / 3600)))
    return pts, now


def test_linear_fit_recovers_slope():
    pts, _ = _series(rate_c_per_hr=10.0, minutes=30)
    rate = analysis.rate_c_per_hour(pts)
    assert abs(rate - 10.0) < 0.01


def test_analyze_rising_meat_with_eta():
    pts, now = _series(rate_c_per_hr=6.0, minutes=60, start_c=50.0)
    a = analysis.analyze_probe(pts, target_c=pts[-1][1] + 3.0, now=now)
    assert not a.in_stall
    assert a.rate_10min_c_per_hr is not None and 5.0 < a.rate_10min_c_per_hr < 7.0
    # 3°C remaining at ~6°C/hr -> ~30 min
    assert a.eta_minutes is not None and 25 < a.eta_minutes < 36


def test_stall_detected_for_flat_series_in_zone():
    pts, now = _series(rate_c_per_hr=0.3, minutes=45, start_c=70.0)
    a = analysis.analyze_probe(pts, target_c=95.0, now=now)
    assert a.in_stall
    assert a.stall_note
    # flat trend -> no usable ETA
    assert a.eta_minutes is None
    assert a.eta_note


def test_no_stall_outside_zone():
    pts, now = _series(rate_c_per_hr=0.3, minutes=45, start_c=40.0)
    a = analysis.analyze_probe(pts, now=now)
    assert not a.in_stall


def test_target_reached():
    pts, now = _series(rate_c_per_hr=5.0, minutes=30, start_c=94.0)
    a = analysis.analyze_probe(pts, target_c=90.0, now=now)
    assert a.eta_minutes == 0.0


def test_smoothing_kills_glitch():
    pts, now = _series(rate_c_per_hr=0.0, minutes=20, start_c=60.0)
    glitched = list(pts)
    glitched[len(glitched) // 2] = (glitched[len(glitched) // 2][0], 300.0)
    a = analysis.analyze_probe(glitched, now=now)
    assert a.max_c < 100  # spike removed by rolling median


def test_downsample():
    pts, _ = _series(rate_c_per_hr=10.0, minutes=120, step_s=5)
    ds = analysis.downsample(pts, 50)
    assert len(ds) <= 50
    assert ds[0][0] <= ds[-1][0]
    # endpoints roughly preserved
    assert abs(ds[-1][1] - pts[-1][1]) < 2.0


def test_empty_and_tiny_series():
    assert analysis.analyze_probe([]).current_c is None
    a = analysis.analyze_probe([(time.time(), 55.0)])
    assert a.current_c == 55.0
    assert a.rate_10min_c_per_hr is None


def test_c_to_f():
    assert analysis.c_to_f(100.0) == 212.0
    assert analysis.c_to_f(None) is None
