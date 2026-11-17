# Narrative rules (what the guard enforces)

| Rule                                                                                    | Code                              | Example that is rejected                                                             |
| --------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------ |
| Output is valid JSON of the expected shape                                              | BAD_JSON, BAD_SHAPE               | Prose, or a statement with kind "OPINION"                                            |
| Every cited fact exists                                                                 | UNKNOWN_FACT                      | `{{F999}}`                                                                           |
| Every placeholder in the text is also listed in `fact_ids`                              | TOKEN_NOT_CITED                   | Uses `{{F3}}` but cites only F2                                                      |
| Every literal number equals a value of a fact cited by that statement                   | NUMBER_NOT_ALLOWED                | "revenue missed by 7.5 Cr"; "4 Cr" attached to the revenue shortfall; a sum or ratio |
| No spelled-out amounts                                                                  | NUMBER_WORD                       | "eight crore", "twelve percent"                                                      |
| CONFIRMED cites only ledger facts; CALCULATED cites at least one engine-calculated fact | BASIS_MISMATCH                    | A variance labelled CONFIRMED                                                        |
| CONFIRMED and CALCULATED need evidence                                                  | NO_EVIDENCE                       | "Things look worse" with no facts                                                    |
| HYPOTHESIS is hedged and has no numbers                                                 | HEDGE_MISSING, NUMBER_NOT_ALLOWED | "Customers cut orders because of the monsoon."                                       |
| The headline is not a hypothesis                                                        | HEADLINE_KIND                     |                                                                                      |
| No unresolved placeholders                                                              | BAD_TOKEN                         | `{{ F1 }}`                                                                           |

Accepted spellings of a value (for example 8 Cr): `8.00`, `8`, `8.0`. Dates (`2026-11`, `FY27`, "November 2026") are ignored; year-like amounts (`₹2026 Cr`, `2099.90%`) are not.

Not checked: whether qualitative statements are true (assumption A16) and bare spelled-out counts (A17).
