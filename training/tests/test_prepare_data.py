"""Synthetic parser fixtures ONLY; never used to train or evaluate the classifier."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import normalize_text, parse_rows, deduplicate, sha256
from prepare_data import prepare


class PreparationTests(unittest.TestCase):
    def test_normalization_preserves_indicators(self):
        self.assertEqual(normalize_text(" ACT\n immediately: £500, +44 123, https://BANK.example/KYC "),
                         "act immediately: £500, +44 123, https://bank.example/kyc")

    def test_format_and_labels(self):
        rows = parse_rows(b"ham\tHello\nspam\tClaim a test reward\n")
        self.assertEqual([row["label"] for row in rows], ["ham", "spam"])
        for invalid in [b"ham Hello\n", b"fraud\tText\n", b"ham\t\n", b"ham\tOnly one class\n"]:
            with self.assertRaises(ValueError):
                parse_rows(invalid)

    def test_duplicates_and_conflicts_removed_before_any_split(self):
        records, counts = deduplicate([
            {"label": "ham", "text": "Hello   world"},
            {"label": "ham", "text": "HELLO world"},
            {"label": "ham", "text": "Conflicted"},
            {"label": "spam", "text": "conflicted"},
            {"label": "spam", "text": "Claim a test reward"},
        ])
        self.assertEqual(len(records), 2)
        self.assertEqual(counts["duplicate_rows_removed"], 1)
        self.assertEqual(counts["conflicting_label_rows_removed"], 2)
        self.assertEqual(records[0]["id"], sha256(b"hello world"))

    def test_zip_preparation_writes_verifiable_records_and_preserves_readme(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / "fixture.zip"
            with zipfile.ZipFile(archive, "w") as bundle:
                bundle.writestr("SMSSpamCollection", "ham\tHello\nspam\tExample reward\nham\tHELLO\n")
                bundle.writestr("readme", "Synthetic test fixture, not the UCI corpus")
            manifest = prepare(archive, root / "output")
            self.assertEqual(manifest["raw_rows"], 3)
            self.assertEqual(manifest["unique_rows"], 2)
            self.assertEqual(manifest["records_sha256"], sha256((root / "output/records.jsonl").read_bytes()))
            self.assertEqual(len(json.loads((root / "output/manifest.json").read_text())["archive_sha256"]), 64)
            self.assertIn("Synthetic", (root / "output/readme").read_text())

    def test_archive_requires_expected_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive = Path(temporary) / "bad.zip"
            with zipfile.ZipFile(archive, "w") as bundle:
                bundle.writestr("unexpected.txt", "Not a dataset")
            with self.assertRaises(ValueError):
                prepare(archive, Path(temporary) / "output")


if __name__ == "__main__":
    unittest.main()
