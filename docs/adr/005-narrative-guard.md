# ADR-005: Narratives are generated against a closed fact sheet and validated before display

Status: accepted

Context: The product promise is that the LLM explains and never calculates. A prompt instruction alone is not a control.

Decision:

1. The engine report is flattened into a numbered fact sheet (`F1..Fn`). Facts are the only numbers a narrative may use.
2. The model writes JSON statements with placeholders (`{{F3}}`, `{{F3:abs}}`) and lists the facts each statement cites. Our code renders the numbers.
3. A guard checks every statement: cited facts exist, placeholders are cited, literal numbers belong to _that statement's own_ cited facts, no spelled-out amounts, statement kind matches fact basis (CONFIRMED / CALCULATED), hypotheses are hedged and number-free.
4. Failure gets one corrective retry with the validator's feedback, then a deterministic template narrative that is itself guarded. A model error also falls back. Unvalidated model text is never returned.
5. Each result records model, prompt version, prompt hash and fact-sheet hash.

Consequences: A wrong number cannot reach a user unless the engine produced it. The guard does not verify qualitative claims (see assumption A16). Live model quality is measured by `pnpm eval:live`, outside CI.
