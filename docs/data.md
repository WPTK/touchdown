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

Wake spacing, type, CWT and category drive the sim. `finalKt` and `descentFpm` ride along on each aircraft but don't move it. Every aircraft still flies the inner route at `innerSpeedKt`, with the wind taken out on final.

Wake minimums apply to consecutive pairs only, as the table does, and to pairs on one runway or on parallel runways under 2,500 ft apart (a single runway for wake, 5-5-4). The conflict probe (below) checks them on every release, from the moment both aircraft are established on the final course. At 160 kt, 5 NM is 112 s, so the largest wake minimum among these types is the binding one only on a heavy followed by a light type.

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

## How the sim flies the real airspace (`src/airspace.js`, `src/sim.js`, `src/separation.js`)

The sim draws its routes from `data/katl-2611.json` and types in nothing from memory. The flow table
(`src/weather.js`) says which runways are in use: west is 26R, 27L and 28, east is 8L, 9R and 10. The data names the
same runways `08L` and `09R`; `rwId()` pads the flow table's `8L` to match.

| Piece | Where it comes from |
|---|---|
| STARs a flow flies | Every STAR whose runway transitions name all three runways. GNDLF3 and JJEDI4 have no runway transitions; they count when the common route ends in a vector (FM) on the side of the field the traffic comes from. West: CHPPR1, GLAVN2, HOBTT3, JJEDI4, ONDRE1, OZZZI2. East: CHPPR1, GLAVN2, GNDLF3, ONDRE1, OZZZI2, SITTH3 |
| Entry | The first spot an enroute transition comes within 41 NM of the field (the corner posts are about 40.4 NM out). JJEDI4 and GNDLF3 end at the corner post, so those arrivals come in on the radial for the last 2 NM (a sim choice) |
| Hold fix | The first fix of the STAR's runway transition, or the first fix of a STAR that has none. 27 to 30 NM out. The holding pattern is a right-hand orbit of 0.85 NM radius, tangent to the inbound course (a sim choice; the data's hold records are not used) |
| Route to the runway | The runway transition, then the ILS transition that starts at the STAR's last fix, the intermediate fix, the FAF and the threshold. Where the STAR ends in an FM vector the aircraft flies straight to the nearest initial approach fix (a sim choice) |
| FAF | The `fixRole` FAF leg of each ILS, 5.2 to 5.5 NM from the threshold. This is the distance the 5-7-1 check uses (or 5 NM, whichever is closer) |
| Altitudes | 'At' and 'at or above' constraints on the legs. The FAF has an altitude and no constraint type; it is flown as 'at' (the glideslope intercept altitude). The threshold is the runway elevation plus the threshold crossing height |
| Final course | The first vertex after which the route stays on the runway centerline (within 0.06 NM). The pair rule below counts an aircraft as established from there |

Altitude profile. The head leaves the hold fix at 12,000 ft (`baseLevelFt`), the level HOBTT3 and SITTH3 publish at
their hold fix. From there it descends at 230 ft per NM, steeper where an 'at' altitude is otherwise out of reach,
never below an 'at or above' altitude still ahead, and from the FAF it flies the glidepath to the threshold. The
steepest case is OZZZI2: 'at 9,000' 2.9 NM past the hold fix is about 1,030 ft per NM, 2,800 fpm at 160 kt for 2.9 NM
(the design check allows 1,100). `checkDesign` refuses a config where the released aircraft does not stay 1,000 ft
under the stack while the stack steps down.

How separation is kept. Everything outside the hold fix stays on the level stack from before: one level per queued
aircraft, 1,000 ft apart, everyone stepping down together when the head leaves. Inside, the safe controller runs the
candidate's whole flight forward (3 s steps, the deterministic motion model, the wind at the time) against every
aircraft already released and releases it to the runway that gives no conflict, the least used first, then the
shortest. The probe adds 0.3 NM and 150 ft to the minima, and a wake minimum on a shared final. `separation.js` is
the single rule both the probe and the monitor use.

Parallel finals (5-9-6, 5-9-7, 5-9-8). Two aircraft established on adjacent finals of different runways are not held to
the 3 NM / 1,000 ft rule:

- 26R/27L (about 6,450 ft apart) and 8L/9R: simultaneous independent, no minimum between the finals.
- 27L/28 and 9R/10 (about 4,200 ft apart, under 4,300): the same, with PRM (`cfg.prm`, on by default). Without PRM the
  pair is dependent, with a 1.5 NM diagonal.
- Under 2,500 ft apart: one runway for wake and the general rule. KATL's active triples have no such pair.

Until both are established (the turn-on), and always on the same final, the general rule applies. The no-transgression
zone is not modelled.

Capacity. One aircraft leaves a hold fix per step-down: 1,000 ft at 520 fpm is 115 s, 31 an hour at most. Laps in the
hold and the probe's waits bring the sustained rate to about 25 an hour (23.6 to 27.2 over six seeds at overload). The
three runways do not raise it; the level stack is the limit. Demand above that waits upstream, so the oracle sweeps at
12, 24 and 45 an hour with 20 seeds each, west and east, all show zero violations. Nothing is capped.

Not covered. A go-around climbs out to the missed approach fix and back to its hold fix at the end of the queue. The probe
only watches released (inner) aircraft, so a go-around climbing through the stack, or across a final, is not checked
against them, and the aircraft is not released from the hold fix until it has climbed to the base level. The safe
controller does not fly go-arounds; S.E.A.N. does, and the monitor catches what comes of it.

## Speed rules the monitor checks (`src/monitor.js`)

- 5-7-1: no speed order inside the real FAF of the aircraft's own runway (or 5 NM, whichever is closer), none in a hold,
  none beyond what the aircraft flies.
- 5-7-3: an assigned speed on a turbojet is at least 210 kt, or 170 kt inside 20 flying miles of the runway. A turboprop
  or piston is 200 kt, or 150 kt inside 20. Distance is the distance left on the route, not the straight line. At or
  above 10,000 ft the floor is 250 kt. Blimps are exempt; the text has no paragraph for an airship. All 22 fleet types are
  turbojets, so the turboprop floor is checked by a planted aircraft in the tests. The altitude is the one on the order
  when it was issued. The research table gives 250 kt from FL280 to 10,000 ft for every type, so the sim does too.
- 14 CFR 91.117(a) and (c): 250 kt under 10,000 ft, and 200 kt in the airspace underlying a Class B area. The outline is
  the FAA's Class_Airspace layer for ATL (`scripts/classb.js` writes `data/classb-atl.json`: 15 areas, 260 vertices
  after a 0.1 NM simplification, in the same NM projection as the fixes). An aircraft is under a shelf when it is inside
  its outline and below the lowest floor there; a floor of 0 is the surface area, which is inside the Class B itself.
  The sim's `speedKt` is groundspeed on final, not indicated airspeed, so a strong wind moves the 200 kt line by about one
  wind component. S.E.A.N.'s own boost orders on final are judged by it too.

## The region: KCLT, ARTCC boundaries and which airports are where (`data/kclt-2611.json`, `data/artcc-2611.json`, `data/region-2611.json`)

`scripts/cifp.js` takes any airport ident, so the second hub is the same pipeline as KATL:

```
node scripts/cifp.js data/raw/FAACIFP18 KCLT      # writes data/kclt-2611.json
```

KATL regenerates byte for byte after the change (the one edit: a runway's true bearing is now taken modulo 360, which
only matters where magnetic bearing plus variation goes below zero, as at KCLT: 003 magnetic, 7 degrees west, is 356
true and not -4). KCLT has 6 runways, 6 ILS, 12 STARs and 206 fixes, 0 unresolved.

### ARTCC boundaries (`scripts/artcc.js`)

| | |
|---|---|
| File | `ARB.txt` inside `ARB.zip`, FAA NASR 28-day subscription, effective 2026-10-29 (the same cycle as the CIFP) |
| URL | <https://nfdc.faa.gov/webContent/28DaySub/2026-10-29/ARB.zip>, layout in `Layout_Data/arb_rf.txt` on the same path. The subscription page is <https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/2026-10-29>. `aeronav.faa.gov` does not host the NASR files; `nfdc.faa.gov` does, and a plain `curl` with a browser user agent works |
| Licence | US government work, public domain. Raw files stay in `data/raw/` (ignored) |
| Kept | ZTL, ZJX, ZME, ZDC and ZID, the high structure (`*H*`). The low structure is not carried |

Every segment of the five centres is a straight line to the next point (`TO`), and a shape closes at `TO POINT OF
BEGINNING`. Nothing is an arc or a circle, so nothing is approximated. Each of the five is one shape in the high structure (ZTL has 34 points). The five centres come to 191 points and 12 KB, so the boundaries are
not simplified: the file carries the FAA's own vertices, latitude and longitude plus the same NM projection as
`katl-2611.json` (east and north of the KATL airport reference point). That one frame is the regional frame.

### Which airports are inside which centre (`scripts/region.js`)

The hub class is the FAA's own, from the CY2025 commercial service enplanements workbook (`data/hubs-cy2025.json`: the
large, medium and small hubs, with the source URL). Each airport's position and longest runway are from its CIFP
airport reference record, and the centre is a point-in-polygon test against the ARB shapes.

Large hubs inside ZTL: **KATL and KCLT, and no others.** BNA is in ZME, TPA in ZJX, and RDU, IAD, DCA, BWI and PHL are in
ZDC. A third large airport does not fit, so the full arrival flows are KATL and KCLT. Small hubs inside ZTL (there is no medium hub), with
KPDK (a general aviation reliever, kept because Atlanta's alternates already use it): TYS, BHM, GSP, AVL, GSO, HSV, CHA.
`data/region-2611.json` lists every hub in the five centres with its centre.

```
node scripts/artcc.js data/raw/nasr-261029/arb/ARB.txt data/raw/FAACIFP18   # writes data/artcc-2611.json
node scripts/region.js data/raw/FAACIFP18                                   # writes data/region-2611.json
```

The ARB parser stops if a segment is not a plain straight line, so a later cycle with an arc cannot slip in as a chord. The
segments are straight in the KATL projection; the FAA draws them as lines on the ground, and at 600 NM from KATL the
difference could move an edge by a fraction of a mile, which matters only for an airport sitting on a boundary.

## A second hub: KCLT (`src/airports.js`)

`makeAirspace(data)` in `src/airspace.js` builds one airport's geometry from its CIFP file, and `createSim({ airport })`
flies it. KATL and KCLT are each their own sim on their own projection, so the oracle and the monitor are the same code at
both. Flows are derived from the data: ILS runways grouped by landing direction. KCLT gets `north` (01L, 01R, 36) and
`south` (18, 19L, 19R). Weather stays KATL-only. Class B for KCLT comes from `node scripts/classb.js CLT data/kclt-2611.json data/classb-clt.json`.

Base level. BANKR8 and PARQR7 say "at 12,000" 20 to 26 NM past their first fix, so a 12,000 ft base fails
`releasedClearsStack`. KCLT's base level is 13,000 ft (`config.baseLevelFt`). 14,000 also passes, 15,000 fails
`routesReachAltitudes`.

Capacity. The same level stack (1,000 ft per 115 s) would allow 31 an hour. KCLT lands **about 17 an hour sustained: 14.0
to 20.3 over 12 runs at overload (6 seeds, both flows), mean 16.9**, below KATL's 25. The routes are longer and arrivals wait on
the probe; I did not break the gap down further. The oracle sweeps at 12, 24 and 45 an hour, both flows, seeds 1
to 3 (`test/airports.test.js`), all with zero violations.

## Enroute traffic and handoffs (`src/enroute.js`)

Aircraft fly straight, level and at constant speed through ZTL at FL290 to FL410, on routes 660 NM long that cross a random
point inside ZTL's boundary. They never meet the TRACON sims (29,000 ft against a 14,000 ft stack top). Each time one crosses
a boundary between two of the five centres, `src/enroute.js` logs a handoff, and the line S.E.A.N. says is
"S.E.A.N. ZTL hands off to S.E.A.N. ZME". The controller hands off to itself.

Rules, from the local JO 7110.65 text, and only what it supports:

- 5-5-4 (ERAM): 5 NM lateral below FL600.
- 4-5-1: 1,000 ft vertical up to and including FL410. 2,000 ft between a non-RVSM aircraft and any other aircraft at or
  above FL290. The text names only "non-RVSM", so RVSM is the 1,000 ft default, and 4% of the traffic is non-RVSM and gets 2,000 ft.
  Above FL410 the rule is 2,000 ft; nothing here goes above FL410.
- 4-5-2, TBL 4-5-1: courses 0 to 179 use odd levels (FL290 to FL410), 180 to 359 even (FL300 to FL400), 2,000 ft apart. The
  table is in magnetic courses and the sim uses true; the few degrees of variation are not modelled.

The safe controller picks a level and a start only when the straight path is clear of everything flying, to 1 NM beyond the
minimum. That is exact, because nothing turns or climbs. S.E.A.N. picks any level and never looks. The monitor
(`observeEnroute`) counts a loss when both lateral and vertical limits are broken at once. The oracle: zero losses over
6 hours at 40, 80 and 120 an hour, 3 seeds each. S.E.A.N. at 120 an hour is caught by the same monitor.
Cost: 56 microseconds per simulated second at 60 an hour (87 airborne), 171 at 120 an hour (197 airborne).

## The regional scope (`src/view.js`, `src/frame.js`, `src/loss.js`)

The scope looks at a centre point in the regional frame and a range. Over 60 NM, or away from a hub, it draws the region:
the five boundaries, every hub in them (large hubs as squares, the rest as dots, names as you zoom), the 30 NM TRACON circle
around Atlanta and Charlotte, both sims' arrivals, and the enroute traffic with a 6 minute vector. At or under 60 NM and
within 30 NM of a hub it draws that hub's own TRACON scope. A hub sim runs in its own frame; `localToRegion` goes through
latitude and longitude, so Charlotte's aircraft are placed with the same projection the boundaries use. The page opens on
Atlanta at 50 NM. `?view=region`, `?view=clt` and `?loss` (plays the meme) are in the address bar for links and screenshots.

Charlotte's demand is 60% of the slider. Weather, the shutdown and the frequency are still Atlanta's. Charlotte has its own
S.E.A.N., and S.E.A.N. runs the enroute sky too, so its enroute losses show in the Region panel. Relieve S.E.A.N. never works there either.
