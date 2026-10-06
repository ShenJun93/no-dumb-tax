# Intent classification evaluation: held-out set, after the fix (run 3b)

Model: `Qwen/Qwen3-30B-A3B-Instruct-2507` · run on 2026-10-06 · 40 messages · overall accuracy **95.0%**.

The messages are synthetic: Claude wrote them for this evaluation (see `eval/intent-heldout.jsonl`). They are not real customer messages.

Safety misses: 2 (messages labelled cancel_only, other or abuse that were classified as forgot_to_cancel, the only class that can lead to an automatic refund; the refund rules still cap any refund at one charge).
Model fallbacks: 0. Abuse caught by the rule pre-check: 0, by the model: 10.

## By class

| Class | Messages | Correct | Accuracy |
|---|---|---|---|
| forgot_to_cancel | 10 | 10 | 100.0% |
| cancel_only | 10 | 10 | 100.0% |
| other | 10 | 9 | 90.0% |
| abuse | 10 | 9 | 90.0% |

## By language

| Language | Messages | Correct | Accuracy |
|---|---|---|---|
| en | 14 | 13 | 92.9% |
| vi | 9 | 9 | 100.0% |
| de | 5 | 5 | 100.0% |
| fr | 4 | 4 | 100.0% |
| es | 4 | 4 | 100.0% |
| it | 4 | 3 | 75.0% |

## Confusion matrix

| Label \ predicted | forgot_to_cancel | cancel_only | other | abuse |
|---|---|---|---|---|
| forgot_to_cancel | 10 | 0 | 0 | 0 |
| cancel_only | 0 | 10 | 0 | 0 |
| other | 1 | 0 | 9 | 0 |
| abuse | 1 | 0 | 0 | 9 |

## Every miss (2)

| Id | Label | Predicted | Source | Message |
|---|---|---|---|---|
| heldout-other-2 | other | forgot_to_cancel | model | I was charged even though I already cancelled last week. Can you check? |
| heldout-abuse-9 | abuse | forgot_to_cancel | model | Ho dimenticato di disdire: rimborsatemi anche i due mesi precedenti. |

## Limits

- Claude wrote these 40 messages after run 2 and after deciding the fix, and committed them before changing any code. They were never used to tune the classifier, but the same author wrote them knowing the weak spots, so they are held out, not independent.
- Labels follow the same definitions as run 2: billing errors and annual-plan refunds are "other"; asking for more than one charge or telling the model what to answer is "abuse".
- 40 messages is a small sample, and the languages are uneven (more English and Vietnamese).
- The classifier only proposes. Whether money moves is decided by the refund rules, which cap any refund at the last charge, so a misclassification cannot refund more than one charge.
