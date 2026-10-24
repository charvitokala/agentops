# Evaluation status: NOT RUN

No accuracy, precision, recall, F1, confusion matrix, false-positive rate or false-negative rate is available.

Blocking conditions observed:

1. The shell cannot resolve `archive.ics.uci.edu`; the official dataset archive could not be downloaded.
2. Python 3.13 and 3.14 have no scikit-learn installation. Installing it fails because PyPI cannot be resolved.

The official UCI metadata/license page was accessible through the web tool, but that does not make the dataset or Python packages available to the training process.

The provided scripts implement a train/validation/test workflow, baseline comparison, validation-only tuning, required test metrics and banking probes. Those model-training paths have **not been executed or validated** here. Successful training will replace this status file with measured results and also create `evaluation.json`.

Production detection remains rule-based. There is no active ML inference or hybrid risk calculation, and no trained model has been bundled into the extension. Existing UI, extraction, monitoring and privacy behavior remain unchanged.
