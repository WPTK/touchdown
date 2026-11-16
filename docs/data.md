# Data sources

Every number in the sim comes from one of these. Nothing is from memory.

## Fleet, wake categories and performance (`src/fleet.js`)

| Value | Source | Retrieved |
|---|---|---|
| Wake matrix `CWT_MIN_NM` | JO 7110.65BB, TBL 5-5-4 (wake turbulence separation for on approach), from `atc/chap5_section_5.txt`. A test compares each row's values, in order, to that text. It runs only where the local FAA text exists, so CI skips it. Blank-cell positions are pinned by separate assertions. | 2026-11-15 |
| CWT letter per type | FAA Order JO 7360.1K (effective 2025-06-12), CWT column. The Aircraft Characteristics Database (ACD) agrees on all 22 types. | 2026-11-16 |
| Approach category `apchCat` | FAA Aircraft Characteristics Database, `AAC` column (14 CFR 97.3 categories, set from Flight Standardization Board or manufacturer data). | 2026-11-16 |
| `vrefKt` | ACD `Approach_Speed_knot`: approach speed at maximum allowable landing weight. | 2026-11-16 |
| Arrival mix weights | ACD `TMFS_Operations_FY24`: FY24 operations by type for the whole US. Not Atlanta. This is an assumption that the national mix stands in for ATL. | 2026-11-16 |

Two values are derived, not published:

- `finalKt` is `vrefKt + 5`. The 5 kt margin is an assumption.
- `descentFpm` is a 3 degree glidepath flown at `finalKt` (about 5.3 ft/min per knot).

Nothing is UNCONFIRMED. All 22 types have a CWT from the current 7360.1K, not the 2015 copy.

URLs (faa.gov wants a browser user agent, sent openly):

- 7360.1K: `https://www.faa.gov/documentLibrary/media/Order/FAA_Order_JO_7360.1K_Aircraft_Type_Designators.pdf`
- ACD: `https://www.faa.gov/airports/engineering/aircraft_char_database/aircraft_data` (an .xlsx, last updated 2025-01-07 per the page)

### Licences

- **FAA documents and the ACD** are US government works. No licence restriction.
- **OpenAP** was checked and not used. The code is LGPL-3.0 and its `data/` folder carries its own GPL-3.0 file. This repo is MIT, and copying GPL data in is a problem. It also lacks the CRJ and 717 types ATL sees. If someone wants OpenAP's kinematic data later, it needs a licence call first.
- **BADA** is licensed. Not used. (The ACD has a `Model_BADA` name column. We read none of the BADA data it points to.)

### What the sim uses

Wake spacing, type, CWT and category drive the sim. `finalKt` and `descentFpm` ride along on each aircraft but don't move it. Every aircraft still flies the inner leg at `innerSpeedKt`, because the separation argument needs equal speeds, so a time gap is a distance gap.

Wake minimums apply to consecutive pairs only, as the table does. At 160 kt, 120 s is 5.33 NM, which covers the largest minimum among these types (5 NM). So at default settings wake never binds and the run behaves like the flat 120 s spacing. It binds when `spacingS` drops (a test uses 80 s) or the fleet gains H or I types.
