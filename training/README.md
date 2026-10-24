# UCI SMS spam training

Status: preparation/training code is provided, but **training and evaluation are blocked** by unavailable dataset/package downloads. No model performance or browser parity is claimed. The existing VerdictAI extension is unchanged.

## Run on a machine with internet access

From the repository root, with Python 3.13 or newer:

```sh
python3 -m venv training/.venv
training/.venv/bin/python -m pip install -r training/requirements.txt
training/.venv/bin/python training/prepare_data.py
training/.venv/bin/python training/train.py
```

If the official zip is already downloaded, use `training/.venv/bin/python training/prepare_data.py --archive /absolute/path/to/official.zip`. No private chat messages, extension state or email accounts are used.

The primary dependency is pinned. Each successful run saves exact transitive package versions and the Python version; use `artifacts/environment.lock.txt` to recreate that environment. Dataset checksums, normalized record IDs, seed 42 and saved split IDs make runs auditable. Small numerical differences can still occur across platforms/BLAS builds.

## Preparation and experimental design

- Official UCI source, labels, licence and attribution are documented in `data/README.md`. Raw text is retained. NFKC/lowercase/whitespace normalization preserves phone numbers, amounts, URLs and urgency wording; it does not replace them with generic placeholders. TF-IDF tokenizes words/numbers, so URL punctuation is not itself a feature.
- Remove exact/normalized duplicate messages **before** splitting. Drop groups with conflicting labels instead of guessing. Reject malformed lines and missing classes.
- Stratified splits: approximately 70% train, 15% validation, 15% test, seed 42. The same normalized message cannot cross splits.
- Vocabulary, IDF, class weights and logistic regression fit **training data only**. Fixed normalization is not learned from the corpus. Validation/test messages never build the vocabulary.
- Compare unigram/bigram TF-IDF, C = 1/4, and unweighted/balanced classes. Use at most 12,000 features, sublinear TF, L2 normalization and a deterministic liblinear solver.
- Tune spam thresholds 0.20–0.60 on validation data. Prefer F2 (recall-weighted) subject to validation precision ≥90% and false-positive rate ≤2%. If no candidate passes, report that the guard failed; a saved experimental model is not production-approved.
- Freeze the chosen model and threshold before test evaluation. Do not refit on validation or test data. Compare all required held-out metrics with an always-majority baseline. Confusion matrix order is `[[TN, FP], [FN, TP]]`, with spam positive.
- Banking examples are qualitative out-of-domain probes, not training data, tuning data, or a labeled fraud benchmark. Full test examples and Python outputs are saved for later JS parity testing.

Random deduplicated splits can still share related spam templates. Future evaluation should include template-grouped and chronological splits and separately labeled modern phishing examples. SMS spam accuracy does not establish phishing, WhatsApp, Gmail or BFSI accuracy. Logistic output is an SMS-spam score, not a calibrated fraud probability.

## Checks available without downloads

```sh
python3 -m unittest discover -s training/tests -p 'test_*.py'
python3 -m py_compile training/common.py training/prepare_data.py training/train.py
node --experimental-strip-types --test training/tests/*.test.mjs
```

Parser fixtures are synthetic unit-test inputs only; they are never written into `training/data` or used as a substitute corpus. Syntax and parser tests do not validate unexecuted scikit-learn training paths.

## Browser/hybrid integration plan — intentionally not enabled yet

1. Train and review real held-out results, especially false negatives. Do not turn spam labels into fraud labels.
2. Exported JSON already contains the bounded vocabulary/IDF/logistic coefficients. Implement NFKC/lowercase, compatible Unicode word tokenization and n-grams, sublinear term frequency, IDF multiplication, L2 normalization, dot product and sigmoid locally in TypeScript. Bundle the model with the MV3 build; use no Python, remote model downloads, uploads or inference APIs.
3. Require probability agreement with Python within `1e-8` on **all** held-out parity inputs plus Unicode, multiline, URL, phone/amount, empty and out-of-vocabulary cases before activation. Also compare feature indices and normalized feature weights. Tokenization or Unicode mismatches block integration; do not silently ship an approximate conversion.
4. Keep critical rule classifications as a floor; an ML ham score can never reduce them. Treat high SMS-spam similarity as corroboration, not independent proof: do not average or sum it with the rule score. A candidate policy may promote a weak rule result to medium only when an actionable financial rule and validation-qualified spam score coexist; ML alone must not assert high financial-fraud risk. This policy remains unimplemented and needs tests/evaluation before approval.
5. Add only a general spam-pattern finding. Never infer credential theft, urgency or other specific evidence from ML alone. Preserve protective advice, routine notifications and ambiguity tests. Keep the risk score distinct from SMS-spam probability.
6. Reuse the existing cached assessment pipeline and canonical handoff validation. Explicitly version the analysis method/model across content scripts, broker and website schema. Do not mislabel hybrid analysis `local_rules` or weaken the handoff's canonical recalculation checks. No UI redesign is needed.

No extension files have been modified for this training task because there is not yet a trained, evaluated, parity-verified model to integrate.
