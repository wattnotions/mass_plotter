from __future__ import annotations

import csv
import io
import math
import os
import re
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template, request
from werkzeug.exceptions import RequestEntityTooLarge


MAX_UPLOAD_BYTES = 5 * 1024 * 1024
DATE_COLUMN_NAMES = {"date", "datetime", "timestamp", "time"}
WEIGHT_COLUMN_NAMES = {
    "weight",
    "weightkg",
    "bodyweight",
    "bodyweightkg",
    "dailyaverage",
}

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES


@app.after_request
def add_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; "
        "connect-src 'self'; "
        "object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    )
    return response


def _normalise_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.strip().lower())


def _find_column(headers: list[str], accepted: set[str]) -> str | None:
    return next((header for header in headers if _normalise_header(header) in accepted), None)


def _parse_date(raw_value: str) -> date:
    value = raw_value.strip()
    if not value:
        raise ValueError("date is blank")

    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        pass

    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"'{value}' is not a recognised date")


def _parse_weight(raw_value: str) -> float:
    value = raw_value.strip()
    if not value:
        raise ValueError("weight is blank")
    value = re.sub(r"\s*(kg|kgs|kilograms?)\s*$", "", value, flags=re.IGNORECASE)
    try:
        weight = float(value)
    except ValueError as exc:
        raise ValueError(f"'{raw_value.strip()}' is not a number") from exc
    if not math.isfinite(weight) or weight <= 0:
        raise ValueError("weight must be greater than zero")
    return weight


def parse_weight_csv(content: bytes, ignore_first: bool = False) -> dict[str, Any]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("The file must be UTF-8 encoded.") from exc

    try:
        reader = csv.DictReader(io.StringIO(text))
        headers = reader.fieldnames or []
    except csv.Error as exc:
        raise ValueError(f"The CSV could not be read: {exc}") from exc

    date_column = _find_column(headers, DATE_COLUMN_NAMES)
    weight_column = _find_column(headers, WEIGHT_COLUMN_NAMES)
    if not date_column or not weight_column:
        raise ValueError(
            "Could not find date and weight columns. Use headers such as "
            "'DateTime' and 'Daily Average', or 'Date' and 'Weight'."
        )

    measurements: list[tuple[date, float]] = []
    skipped_rows: list[str] = []
    for row_number, row in enumerate(reader, start=2):
        if ignore_first and row_number == 2:
            continue
        if not any((value or "").strip() for value in row.values()):
            continue
        try:
            measured_on = _parse_date(row.get(date_column) or "")
            weight = _parse_weight(row.get(weight_column) or "")
        except ValueError as exc:
            skipped_rows.append(f"row {row_number}: {exc}")
            continue
        measurements.append((measured_on, weight))

    if not measurements:
        detail = f" First issue: {skipped_rows[0]}." if skipped_rows else ""
        raise ValueError(f"No valid weight measurements were found.{detail}")

    measurements.sort(key=lambda item: item[0])
    weeks: dict[date, list[float]] = defaultdict(list)
    for measured_on, weight in measurements:
        monday = measured_on - timedelta(days=measured_on.weekday())
        weeks[monday].append(weight)

    weekly = [
        {
            "date": monday.isoformat(),
            "weight": round(sum(weights) / len(weights), 4),
            "count": len(weights),
        }
        for monday, weights in sorted(weeks.items())
    ]
    daily = [
        {
            "date": measured_on.isoformat(),
            "weight": weight,
            "week": (measured_on - timedelta(days=measured_on.weekday())).isoformat(),
        }
        for measured_on, weight in measurements
    ]

    return {
        "daily": daily,
        "weekly": weekly,
        "summary": {
            "measurementCount": len(daily),
            "weekCount": len(weekly),
            "skippedCount": len(skipped_rows),
            "firstDate": daily[0]["date"],
            "lastDate": daily[-1]["date"],
        },
        "warnings": skipped_rows[:5],
    }


@app.get("/")
def index() -> str:
    return render_template("index.html", max_upload_mb=MAX_UPLOAD_BYTES // 1024 // 1024)


@app.get("/healthz")
def healthcheck():
    return jsonify(status="ok")


@app.get("/api/sample")
def sample_weights():
    sample_path = Path(app.root_path) / "static" / "sample_weights.csv"
    return jsonify(parse_weight_csv(sample_path.read_bytes()))


@app.post("/api/weights")
def upload_weights():
    uploaded_file = request.files.get("file")
    if uploaded_file is None or not uploaded_file.filename:
        return jsonify(error="Choose a CSV file to upload."), 400
    if not uploaded_file.filename.lower().endswith(".csv"):
        return jsonify(error="The uploaded file must have a .csv extension."), 400

    ignore_first = request.form.get("ignore_first", "false").lower() == "true"
    try:
        result = parse_weight_csv(uploaded_file.read(), ignore_first=ignore_first)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    return jsonify(result)


@app.errorhandler(RequestEntityTooLarge)
def file_too_large(_error: RequestEntityTooLarge):
    return jsonify(error="The CSV is too large. The maximum upload size is 5 MB."), 413


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
