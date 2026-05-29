# Drug content

This directory contains synthetic seed data for Med-Tracker's drug catalog. There is one JSON file per medication in `drugs/`, plus an `drugs-index.json` summary used by the API to power fast searches.

## Schema

```jsonc
{
  "id": "lisinopril",
  "generic": "lisinopril",
  "brand": "Prinivil",
  "class": "ACE inhibitor",
  "rxnormSample": 104366,
  "indications": ["hypertension", "heart failure"],
  "dosages": ["2.5 mg", "5 mg", "10 mg", "20 mg", "40 mg"],
  "routes": ["oral tablet"],
  "frequencies": ["once daily"],
  "interactions": ["potassium", "NSAIDs", "lithium", "aliskiren"],
  "warnings": ["..."],
  "pregnancyCategory": "D",
  "storage": "..."
}
```

## Important

Entries are synthetic and **not** suitable for clinical decision support. Replace this catalog with a licensed RxNorm or OpenFDA snapshot before deploying to production.

## Regenerating

```bash
node scripts/gen-drugs.js
node scripts/gen-drug-index.js
```
