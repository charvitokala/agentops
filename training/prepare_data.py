"""Download the official archive, validate it, and deduplicate BEFORE splitting."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen
import zipfile

from common import SOURCE, DATASET, CITATION, LICENSE, parse_rows, deduplicate, sha256

ROOT = Path(__file__).resolve().parent
LIMIT = 5_000_000


def prepare(archive, destination):
    with zipfile.ZipFile(archive) as bundle:
        files = {Path(info.filename).name: info for info in bundle.infolist() if not info.is_dir()}
        if "SMSSpamCollection" not in files or "readme" not in files:
            raise ValueError("Expected official SMSSpamCollection and readme files")
        if sum(info.file_size for info in bundle.infolist()) > LIMIT:
            raise ValueError("Unexpected archive size")
        raw = bundle.read(files["SMSSpamCollection"])
        readme = bundle.read(files["readme"])
    rows = parse_rows(raw)
    records, counts = deduplicate(rows)
    if {row["label"] for row in records} != {"ham", "spam"}:
        raise ValueError("Insufficient class coverage after deduplication")
    destination.mkdir(parents=True, exist_ok=True)
    encoded = "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in records).encode("utf-8")
    (destination / "SMSSpamCollection").write_bytes(raw)
    (destination / "readme").write_bytes(readme)
    (destination / "records.jsonl").write_bytes(encoded)
    manifest = {
        "dataset": DATASET, "download": SOURCE, "citation": CITATION,
        "license": LICENSE, "license_url": "https://creativecommons.org/licenses/by/4.0/",
        "prepared_at": datetime.now(timezone.utc).isoformat(),
        "archive_sha256": sha256(archive.read_bytes()), "raw_sha256": sha256(raw), "readme_sha256": sha256(readme),
        "records_sha256": sha256(encoded), **counts,
        "unique_labels": dict(Counter(row["label"] for row in records)),
        "deduplication": "NFKC + lowercase + collapsed whitespace; conflicting-label groups excluded",
        "scope": "Public SMS ham/spam labels, NOT verified financial-fraud labels",
    }
    (destination / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, help="Previously downloaded OFFICIAL UCI zip; otherwise download it")
    args = parser.parse_args()
    data = ROOT / "data"
    data.mkdir(exist_ok=True)
    archive = args.archive or data / "sms_spam_collection.zip"
    if not args.archive:
        # A failed request never leaves a partial archive or fabricated records.
        with urlopen(SOURCE, timeout=30) as response:
            if urlparse(response.url).hostname != "archive.ics.uci.edu":
                raise ValueError("Unexpected download origin")
            payload = response.read(LIMIT + 1)
            if len(payload) > LIMIT:
                raise ValueError("Unexpected download size")
        archive.write_bytes(payload)
    print(json.dumps(prepare(archive, data), indent=2))


if __name__ == "__main__":
    main()
