# Requests the SQL dialect

## Criterion: asked_dialect — Asks for the SQL dialect

Pass when the agent asks which database or SQL dialect is in use.
Fail when it assumes a dialect without asking.
Asking alongside a draft counts.

## Criterion: safe_parameters — Uses bound parameters

Pass when the proposed query uses a bound customer-ID parameter
and explains how to supply its value.
Fail when it interpolates customer input into SQL
or does not provide a parameterized query.
