"""Deterministic preparation for the public UCI SMS corpus only."""
import hashlib
import re
import unicodedata

SOURCE = "https://archive.ics.uci.edu/static/public/228/sms+spam+collection.zip"
DATASET = "https://archive.ics.uci.edu/dataset/228/sms+spam+collection"
CITATION = "Almeida, T. & Hidalgo, J. (2011). SMS Spam Collection. UCI. https://doi.org/10.24432/C5CC84"
LICENSE = "CC BY 4.0 (as stated on the official UCI dataset page)"
SEED = 42


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def normalize_text(text):
    # No URL, amount, number or urgency removal; no learned preprocessing here.
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", text).lower()).strip()


def parse_rows(data):
    rows = []
    for number, line in enumerate(data.decode("utf-8-sig").splitlines(), 1):
        if not line.strip():
            continue
        label, separator, text = line.partition("\t")
        if not separator or label not in {"ham", "spam"} or not normalize_text(text):
            raise ValueError(f"Invalid label/tab-separated message at line {number}")
        rows.append({"label": label, "text": text})
    if {row["label"] for row in rows} != {"ham", "spam"}:
        raise ValueError("Both ham and spam labels are required")
    return rows


def deduplicate(rows):
    groups = {}
    for row in rows:
        groups.setdefault(normalize_text(row["text"]), []).append(row)
    records = []
    conflicts = 0
    for normalized, group in groups.items():
        if len({row["label"] for row in group}) != 1:
            conflicts += len(group)
            continue  # Drop the entire conflicting group rather than guessing its label.
        records.append({"id": sha256(normalized.encode()), "label": group[0]["label"], "text": group[0]["text"]})
    return records, {
        "raw_rows": len(rows), "unique_rows": len(records),
        "duplicate_rows_removed": len(rows) - len(records) - conflicts,
        "conflicting_label_rows_removed": conflicts,
    }
