"""Train a small SMS spam classifier. Holdout data never chooses model parameters."""
import json
from collections import Counter
from importlib.metadata import version
from pathlib import Path
import platform

try:
    import joblib
    import numpy as np
    from sklearn.dummy import DummyClassifier
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, fbeta_score, confusion_matrix
    from sklearn.model_selection import train_test_split
    from sklearn.pipeline import Pipeline
except ModuleNotFoundError as error:
    raise SystemExit(f"Training dependency unavailable: {error.name}. Install training/requirements.txt first.") from None

from common import SEED, SOURCE, DATASET, CITATION, LICENSE, normalize_text, sha256

ROOT = Path(__file__).resolve().parent
SCENARIOS = [
    ("clear_scam", "Your bank account will be blocked in 10 minutes. Send your OTP immediately.", "Critical rules must remain high risk regardless of ML output."),
    ("protective", "Never share your OTP or PIN with anyone.", "No credential-theft request; no verified-safety claim."),
    ("kyc", "Complete your KYC verification immediately or your account will be suspended.", "Verification and pressure rules must remain detectable."),
    ("routine", "Your credit card has been delivered.", "No invented scam indicators."),
    ("ambiguous", "Account update.", "Insufficient evidence must remain possible."),
]


def evaluate(truth, predictions):
    tn, fp, fn, tp = [int(value) for value in confusion_matrix(truth, predictions, labels=["ham", "spam"]).ravel()]
    return {
        "accuracy": float(accuracy_score(truth, predictions)),
        "precision": float(precision_score(truth, predictions, pos_label="spam", zero_division=0)),
        "recall": float(recall_score(truth, predictions, pos_label="spam", zero_division=0)),
        "f1": float(f1_score(truth, predictions, pos_label="spam", zero_division=0)),
        "f2": float(fbeta_score(truth, predictions, beta=2, pos_label="spam", zero_division=0)),
        "confusion_matrix": [[tn, fp], [fn, tp]],
        "false_positive_rate": fp / (tn + fp) if tn + fp else 0.0,
        "false_negative_rate": fn / (fn + tp) if fn + tp else 0.0,
    }


def decisions(probabilities, threshold):
    return np.where(probabilities >= threshold, "spam", "ham")


def spam_probabilities(pipeline, texts):
    index = list(pipeline.classes_).index("spam")
    return pipeline.predict_proba(texts)[:, index]


def main():
    data_path = ROOT / "data" / "records.jsonl"
    if not data_path.exists():
        raise SystemExit("No prepared UCI data. Run training/prepare_data.py first; no substitute data will be used.")
    data = data_path.read_bytes()
    provenance = json.loads((ROOT / "data" / "manifest.json").read_text())
    if provenance["download"] != SOURCE or provenance["records_sha256"] != sha256(data):
        raise SystemExit("Dataset provenance/checksum mismatch; prepare the official archive again.")
    records = [json.loads(line) for line in data.decode("utf-8").splitlines()]
    texts = [record["text"] for record in records]
    labels = np.array([record["label"] for record in records])
    normalized = [normalize_text(text) for text in texts]
    if len(set(normalized)) != len(normalized) or len({record["id"] for record in records}) != len(records):
        raise SystemExit("Duplicate messages detected; deduplication must precede splitting.")

    indices = np.arange(len(records))
    development, test = train_test_split(indices, test_size=0.15, stratify=labels, random_state=SEED)
    train, validation = train_test_split(development, test_size=0.15 / 0.85, stratify=labels[development], random_state=SEED)
    assert not (set(train) & set(validation) or set(train) & set(test) or set(validation) & set(test))
    x_train = [texts[i] for i in train]
    x_validation = [texts[i] for i in validation]
    y_train, y_validation = labels[train], labels[validation]
    candidates = []
    best = None
    for ngrams in [(1, 1), (1, 2)]:
        for c in [1.0, 4.0]:
            for class_weight in [None, "balanced"]:
                pipeline = Pipeline([
                    ("tfidf", TfidfVectorizer(
                        preprocessor=normalize_text, lowercase=False, token_pattern=r"(?u)\b\w+\b",
                        ngram_range=ngrams, min_df=2, max_features=12_000,
                        sublinear_tf=True, norm="l2", dtype=np.float64,
                    )),
                    ("classifier", LogisticRegression(
                        C=c, class_weight=class_weight, solver="liblinear", max_iter=1_000, random_state=SEED,
                    )),
                ])
                # The vocabulary, IDF, class weights and coefficients fit TRAIN ONLY.
                pipeline.fit(x_train, y_train)
                probabilities = spam_probabilities(pipeline, x_validation)
                for threshold in [0.20, 0.30, 0.40, 0.50, 0.60]:
                    metrics = evaluate(y_validation, decisions(probabilities, threshold))
                    guard = metrics["precision"] >= 0.90 and metrics["false_positive_rate"] <= 0.02
                    settings = {"ngram_range": ngrams, "C": c, "class_weight": class_weight, "threshold": threshold}
                    candidates.append({"parameters": settings, "validation": metrics, "validation_guard_met": guard})
                    # Prefer recall through F2, subject to the validation precision/FPR guard.
                    rank = (guard, metrics["f2"], metrics["recall"], metrics["precision"])
                    if best is None or rank > best[0]:
                        best = (rank, pipeline, settings, metrics, guard)

    _, pipeline, settings, validation_metrics, guard_met = best
    threshold = settings["threshold"]
    # Freeze model AND threshold before touching the held-out test split. No refit.
    x_test, y_test = [texts[i] for i in test], labels[test]
    probabilities = spam_probabilities(pipeline, x_test)
    predictions = decisions(probabilities, threshold)
    test_metrics = evaluate(y_test, predictions)
    baseline = DummyClassifier(strategy="most_frequent").fit(np.zeros((len(train), 1)), y_train)
    baseline_metrics = evaluate(y_test, baseline.predict(np.zeros((len(test), 1))))

    artifacts, reports = ROOT / "artifacts", ROOT / "reports"
    artifacts.mkdir(exist_ok=True)
    reports.mkdir(exist_ok=True)
    joblib.dump(pipeline, artifacts / "sms-spam-pipeline.joblib", compress=3)
    joblib.dump(pipeline.named_steps["tfidf"], artifacts / "tfidf-vectorizer.joblib", compress=3)
    vectorizer, classifier = pipeline.named_steps["tfidf"], pipeline.named_steps["classifier"]
    exported = {
        "schema_version": 1, "task": "sms_spam_not_fraud", "seed": SEED,
        "dataset_records_sha256": provenance["records_sha256"], "threshold": threshold,
        "normalization": "Unicode NFKC, lowercase, collapse whitespace, trim",
        "token_pattern": vectorizer.token_pattern, "ngram_range": list(vectorizer.ngram_range),
        "sublinear_tf": True, "norm": "l2", "classes": classifier.classes_.tolist(), "positive_class": "spam",
        "features": vectorizer.get_feature_names_out().tolist(), "idf": vectorizer.idf_.tolist(),
        "coefficients": classifier.coef_[0].tolist(), "intercept": float(classifier.intercept_[0]),
        "browser_parity_validated": False,
    }
    (artifacts / "sms-spam-model.json").write_text(json.dumps(exported, ensure_ascii=False, separators=(",", ":")) + "\n")
    splits = {name: [records[i]["id"] for i in split] for name, split in [("train", train), ("validation", validation), ("test", test)]}
    (artifacts / "splits.json").write_text(json.dumps(splits, indent=2) + "\n")
    # Full test inputs + Python outputs support future JS parity checks, never model tuning.
    parity = [{"id": records[i]["id"], "text": texts[i], "spam_probability": float(p), "label": str(label)}
              for i, p, label in zip(test, probabilities, y_test)]
    (artifacts / "python-parity.json").write_text(json.dumps(parity, ensure_ascii=False) + "\n")
    scenarios = [{"name": name, "text": text, "spam_probability": float(spam_probabilities(pipeline, [text])[0]), "expected_rule_behavior": expectation}
                 for name, text, expectation in SCENARIOS]
    environment = {name: version(name) for name in ["scikit-learn", "numpy", "scipy", "joblib", "threadpoolctl"]}
    (artifacts / "environment.lock.txt").write_text("\n".join(f"{name}=={value}" for name, value in environment.items()) + "\n")
    report = {
        "status": "trained_evaluated_not_integrated", "dataset": DATASET, "citation": CITATION, "license": LICENSE,
        "seed": SEED, "python": platform.python_version(), "environment": environment, "provenance": provenance,
        "splits": {name: {"count": len(split), "labels": dict(Counter(labels[split]))} for name, split in [("train", train), ("validation", validation), ("test", test)]},
        "selected_parameters": settings, "validation": validation_metrics, "validation_guard_met": guard_met,
        "test": test_metrics, "baseline_test": baseline_metrics, "candidates": candidates,
        "representative_banking_examples": scenarios, "feature_count": len(exported["features"]),
        "export_bytes": (artifacts / "sms-spam-model.json").stat().st_size,
        "false_negative_test_ids": [records[i]["id"] for i, label, prediction in zip(test, y_test, predictions) if label == "spam" and prediction == "ham"],
        "false_positive_test_ids": [records[i]["id"] for i, label, prediction in zip(test, y_test, predictions) if label == "ham" and prediction == "spam"],
        "limitations": [
            "SMS spam labels are not verified phishing or financial-fraud labels.",
            "Exact/normalized duplicates are removed, but related spam templates can still span splits.",
            "Random splits do not establish temporal, sender-independent or modern Gmail/WhatsApp performance.",
            "Spam scores are not calibrated financial-fraud probabilities.",
            "Banking scenarios are qualitative probes, not a labeled phishing benchmark or tuning set.",
            "Production integration is disabled until browser/Python parity and hybrid regressions pass.",
        ],
    }
    (reports / "evaluation.json").write_text(json.dumps(report, indent=2) + "\n")
    lines = ["# SMS spam evaluation", "", "Status: trained and evaluated; NOT integrated into the extension.", "", CITATION, "", LICENSE, "",
             f"Seed: {SEED}. Train/validation/test: {len(train)}/{len(validation)}/{len(test)}. Features: {len(exported['features'])}.",
             f"Validation selection: {settings}. Precision/FPR guard met: {guard_met}.", "",
             "| Held-out metric | TF-IDF + logistic regression | Majority baseline |", "|---|---:|---:|"]
    for key in ["accuracy", "precision", "recall", "f1", "false_positive_rate", "false_negative_rate"]:
        lines.append(f"| {key} | {test_metrics[key]:.4%} | {baseline_metrics[key]:.4%} |")
    lines += ["", f"Confusion matrix (true rows / predicted columns; ham, spam): {test_metrics['confusion_matrix']}", "",
              "Parameters and threshold were chosen with validation data only. TF-IDF and model fit training data only; no post-test refit.", "",
              "## Banking probes (not a phishing benchmark)", ""]
    for scenario in scenarios:
        lines.append(f"- {scenario['name']}: SMS-spam score {scenario['spam_probability']:.4%}. {scenario['expected_rule_behavior']}")
    lines += ["", "## Limits", ""] + [f"- {item}" for item in report["limitations"]]
    (reports / "evaluation.md").write_text("\n".join(lines) + "\n")
    print(json.dumps({"test": test_metrics, "baseline_test": baseline_metrics, "parameters": settings, "validation_guard_met": guard_met}, indent=2))


if __name__ == "__main__":
    main()
