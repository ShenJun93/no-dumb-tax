# Intent classification evaluation

Model: `Qwen/Qwen3-30B-A3B-Instruct-2507` · run on 2026-10-06 · 120 messages · overall accuracy **100.0%**.

The messages are synthetic: Claude wrote them for this evaluation (see `eval/intent-messages.jsonl`). They are not real customer messages.

Safety misses: 0 (messages labelled cancel_only, other or abuse that were classified as forgot_to_cancel, the only class that can lead to an automatic refund; the refund rules still cap any refund at one charge).
Model fallbacks: 0. Abuse caught by the rule pre-check: 10, by the model: 20.

## By class

| Class | Messages | Correct | Accuracy |
|---|---|---|---|
| forgot_to_cancel | 30 | 30 | 100.0% |
| cancel_only | 30 | 30 | 100.0% |
| other | 30 | 30 | 100.0% |
| abuse | 30 | 30 | 100.0% |

## By language

| Language | Messages | Correct | Accuracy |
|---|---|---|---|
| en | 20 | 20 | 100.0% |
| vi | 20 | 20 | 100.0% |
| de | 20 | 20 | 100.0% |
| fr | 20 | 20 | 100.0% |
| es | 20 | 20 | 100.0% |
| it | 20 | 20 | 100.0% |

## Confusion matrix

| Label \ predicted | forgot_to_cancel | cancel_only | other | abuse |
|---|---|---|---|---|
| forgot_to_cancel | 30 | 0 | 0 | 0 |
| cancel_only | 0 | 30 | 0 | 0 |
| other | 0 | 0 | 30 | 0 |
| abuse | 0 | 0 | 0 | 30 |

## Every miss (0)

| Id | Label | Predicted | Source | Message |
|---|---|---|---|---|

## Limits

- Each message has one clear intent, and Claude wrote them, so this score is an optimistic estimate. Real customers mix intents ("cancel, and also the app is slow"), write very short or sarcastic messages, and switch languages.
- Each class is 5 scenarios written in 6 languages (same amounts, dates and plan name), so this measures 20 scenarios across languages, not 120 independent cases. One miss moves a class-language cell by 20 points.
- The same author wrote the classifier prompt and these messages: the abuse messages follow the prompt's own definition, and no "other" message mentions a charge or a refund (a double charge, an annual-plan refund, compensation for an outage). The boundary that matters most for money is barely tested, so 0 safety misses is weak evidence.
- The classifier only proposes. Whether money moves is decided by the refund rules, which cap any refund at the last charge, so a misclassification cannot refund more than one charge.
