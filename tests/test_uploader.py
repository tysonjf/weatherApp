import asyncio

import pytest

from inkbird_bbq import db
from inkbird_bbq.uploader import BATCH_LIMIT, CURSOR_KEY, Uploader

TEMPS = {
    "probe1_internal": 55.0,
    "probe1_ambient": 110.0,
    "probe2_internal": None,
    "probe2_ambient": None,
    "base_ambient": 21.0,
}
BATTS = {"base": 90, "probe1": 80, "probe2": None}


@pytest.fixture
def conn(tmp_path):
    return db.connect(tmp_path / "test.db")


def insert(conn, n, start_ts=1000.0):
    for i in range(n):
        db.insert_reading(conn, start_ts + i, TEMPS, BATTS)


def make_uploader(conn, post):
    return Uploader(conn, "https://example.com/api/ingest", "tok", post=post)


def test_uploads_pending_and_advances_cursor(conn):
    insert(conn, 3)
    posts = []
    up = make_uploader(conn, lambda url, token, payload: posts.append((url, token, payload)))

    n = asyncio.run(up.upload_once())

    assert n == 3
    assert len(posts) == 1
    url, token, payload = posts[0]
    assert url == "https://example.com/api/ingest"
    assert token == "tok"
    assert payload["source"] == "inkbird-logger"
    assert [r["ts"] for r in payload["readings"]] == [1000.0, 1001.0, 1002.0]
    assert payload["readings"][0]["probe1_internal"] == 55.0
    assert payload["readings"][0]["batt_probe2"] is None
    assert db.get_status(conn)[CURSOR_KEY] == "3"

    # nothing new -> no further POSTs
    assert asyncio.run(up.upload_once()) == 0
    assert len(posts) == 1


def test_only_new_rows_after_cursor(conn):
    insert(conn, 2)
    posts = []
    up = make_uploader(conn, lambda *a: posts.append(a))
    asyncio.run(up.upload_once())

    insert(conn, 1, start_ts=2000.0)
    asyncio.run(up.upload_once())

    assert [r["ts"] for r in posts[1][2]["readings"]] == [2000.0]


def test_failed_post_does_not_advance_cursor(conn):
    insert(conn, 2)

    def boom(url, token, payload):
        raise OSError("network down")

    up = make_uploader(conn, boom)
    with pytest.raises(OSError):
        asyncio.run(up.upload_once())
    assert CURSOR_KEY not in db.get_status(conn)

    # once the endpoint is back, the same rows ship
    posts = []
    up._post = lambda *a: posts.append(a)
    assert asyncio.run(up.upload_once()) == 2


def test_drains_in_batches(conn):
    insert(conn, BATCH_LIMIT + 5)
    posts = []
    up = make_uploader(conn, lambda url, token, payload: posts.append(payload))

    n = asyncio.run(up.upload_once())

    assert n == BATCH_LIMIT + 5
    assert [len(p["readings"]) for p in posts] == [BATCH_LIMIT, 5]


def test_run_flushes_on_stop(conn):
    insert(conn, 2)
    posts = []
    up = make_uploader(conn, lambda url, token, payload: posts.append(payload))
    up.interval = 3600  # ensure the flush comes from stop, not the timer

    async def scenario():
        stop = asyncio.Event()
        task = asyncio.create_task(up.run(stop))
        await asyncio.sleep(0.05)  # first cycle uploads
        insert(conn, 1, start_ts=2000.0)
        stop.set()
        await asyncio.wait_for(task, timeout=5)

    asyncio.run(scenario())
    assert sum(len(p["readings"]) for p in posts) == 3
