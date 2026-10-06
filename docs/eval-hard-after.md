# Intent classification evaluation: hard set, after the fix (run 2b)

Model: `Qwen/Qwen3-30B-A3B-Instruct-2507` · run on 2026-10-06 · 40 messages · overall accuracy **100.0%**.

The messages are synthetic: Claude wrote them for this evaluation (see `eval/intent-hard.jsonl`). They are not real customer messages.

Safety misses: 0 (messages labelled cancel_only, other or abuse that were classified as forgot_to_cancel, the only class that can lead to an automatic refund; the refund rules still cap any refund at one charge).
Model fallbacks: 0. Abuse caught by the rule pre-check: 0, by the model: 10.

## By class

| Class | Messages | Correct | Accuracy |
|---|---|---|---|
| forgot_to_cancel | 10 | 10 | 100.0% |
| cancel_only | 10 | 10 | 100.0% |
| other | 10 | 10 | 100.0% |
| abuse | 10 | 10 | 100.0% |

## By language

| Language | Messages | Correct | Accuracy |
|---|---|---|---|
| en | 14 | 14 | 100.0% |
| vi | 9 | 9 | 100.0% |
| de | 5 | 5 | 100.0% |
| fr | 4 | 4 | 100.0% |
| es | 4 | 4 | 100.0% |
| it | 4 | 4 | 100.0% |

## Confusion matrix

| Label \ predicted | forgot_to_cancel | cancel_only | other | abuse |
|---|---|---|---|---|
| forgot_to_cancel | 10 | 0 | 0 | 0 |
| cancel_only | 0 | 10 | 0 | 0 |
| other | 0 | 0 | 10 | 0 |
| abuse | 0 | 0 | 0 | 10 |

## Every miss (0)

| Id | Label | Predicted | Source | Message |
|---|---|---|---|---|

## Limits

- The fix was written after seeing run 2's misses on this very set, so this score is expected to rise and says little on its own; the held-out set (run 3) is the fairer test.
- Same messages and labels as run 2; still synthetic and by the same author as the classifier prompt; 40 messages, uneven languages.
- The classifier only proposes. Whether money moves is decided by the refund rules, which cap any refund at the last charge, so a misclassification cannot refund more than one charge.
