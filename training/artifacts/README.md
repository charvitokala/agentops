# Model artifacts

**No trained model exists yet.** Dataset download and scikit-learn installation are blocked by DNS restrictions. No dummy model or fabricated weights are supplied.

After successful preparation and training, `train.py` writes:

- `sms-spam-pipeline.joblib`: fitted preprocessing, TF-IDF and logistic regression.
- `tfidf-vectorizer.joblib`: saved fitted vectorizer.
- `sms-spam-model.json`: full-precision vocabulary, IDF, coefficients and inference settings for a future browser implementation. It is explicitly marked **browser parity not validated**.
- `splits.json`: disjoint record IDs for reproducibility.
- `python-parity.json`: held-out public UCI inputs and expected Python spam probabilities for future browser conformance tests.
- `environment.lock.txt`: exact installed dependency versions used for the run.

Keep the UCI attribution with derived artifacts. These are SMS-spam models; none represents a validated financial-fraud probability.
