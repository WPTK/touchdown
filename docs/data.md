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

## Airspace: FAA CIFP for KATL (`data/katl-2611.json`)

`data/katl-2611.json` is generated from the FAA's Coded Instrument Flight Procedures (CIFP) file. Nothing in it is
typed in by hand or taken from memory; every number comes from a record in the FAA source.

### Source

| | |
|---|---|
| File | `FAACIFP18` inside `CIFP_261029.zip` |
| URL | <https://aeronav.faa.gov/Upload_313-d/cifp/CIFP_261029.zip> (a plain `curl` works; faa.gov web pages need a browser user agent) |
| Format | ARINC 424-18 (132-character fixed-width records) |
| AIRAC cycle | 2611, generated 2026-10-07, effective 2026-10-29 |
| Airport | KATL, region K7: 1,980 records |

The cycle and dates in the JSON are read from the file's own header records (`HDR01`, `HDR04`), and the parser stops
if the two disagree. The next cycle, `CIFP_261126.zip`, takes effect 2026-11-26.

### Licence

The CIFP is a product of the US Department of Transportation, Federal Aviation Administration, and is "not
copyrighted under Title 17 U.S.C." (CIFP Disclaimer, item 1). The extracted JSON is a US government work in the
public domain. The raw file is not committed (`data/raw/` is ignored); download it from the URL above.

The FAA asks developers of products that use the CIFP to carry these warranty disclaimers:

1. Under 10 U.S.C. 456, no civil action may be brought against the United States on the basis of the content of a
   navigational aid prepared or disseminated by the FAA.
2. The CIFP product is provided "as is" and no warranty, express or implied, including, but not limited to the implied
   warranties of merchantability and fitness for particular purpose or arising by statute or otherwise in law or from a
   course of dealing or usage in trade, is made by the FAA as to the accuracy and functioning of the product.
3. Neither the FAA nor its personnel will be liable for any claims, losses, or damages arising from or connected with
   the use of this product. The user agrees to hold harmless the United States Federal Aviation Administration. The
   user's sole and exclusive remedy is to stop using the CIFP product.

The FAA is not responsible for products derived from the CIFP. This is a simulator and must never be used for
navigation.

### Regenerate

```
# download and unzip CIFP_261029.zip, then
npm run data -- path/to/FAACIFP18            # airport KATL, writes data/katl-2611.json
npm run data -- data/raw/FAACIFP18 KATL      # same, explicit airport
npm test
```

`scripts/cifp.js [CIFP file or folder] [airport ident] [output]` has no dependencies. The output name comes from the
cycle in the header, so a new cycle writes a new file. The output has no timestamps: the same input gives the same
bytes.

### What is extracted

- **Header and airport**: cycle, effective date, creation time; airport reference point, elevation, transition
  altitude, name.
- **Magnetic variation**: 5.0 degrees west (`-5` in the JSON, east positive; true = magnetic + variation), from the
  airport record. Runway `trueBearingDeg` is the magnetic bearing plus this value. Each fix also carries its own
  variation where the record has one.
- **Runways** (10 ends): threshold position and elevation, length, width, magnetic and true bearing, displaced
  threshold, threshold crossing height, localizer ident.
- **ILS approaches** (10, `I08L` to `I28`): localizer (frequency, position, bearing, width), glide slope (angle,
  position, threshold crossing height, elevation), the approach transitions, the final and missed approach legs
  (every leg tagged `intermediate` before the FAF, `final` from the FAF to the missed approach point, or `missed`), and the FAF.
- **STARs** (8): every enroute transition, common route and runway transition, with every leg's path terminator, fix,
  turn direction, altitude description and altitudes, speed limit, course, distance and recommended navaid.
  Runway transition `RW08B` is expanded to `08L` and `08R` in `runways`.
- **Fixes**: every fix, recommended navaid, localizer and runway the legs reference (202), resolved from terminal
  waypoints (PC), enroute waypoints (EA) and VHF navaids and NDBs (D, DB), with latitude and longitude. Nothing is
  unresolved (`unresolvedFixes` is empty and a test checks it).
- **Projection**: `xNm` east and `yNm` north of the airport reference point, on a spherical azimuthal equidistant
  projection (Earth radius 3440.0695 NM). Distance and bearing from the airport are exact on the sphere; the sphere
  differs from the WGS 84 ellipsoid by up to about 0.3 percent, about 0.1 NM at 40 NM. Elevation is not projected.

Every leg keeps its full 132-character source record in `raw`, so any column that is not decoded is still there.

### What is not extracted, or only partly decoded

- SIDs, minimum sector altitudes, RNAV path points (LPV/GLS) and the localizer, RNAV (GPS) and RNAV (RNP)
  approaches (`approachesNotExtracted` lists their idents), and continuation records (the KATL STARs and ILS
  approaches have none).
- **Altitude description**: only the blank (at), `+`, `-` and `B` codes are interpreted. The glide slope codes (`H` on
  every ILS FAF, `J` on the first IF leg of each final) keep the raw code and both altitudes.
- **Waypoint description code**: only the final-approach-fix (`F`), initial-approach-fix (`A`) and missed-approach-point
  (`M`) markers are interpreted; the full four-character code is kept as `descriptionCode`.
- **RNP** (`rnpRaw`), localizer and glide slope position fields and the category flags are kept as raw strings.
- Theta, rho, course and distance are decoded for every leg by the generic layout, but their meaning on RF legs
  was not checked against the spec; only the arc radius, turn direction, RNP and centre fix are relied on there.
- Speed limit is the 3-digit value only; the speed limit description (column 118, for example `-` for at or below)
  is kept in `raw`.
- `npm test` regenerates the JSON from the raw CIFP and compares it byte for byte when `data/raw/FAACIFP18` (or
  `CIFP_PATH`) exists; CI has no raw file and runs the unit and data checks only.

### Facts in the data worth knowing

- The five parallel runways all have a magnetic bearing of 095 (east) or 275 (west), and the thresholds are 90.0
  degrees true. The designators 08/26 are therefore 15 degrees off the magnetic bearing, while 09/27 and 10/28 are
  within 5 degrees. This is in the FAA data, not a parsing error; a test records it.
- Each FAF altitude equals the height of a 3 degree glidepath at the FAF's distance from the threshold, to within
  6 ft (the test enforces this), which is an independent check on the FAF position, threshold elevation, glidepath and projection.

## Where S.E.A.N. lands things (`data/alternates-2611.json`, `src/places.js`)

`scripts/alternates.js` reads the same CIFP file as above and writes the airport reference point (position, name,
source record) for KATL, KPDK (DeKalb-Peachtree), KBHM (Birmingham-Shuttlesworth) and KLGC (LaGrange/Callaway), projected
as NM east and north of KATL with the same projection as `katl-2611.json`:

```
npm run data -- path/to/FAACIFP18 KATL          # KATL as before
node scripts/alternates.js path/to/FAACIFP18    # writes data/alternates-2611.json
```

KPDK is 15.7 NM at 024 degrees from KATL, KBHM 116.3 NM at 268, KLGC 49.7 NM at 221. The field outside LaGrange is
not in any FAA record. It is 2.5 NM from the KLGC reference point at 340 degrees; that offset is made up.
