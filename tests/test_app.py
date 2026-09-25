import io
import unittest

from app import app, parse_weight_csv


SAMPLE = b'''DateTime,Daily Average,Fasting\n2025-08-03,70.0,\n2025-08-04,69.0,\n2025-08-06,71.0,\ninvalid,bad,\n'''


class CsvParsingTests(unittest.TestCase):
    def test_parses_cronometer_headers_and_monday_weeks(self):
        result = parse_weight_csv(SAMPLE)
        self.assertEqual(result["summary"]["measurementCount"], 3)
        self.assertEqual(result["summary"]["weekCount"], 2)
        self.assertEqual(result["summary"]["skippedCount"], 1)
        self.assertEqual(result["weekly"][0]["date"], "2025-07-28")
        self.assertEqual(result["weekly"][1]["date"], "2025-08-04")
        self.assertEqual(result["weekly"][1]["weight"], 70.0)

    def test_supports_simple_date_and_weight_headers(self):
        result = parse_weight_csv(b"Date,Weight\n24/09/2026,72.4 kg\n")
        self.assertEqual(result["daily"][0]["weight"], 72.4)

    def test_rejects_unrelated_columns(self):
        with self.assertRaisesRegex(ValueError, "Could not find"):
            parse_weight_csv(b"Time,Calories\n2026-01-01,2000\n")

    def test_can_ignore_first_data_row(self):
        result = parse_weight_csv(b"Date,Weight\n2026-01-01,99\n2026-01-02,70\n", True)
        self.assertEqual(result["summary"]["measurementCount"], 1)
        self.assertEqual(result["daily"][0]["weight"], 70.0)


class RouteTests(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True)
        self.client = app.test_client()

    def test_home_page_loads(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Upload CSV", response.data)
        self.assertIn(b'id="help-button"', response.data)
        self.assertIn(b"Click here for app info", response.data)
        self.assertIn(b"vendor/plotly.min.js", response.data)
        self.assertEqual(response.headers["X-Frame-Options"], "DENY")

    def test_healthcheck(self):
        response = self.client.get("/healthz")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {"status": "ok"})

    def test_sample_data_uses_requested_week_range(self):
        response = self.client.get("/api/sample")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["weekly"][0]["date"], "2025-07-28")
        self.assertEqual(response.json["weekly"][-1]["date"], "2025-12-29")

    def test_upload_returns_plot_data(self):
        response = self.client.post(
            "/api/weights",
            data={"file": (io.BytesIO(SAMPLE), "weights.csv")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["summary"]["measurementCount"], 3)

    def test_upload_requires_csv(self):
        response = self.client.post(
            "/api/weights",
            data={"file": (io.BytesIO(SAMPLE), "weights.txt")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
