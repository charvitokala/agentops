# Official dataset location

The archive has **not been downloaded** in this environment: the shell cannot resolve `archive.ics.uci.edu`.

`prepare_data.py` downloads only the official UCI archive into this directory and preserves `SMSSpamCollection` and its original `readme`. It validates tab-separated `ham`/`spam` rows, removes normalized duplicates and conflicting-label groups, and records SHA-256 checksums in `manifest.json` before training can begin. No WhatsApp/Gmail messages are read by the training scripts.

Official metadata verified at <https://archive.ics.uci.edu/dataset/228/sms+spam+collection>:

- Labels describe **SMS spam**, not verified financial fraud.
- License: **CC BY 4.0**, <https://creativecommons.org/licenses/by/4.0/>. Preserve attribution when sharing data or derived models.
- Attribution: Almeida, T. & Hidalgo, J. (2011). SMS Spam Collection [Dataset]. UCI Machine Learning Repository. <https://doi.org/10.24432/C5CC84>.
- UCI describes a label followed by the message on each line. Actual archive parsing and counts remain unverified until download succeeds; the script reports observed counts rather than assuming the catalogue count.

An existing official archive can be supplied with `python training/prepare_data.py --archive /absolute/path/to/official.zip`. This bypasses downloading, not validation or deduplication. The recorded checksum establishes reproducibility, not an independently published archive signature.
