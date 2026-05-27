# 2026-05-27 Users sheet format

## Scope

- Updated the `Users` tab in the Google Sheet `Places`.
- Target spreadsheet: `https://docs.google.com/spreadsheets/d/19zL0Ph0cocqfg5teJu6WKUI8dh_T5y3kSp7MdBQPAcI/edit`
- Target sheet: `Users`
- Replaced the old headers with:
  - `email`
  - `name`
  - `phone`
  - `languages`
  - `hakka_dialect`
  - `life_area_1`
  - `survey_area_1`
  - `life_area_2`
  - `survey_area_2`
  - `life_area_3`
  - `survey_area_3`
  - `active`
- Preserved the current admin reference row as `kunui711 / 君偉 / active = TRUE`.
- Cleared old `test` and `test02` investigator rows from the Sheet to match the DB state.
- Applied checkbox validation to the `active` column from row 2 downward.
- Froze the header row and widened columns A:L.

## Verification

- Re-read `Users!A1:L6`; headers match the sync schema and old test users are gone.
