#!/usr/bin/env python3
"""Download daily dam level data from Consorzio Bonifica Capitanata open data API.

The script is deliberately polite with the API: it performs one request at a
time, waits between calls, retries transient failures, and appends each
successful day to the CSV immediately so a run can be resumed later.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


API_URL = "https://gesi.bonificacapitanata.it/api/v1/open_data/levels"
CSV_FIELDS = [
    "date",
    "dam",
    "level_m",
    "capacity_m3",
    "level_raw",
    "capacity_raw",
]


def parse_args() -> argparse.Namespace:
    today = date.today()
    parser = argparse.ArgumentParser(
        description="Scarica i livelli giornalieri delle dighe pugliesi in CSV."
    )
    parser.add_argument(
        "--start-date",
        default=(today - timedelta(days=365)).isoformat(),
        help="Data iniziale inclusa, formato YYYY-MM-DD. Default: un anno fa.",
    )
    parser.add_argument(
        "--end-date",
        default=today.isoformat(),
        help="Data finale inclusa, formato YYYY-MM-DD. Default: oggi.",
    )
    parser.add_argument(
        "--output",
        default="data/dam_levels.csv",
        help="Percorso del CSV di output. Default: data/dam_levels.csv.",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.5,
        help="Secondi di attesa tra richieste riuscite. Default: 1.5.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        help="Timeout HTTP in secondi. Default: 30.",
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=5,
        help="Numero massimo di retry per data. Default: 5.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Riscrive il CSV di output invece di riprendere da quello esistente.",
    )
    return parser.parse_args()


def parse_iso_date(value: str, flag: str) -> date:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise SystemExit(f"{flag} deve essere nel formato YYYY-MM-DD: {value}") from exc


def date_range(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def parse_decimal_it(value: str | None) -> float | None:
    if value in (None, ""):
        return None
    return float(value.replace(".", "").replace(",", "."))


def parse_int_it(value: str | None) -> int | None:
    if value in (None, ""):
        return None
    return int(value.replace(".", ""))


def get_latest_date_in_csv(path: Path) -> date | None:
    if not path.exists():
        return None

    latest: str | None = None
    with path.open("r", newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        for row in reader:
            if row.get("date"):
                if latest is None or row["date"] > latest:
                    latest = row["date"]
    if latest:
        return datetime.strptime(latest, "%Y-%m-%d").date()
    return None


def fetch_day(day: date, timeout: float, max_retries: int) -> dict[str, Any]:
    query = urlencode({"date": day.isoformat()})
    url = f"{API_URL}?{query}"
    request = Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7"
    })

    for attempt in range(max_retries + 1):
        try:
            with urlopen(request, timeout=timeout) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                return json.loads(response.read().decode(charset))
        except HTTPError as exc:
            retry_after = exc.headers.get("Retry-After")
            should_retry = exc.code in (403, 429) or 500 <= exc.code < 600
            if not should_retry or attempt >= max_retries:
                raise
            wait_seconds = parse_retry_after(retry_after) or backoff_seconds(attempt)
            print(
                f"[{day}] HTTP {exc.code}, retry tra {wait_seconds:.1f}s",
                file=sys.stderr,
            )
            time.sleep(wait_seconds)
        except (URLError, TimeoutError, json.JSONDecodeError) as exc:
            if attempt >= max_retries:
                raise
            wait_seconds = backoff_seconds(attempt)
            print(
                f"[{day}] errore temporaneo ({exc}), retry tra {wait_seconds:.1f}s",
                file=sys.stderr,
            )
            time.sleep(wait_seconds)

    raise RuntimeError(f"Retry esauriti per {day}")


def parse_retry_after(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        return None


def backoff_seconds(attempt: int) -> float:
    return min(60.0, 2.0 * (2**attempt))


def normalize_rows(day: date, payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    
    # Extract the actual date from the API response
    api_date_str = None
    for values in payload.values():
        if isinstance(values, dict) and values.get("date"):
            api_date_str = values.get("date")
            break
            
    if api_date_str:
        try:
            api_date = datetime.strptime(api_date_str, "%d/%m/%Y").date()
            if api_date != day:
                print(f"[{day.isoformat()}] Scarto perche' l'API restituisce dati del {api_date_str}", file=sys.stderr)
                return []
        except ValueError:
            api_date = day
    else:
        api_date = day

    for dam_name, values in sorted(payload.items()):
        if not isinstance(values, dict):
            continue

        level_raw = values.get("level")
        capacity_raw = values.get("capacity")
        rows.append(
            {
                "date": api_date.isoformat(),
                "dam": dam_name,
                "level_m": parse_decimal_it(level_raw),
                "capacity_m3": parse_int_it(capacity_raw),
                "level_raw": level_raw,
                "capacity_raw": capacity_raw,
            }
        )
    return rows


def append_rows(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    write_header = not path.exists() or path.stat().st_size == 0

    with path.open("a", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=CSV_FIELDS)
        if write_header:
            writer.writeheader()
        writer.writerows(rows)
        csv_file.flush()


def main() -> int:
    args = parse_args()
    start = parse_iso_date(args.start_date, "--start-date")
    end = parse_iso_date(args.end_date, "--end-date")

    output_path = Path(args.output)
    if args.overwrite and output_path.exists():
        output_path.unlink()
        
    latest_saved = get_latest_date_in_csv(output_path)
    if latest_saved and not args.overwrite:
        new_start = latest_saved + timedelta(days=1)
        if new_start > start:
            start = new_start

    if start > end:
        print("Tutte le date fino a --end-date sono gia' state scaricate.")
        return 0

    total_days = (end - start).days + 1
    downloaded = 0
    skipped = 0

    for index, day in enumerate(date_range(start, end), start=1):
        day_key = day.isoformat()

        print(f"[{index}/{total_days}] {day_key}: scarico")
        try:
            payload = fetch_day(day, timeout=args.timeout, max_retries=args.max_retries)
            rows = normalize_rows(day, payload)
        except (
            HTTPError,
            URLError,
            TimeoutError,
            json.JSONDecodeError,
            ValueError,
        ) as exc:
            print(
                f"[{index}/{total_days}] {day_key}: errore definitivo: {exc}",
                file=sys.stderr,
            )
            return 1

        if len(rows) == 0:
            skipped += 1
        else:
            append_rows(output_path, rows)
            downloaded += 1
            print(f"[{index}/{total_days}] {day_key}: salvate {len(rows)} righe")

        if args.delay > 0 and day != end:
            time.sleep(args.delay)

    print(
        f"Completato. Date scaricate: {downloaded}; date saltate: {skipped}; CSV: {output_path}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
