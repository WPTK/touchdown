# Touchdown deep rules brief: KATL / A80 terminal ATC (JO 7110.65BB Chg 3, AIM, CIFP AIRAC 2611)

## 0. Answer first, and how to read this

- Almost every number below is PRIMARY. I read it in the local copies of JO 7110.65BB Change 3, the AIM, and the FAA CIFP file (`FAACIFP18`). The CIFP file is in directory `cifp-261029`, which the task calls AIRAC 2611. The brief corrects the first-pass doc [`faa-rules.md`](faa-rules.md) (see the end of section 0).
- Three things matter most for the demonstrator:
  1. **ATL's close pairs are 1,000-1,050 ft apart.** Those pairs cannot use dependent, independent or PRM procedures. They are treated as a single runway for wake and departure rules.
  2. **The west-flow and east-flow arrival triples are not equal.** In each triple, the near pair is 6,450 ft apart and the far pair is about 4,200 ft apart. That far pair is below the 4,300 ft line that forces PRM (5-9-8).
  3. **ATL's STARs publish almost no speeds.** Only JJEDI4 and GNDLF3 carry speed values in CIFP. Altitude restrictions are sparse too, and the STARs end at ILS approach-transition fixes or at "fly heading" legs. Controllers do the rest by vector.
- Not settled by any source I could reach (all UNCONFIRMED):
  - (Cleared 2026-11-16, issue #7) The 7360.1K PDF URL is https://www.faa.gov/documentLibrary/media/Order/FAA_Order_JO_7360.1K_Aircraft_Type_Designators.pdf, from the FAA publications page; the local copy is that file. faa.gov serves fetches that send a browser user agent. Notice JO 7360.7 (2025-10-14) changes 7360.1 and has not been read yet.
  - ATL's PRM or simultaneous-approach authorization.
  - TBFM and ZTL/A80 LOA specifics.
  - Pilot response-delay numbers. The AIM has none.
  - The ARINC 424 meaning of the J/H altitude codes and of a blank speed-description field.

### Status key and file map

The FAA files sit outside the repo in a local `touchdown-data` folder. Sources and download URLs are in [`faa-rules.md`](faa-rules.md).

- **PRIMARY:** read in the local FAA files.
- **SECONDARY:** read on a non-FAA host, or in a search snippet of an FAA document.
- **UNCONFIRMED:** inferred, or not retrievable.
- **ATC** = `touchdown-data\faa\atc\` (`chapN_section_M.txt`; `.html` originals sit alongside).
- **AIM** = `touchdown-data\faa\aim\`.
- **CIFP** = `touchdown-data\cifp-261029\x\FAACIFP18`.
- Citations read "ATC 5-9-6" = paragraph 5-9-6 in `atc\chap5_section_9.txt`.

Text-extraction caveats:
- Subparagraph letters are stripped from the `.txt` files. I use item order, or letters recovered from the HTML list ids (5-5-4 runs a-j).
- Inside 5-5-4 the order text cites "TBL 5-5-1" and "TBL 5-5-2", but the captions are TBL 5-5-3 and TBL 5-5-4. The 2.5 NM paragraph says "TBL 5-5-2"; I read that as the on-approach table. That is an inference.

Corrections to the first-pass doc:
- EFC wording is now PRIMARY (ATC 4-6-1).
- The CWT matrices are recovered (section 2).
- The 5-5-5 vacated-altitude rule is quoted exactly.
- The "5 NM from runway" speed rule is confirmed (ATC 5-7-1).
- The 3-degree glidepath is confirmed (AIM 1-1-9, line 326).
- Mirror-sourced items are now PRIMARY.

---

## 1. Radar separation

| Item | Rule (exact) | Cite | Status |
|---|---|---|---|
| Single-sensor ASR/DTAS | <40 NM from antenna: 3 NM. >=40 NM: 5 NM. Single-sensor monopulse SSR, <60 NM: 3 NM. | ATC 5-5-4 (terminal, first item) | PRIMARY |
| FUSION | Fusion target symbol: 3 NM. ISR shown in data block: 5 NM. | ATC 5-5-4 | PRIMARY |
| STARS multi-sensor mode | 5 NM | ATC 5-5-4 | PRIMARY |
| 2.5 NM on final | Aircraft established on the final approach course, within 10 NM of the landing runway, in FUSION (or single-sensor slant range if within 40 NM of the antenna). Requires all of the following. (a) Wake separation per the TBL. (b) Average runway occupancy time of 50 s or less, documented. (c) CTRDs operational. (d) Turnoff points visible from the tower. | ATC 5-5-4 (last items); ref JO 7210.3 10-4-14 | PRIMARY |
| NOWGT in data block | 10 NM behind the preceding aircraft and 10 NM to the succeeding aircraft | ATC 5-5-4 | PRIMARY |
| Unexpected ISR | Transition from 3 to 5 NM "or establish some other form" as soon as feasible. Do not terminate a stabilized approach. | ATC 5-5-4 note | PRIMARY |
| Target separation | Centers of digital targets; targets must not touch. | ATC 5-5-2 | PRIMARY |
| Vertical minima | 1,000 ft up to and including FL410; 2,000 ft at or above FL290 for non-RVSM. | ATC 4-5-1 | PRIMARY |

**Vacated-altitude rule (ATC 5-5-5b), exact text:**
> "Assign an altitude to an aircraft after the aircraft previously at that altitude has been issued a climb/descent clearance and is observed (valid Mode C), or reports leaving the altitude."

- The note says the 4-5-1 minima "might not always be maintained" under this method, but the aircraft "must have already vacated the altitude".
- 5-5-5a allows assigned altitudes with valid Mode C monitored.
- 5-5-6: do not use Mode C vertical separation with cruise clearance or contact approach aircraft.
- Status: PRIMARY.

**Departure and arrival separation:**
- 5-8-4: a departure from the same runway or an adjacent one needs 2 miles from an arrival on final, if separation will increase to 3 miles (5 miles at 40 NM or more) within 1 minute after takeoff. PRIMARY.

**Modeling inference (not a source statement):** a terminal simulator should select its minimum by sensor mode, defaulting to 3 NM in FUSION.

---

## 2. Consolidated wake turbulence (CWT)

### 2.1 Category definitions A-I

- The local 7110.65 files **do not define A-I.** They point to JO 7360.1 for the aircraft-to-category mapping (ATC 3-9-6 note covers SRS categories only).
- A secondary search of the FAA's JO 7110.126A/B appendix and FAA notices gives the table below. The FAA record shows 7110.126B was cancelled 2026-01-22 and folded into 7110.65.
- The FAA "Explanation of Changes" page states the 7110.126 contents were incorporated into 7110.65.
- The wingspan and weight limits for C through F were **not** retrieved.

| Cat | Description from search snippets | Status |
|---|---|---|
| A | A388 and A225 (super) | SECONDARY |
| B | Pairwise upper heavy | SECONDARY |
| C | Pairwise lower heavy | SECONDARY |
| D | Non-pairwise heavy (heavy not in B or C) | SECONDARY |
| E | B757 | SECONDARY |
| F | Upper large, excluding B757 | SECONDARY |
| G | Lower large | SECONDARY |
| H | Upper small, MTOW above 15,400 lb up to 41,000 lb | SECONDARY |
| I | Lower small, 15,400 lb or less | SECONDARY |

Sources:
- [FAA JO 7110.126A, Appendix A](https://www.faa.gov/documentLibrary/media/Order/JO_7110.126A_Consolidated_Wake_Turbulence_Separation_Standard_FINAL_SIGNED_508.pdf)
- [JO 7110.126B record (cancelled)](https://employees.faa.gov/tools_resources/orders_notices/index.cfm/go/document.information/documentID/1040468)
- [FAA Explanation of Changes](https://www.faa.gov/air_traffic/publications/atpubs/ATC_html/chap0_info_eoc.html)
- The mapping of each aircraft type to a letter is in JO 7360.1 (section 9).

### 2.2 Terminal wake application (ATC 5-5-4, wake turbulence application)

Separate by the table when the follower is:
- Following an aircraft conducting an instrument approach and/or operating within 2,500 ft and less than 1,000 ft below the flight path of a Cat A, B, C or D aircraft.
- Following a Cat E aircraft within 2,500 ft and/or less than 500 ft below.

Further rules:
- Departing parallel runways under 2,500 ft apart: the 2,500 ft requirement is waived for a Cat I behind a Cat E. Issue a cautionary advisory and give instructions that keep the Cat I from passing behind the Cat E. The 5-8-3 application satisfies this.
- Runways under 700 ft apart count as a single runway.
- On approach (5-5-4 h): minima must exist when the preceding aircraft is over the landing threshold.
- On approach: parallel runways under 2,500 ft apart count as a single runway.

All of the above is PRIMARY.

### 2.3 TBL 5-5-3, directly behind (PRIMARY)

Cells are NM. A dash means no wake minimum beyond radar separation. Rows are the leader; columns are the follower.

Reading: read the **row** for the leader, then the **column** for the follower. Example: leader B, follower H = 5 NM.

| Lead \ Follow | A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|---|
| A | - | 5 | 6 | 6 | 7 | 7 | 7 | 8 | 8 |
| B | - | 3 | 4 | 4 | 5 | 5 | 5 | 5 | 5 |
| C | - | - | - | - | 3.5 | 3.5 | 3.5 | 5 | 5 |
| D | - | 3 | 4 | 4 | 5 | 5 | 5 | 5 | 5 |
| E | - | - | - | - | - | - | - | - | 4 |
| F | - | - | - | - | - | - | - | - | - |
| G | - | - | - | - | - | - | - | - | - |
| H | - | - | - | - | - | - | - | - | - |
| I | - | - | - | - | - | - | - | - | - |

### 2.4 TBL 5-5-4, on approach (PRIMARY)

| Lead \ Follow | A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|---|
| A | - | 5 | 6 | 6 | 7 | 7 | 7 | 8 | 8 |
| B | - | 3 | 4 | 4 | 5 | 5 | 5 | 5 | **6** |
| C | - | - | - | - | 3.5 | 3.5 | 3.5 | 5 | **6** |
| D | - | 3 | 4 | 4 | 5 | 5 | 5 | **6** | **6** |
| E | - | - | - | - | - | - | - | - | 4 |
| F | - | - | - | - | - | - | - | - | **4** |
| G, H, I | - | - | - | - | - | - | - | - | - |

Bold cells are the differences from the directly-behind table.

Uncertain cells: none. I confirmed the blank cells from the `entry__N` cells of `chap5_section_5.html`, because the flattened text lost them. Source files: `atc\chap5_section_5.txt` lines 291-625 and `.html`.

### 2.5 Departure wake intervals (time, from the start of the preceding aircraft's takeoff roll)

| Situation | A leader | B or D leader | C leader (E-I follower) | Special | Cite |
|---|---|---|---|---|---|
| Same runway, or parallel <2,500 ft, same direction | 3 min | 2 min | 2 min | I behind E: 2 min only if the runway is the same or parallel <700 ft, or flight paths cross | ATC 3-9-6 |
| Parallel >=2,500 ft, paths crossing | 3 | 2 | 2 | I behind E: 2 | ATC 3-9-6 |
| Displaced threshold, paths crossing | 3 | 2 | 2 | I behind E: 2 | ATC 3-9-6 |
| Opposite direction, same or parallel <2,500 ft | 4 | 3 | 3 | I behind E: 3 | ATC 3-9-6 |
| I behind F or G, opposite direction, same runway | n/a | n/a | n/a | 3 min, unless the pilot initiated the waiver request | ATC 3-9-6 |
| Intersection departure, same runway or parallel <2,500 ft | 4 | 3 | 3 | I behind E, F, G or H: 3 | ATC 3-9-7 |
| Intersecting runway, paths crossing | 3 | 2 | 2 | I behind E: 2 | ATC 3-9-8 |
| Converging runway, paths crossing | 3 | 2 | 2 | I behind E: 2 | ATC 3-9-9 |
| Arrival behind departure, crossing runway, will cross the airborne path | 3 | 2 | 2 | I behind E: 2 | ATC 3-10-4 |

All rows are PRIMARY. The "B, C, D, E, F, G, H or I behind A" form applies to every follower category.

Waiver rules:
- 3-9-6: "Do not approve pilot requests to deviate from the required intervals" (same-runway and parallel).
- 3-9-7 b: pilot-initiated waiver allowed; a takeoff request is not a waiver request.
- 3-9-8 and 3-9-9: deviation not approved if the preceding aircraft requires wake separation.

Other points:
- Phraseology: "HOLD FOR WAKE TURBULENCE" (3-9-6, 3-9-7). The controller informs the pilot when a hold is needed.
- Super and heavy rolling takeoffs are not approved (3-9-6).
- A small aircraft is not cleared to line up and wait behind a departing super or heavy (3-9-6).
- Radar substitute: the 5-5-4 g minima may replace the time intervals if the radar separation exists at or before airborne (3-9-6).

Wake cautionary advisories for same or parallel (<2,500 ft) runways (ATC 3-10-3):
- B-I behind A, B or D.
- E-I behind C.
- I behind E.
- Content: wake advisory plus position, altitude and direction. Example: "Runway two seven left cleared to land, caution wake turbulence, heavy Boeing 747 departing runway two seven right."

### 2.6 Parallel-runway wake rules

- <2,500 ft: single runway for wake (5-5-4 notes).
- <700 ft: single runway for departure wake (5-5-4).
- SOIA, ATC 5-9-9: for runways >=2,500 ft apart, no wake requirement between adjacent finals. Under 2,500 ft, wake spacing between adjacent finals is waived when the ceiling is 500 ft or more above MVA; below that, 5-5-4 wake spacing applies. Status: PRIMARY.
- ATL application: the 1,000-1,050 ft pairs are both under 2,500 ft, so they are single-runway for wake. The 4,200, 4,400 and 6,450 ft pairs have no wake coupling.

---

## 3. Parallel approaches, applied to KATL

### 3.1 Rules (PRIMARY, ATC chap5_section_9.txt)

**5-9-6, dependent:**
- During turn-on: 1,000 ft vertical or 3 NM radar.
- Diagonal separation on adjacent finals:
  - 1.0 NM when centerlines are 2,500-3,600 ft apart.
  - 1.5 NM when 3,600-8,300 ft apart.
  - 2.0 NM when 8,300-9,000 ft apart.
- Required conditions:
  - Charts must authorize it.
  - Apply only once established.
  - Straight-in landings.
  - Missed approaches do not conflict.
  - Aircraft are told both approaches are in use (ATIS is acceptable).
  - Approach control needs an interphone to the local controller.
- EoR is not authorized with dependent approaches.

**5-9-7, simultaneous independent (dual and triple):**
- During turn-on: 1,000 ft vertical or 3 NM.
- Dual: centerlines >=3,600 ft. Or >=3,000 ft with a 2.5-3.0 degree offset to either runway.
- Triple: >=3,900 ft; or >=3,000 ft with offsets to both outside runways; or >=3,000 ft with a single offset plus 3,900 ft on the remaining pair.
- Field elevation above 2,000 ft MSL requires FMA.
- High update rate (HUR, 1.2 s or faster, fusion display):
  - Dual: >=3,100 ft, or >=2,500 ft with offset.
  - Triple: >=3,100 ft, or >=2,500 ft with offsets (variants as in the dual case).
  - Aircraft without functioning ADS-B Out are excluded.
- NOZ is 700 ft constant where RCLS <=3,400 ft. NTZ is 2,000 ft constant where RCLS >=3,400 ft.
- Monitor display required (4:1 aspect ratio, visual and aural alerts, update 4.8 s or faster, FMA):
  - Dual: centerlines 2,500 to under 4,300 ft.
  - Triple: 2,500 to under 5,000 ft.
  - At or below 2,000 ft elevation, FMA is not required at 4,300 ft or more (dual) or 5,000 ft or more (triple).
- Other conditions:
  - Straight-in.
  - Equipment operating normally.
  - Charts authorize it.
  - Aircraft told simultaneous independent approaches are in use (PRM when centerlines are under 4,300 ft) before leaving an outer fix.
  - Descend to the GS intercept altitude early enough for level flight, with at least 1 NM straight flight before final intercept (not for RF legs).
  - Altitudes differ by at least 1,000 ft during turn-on (note).
  - Communications transfer to the tower must be complete before losing 1,000 ft or 3 NM.
- Final monitor controllers:
  - Separate monitor controllers, each with transmit/receive and override on the local frequency (the PRM monitor also has a transmit-only secondary PRM frequency).
  - Monitor all approaches regardless of weather.
  - Monitoring ends when visual separation is applied, the runway or lights are reported in sight, or the aircraft is 1 mile or less from the threshold, if procedurally required.
  - Do not announce the end of monitoring.

Breakout phraseology:
- "(Call sign) I SHOW YOU (left/right) OF THE FINAL APPROACH COURSE."
- "YOU HAVE CROSSED THE FINAL APPROACH COURSE. TURN (left/right) IMMEDIATELY AND RETURN TO THE FINAL APPROACH COURSE" (or "TURN (left/right) AND RETURN TO THE FINAL APPROACH COURSE").
- "TRAFFIC ALERT, (call sign), TURN (right/left) IMMEDIATELY HEADING (degrees), CLIMB/DESCEND AND MAINTAIN (altitude)." This goes to the aircraft on the adjacent final. For PRM, a descent is used only if no other option exists, and never below the MVA.

**5-9-8, PRM:**
- Must be charted in the approach title.
- PRM approaches **must be assigned** for dual or triple parallels with centerlines under 4,300 ft.

**5-9-9, SOIA:**
- Needs an AJT-1 authorization.
- Centerlines at least 750 ft and under 3,000 ft apart, with one final offset 2.5-3.0 degrees.
- Wake rules as in section 2.6.
- The offset-MAP visual segment is the pilot's responsibility.

**5-9-10, widely spaced:**
- Centerlines over 9,000 ft (field elevation 5,000 ft or lower).
- Needs separate final and local controllers per final.
- No NTZ.

**5-9-11, transitional:**
- On a go-around or termination, issue instructions to restore approved separation, plus a wake cautionary advisory.

### 3.2 Intercept, gate and vector rules

- **5-9-1:**
  - Vector to intercept at least 2 NM outside the approach gate.
  - Exception: with ceiling at least 500 ft above MVA and visibility at least 3 miles, intercept may be closer than 2 NM outside the gate but no closer than the gate.
  - On pilot request, as close as the FAF.
  - 1,000 ft vertical on opposite base legs.
  - For a precision approach, at an altitude not above the glideslope and not below the minimum GS intercept altitude.
- **5-9-2, TBL 5-9-1, maximum intercept angle:**
  - Intercept point under 2 miles from the gate, or triple simultaneous: 20 degrees.
  - 2 miles or more: 30 degrees (45 for helicopters).
- **Approach gate definition:**
  - Not in the local files. Search results give "1 NM from the FAF on the side away from the airport, and no closer than 5 NM from the landing threshold". Status: SECONDARY.
  - Sources: [AvWeb "Vectors to Final"](https://avweb.com/features_old/vectors-to-final/) and [123ATC glossary](https://123atc.com/term/approach-gate).
  - One of those snippets also says 20 degrees before the gate. That conflicts with local TBL 5-9-1; the local text prevails.
- **5-9-3:** tell the pilot of vectors across final. Phraseology: "EXPECT VECTORS ACROSS FINAL FOR (purpose)."
- **5-9-4:** before the gate, issue position relative to a fix, the vector, the approach clearance, and the tower frequency change. Clear the approach only after the aircraft is established on a segment of a published route or approach, or assign an altitude to maintain until established.
- **5-9-5:** the radar controller is responsible for separation unless visual separation, an LOA or a facility directive says otherwise.

### 3.3 Centerline spacing at KATL (computed from CIFP)

Method:
- CIFP records "KATLK7G" give each threshold latitude and longitude.
- Same-runway end pairs match in latitude to within 0.05 arcsec (for example 8L at 33:38:58.32 and 26R at 33:38:58.35). So the true heading is about 090.0.
- Spacing is therefore the latitude difference in arcseconds times about 101.1 ft per arcsec (WGS-84, at about 33.6 N). Accuracy is a few feet.
- Status: PRIMARY inputs, my computation.

Threshold data (CIFP lines 126783-126792):

| Rwy | Length ft | Threshold elev ft | TCH ft | Latitude (N) |
|---|---|---|---|---|
| 08L | 9,000 | 1,015 | 50 | 33:38:58.32 |
| 08R | 9,999 | 1,024 | 53 | 33:38:48.43 |
| 09L | 12,390 | 1,019 | 56 | 33:38:04.94 |
| 09R | 9,000 | 1,026 | 55 | 33:37:54.53 |
| 10 | 9,000 | 1,000 | 55 | 33:37:12.98 |
| 26L | 9,999 | 995 | 52 | 33:38:48.46 |
| 26R | 9,000 | 990 | 55 | 33:38:58.35 |
| 27L | 9,000 | 985 | 58 | 33:37:54.56 |
| 27R | 12,390 | 978 | 56 | 33:38:04.93 |
| 28 | 9,000 | 998 | 57 | 33:37:13.03 |

- All runways are 150 ft wide. Magnetic bearing is 095.0 (08/09/10) or 275.0 (26/27/28).
- 27R's record decodes to a 500 ft displaced threshold; this is UNCONFIRMED (field-position inference).

| Pair (east | west) | Spacing ft | Rule outcome |
|---|---|---|---|
| 8L-8R | 26R-26L | about 1,000 | Under 2,500 ft: not eligible for dependent (5-9-6, minimum 2,500). Not independent. SOIA is possible only with an offset (none in CIFP, see below). Single runway for wake. |
| 9L-9R | 27R-27L | about 1,050 | Same as above. |
| 8R-9L | 26L-27R | about 4,400 | Departure pair. 5-8-3: simultaneous same-direction takeoffs need centerlines of at least 2,500 ft and 15 degree divergence (10 degrees if both fly RNAV SIDs). |
| 9R-10 | 27L-28 | about 4,200 | Between 3,600 and 4,300 ft. Dependent: 1.5 NM diagonal (5-9-6). Independent: only with the 5-9-7 monitor display (FMA) and PRM. 5-9-8 requires PRM under 4,300 ft. Also above the 3,100 ft HUR minimum. |
| 8L-9R | 26R-27L | about 6,450 | 3,600-8,300 ft: dependent 1.5 NM diagonal. Independent at 3,600 ft or more; the 4,300 ft FMA exemption applies (elevation under 2,000 ft). Charts must authorize it. |
| 8L-10 | 26R-28 | about 10,650 | Over 9,000 ft: widely spaced (5-9-10), no NTZ, no monitors. |

Triple combinations:
- West-flow arrivals 26R/27L/28 and east-flow arrivals 8L/9R/10.
- Triple needs at least 3,900 ft (or HUR 3,100 ft) between each pair, so both triples pass on spacing.
- Spacing under 5,000 ft (the 4,200 ft pair) requires FMA, and PRM is required under 4,300 ft.
- The TBL 5-9-1 20-degree intercept limit applies for triple simultaneous.

Final-approach facts:
- All ILS final courses are 095.0 or 275.0, parallel. There is no 2.5-3.0 degree offset, so SOIA does not apply at ATL (inference from CIFP).
- Missed approaches (section 7.3) differ by runway, but the "do not conflict" finding belongs to the FAA. UNCONFIRMED.
- Whether ATL's charts are PRM or simultaneous-approach authorized: **UNCONFIRMED.** CIFP carries one generic ILS record per runway and no PRM-titled approaches. I did not retrieve the FAA ATL approach plates.
- The CIFP records' trailing "NS" / "DS" / "PS" two-letter flags (for example 9L, 9R and 27R carry "DS") are undecoded. UNCONFIRMED.

**Arrival and departure on adjacent runways at 1,000-1,050 ft:**
- 5-8-5 allows simultaneous operations only if the departure diverges at least 30 degrees from the missed-approach course and the thresholds are staggered. The stagger needed is 500 ft per 100 ft below 2,500 ft, which is about 7,000-7,500 ft at ATL spacing. ATL's real stagger (about 200 ft on 8L/8R, about 2,900 ft on 27R/27L) does not meet that.
- So the 2-mile 5-8-4 rule and the 3-9 and 3-10 tower rules are the primary tools. Inference: this is analysis of the text, not an FAA statement about ATL.

---

## 4. Same runway, interleave, go-arounds

### 4.1 Arrival behind arrival or departure (ATC 3-10-3), all PRIMARY

The arrival must not cross the threshold until one of the following:
- The other aircraft has landed and is clear of the runway.
- By day, with distance landmarks, the other aircraft has landed and the minimum distance from the threshold exists: Cat I behind I or II, 3,000 ft; Cat II behind I or II, 4,500 ft.
- The other aircraft has departed and crossed the runway end. With landmarks and airborne: Cat I behind I or II, 3,000 ft; Cat II behind I or II, 4,500 ft; either aircraft Cat III, 6,000 ft.

Helicopters and powered-lift: visual separation may replace distance.

SRS categories (ATC 3-9-6 note, defined in JO 7360.1):
- Cat I: small single-engine prop, 12,500 lb or less, and all helicopters.
- Cat II: small twin-engine prop, 12,500 lb or less.
- Cat III: all others.
- These are **not** the CWT letters.

### 4.2 Departure behind departure or arrival (ATC 3-9-6), PRIMARY

- The other aircraft has departed and crossed the runway end, or turned to avert any conflict.
- If the controller can determine distances by landmarks, the other aircraft needs only be airborne, with minimum distances: Cat I only, 3,000 ft; Cat I behind II, 3,000 ft; succeeding or both Cat II, 4,500 ft; either Cat III, 6,000 ft.
- A preceding landing aircraft is clear of the runway.
- 3-9-5 and 3-10-6, anticipating separation: clearance need not be withheld if separation will exist at takeoff roll or threshold crossing.
- 3-10-6: anticipating separation must not be applied during line-up-and-wait, except as 3-10-5 allows.

### 4.3 Landing clearance

- Phraseology: "RUNWAY (number) CLEARED TO LAND" (ATC 3-10-5).
- Runway change: "CHANGE TO RUNWAY (number), RUNWAY (number) CLEARED TO LAND."
- Not observed: "NOT IN SIGHT, RUNWAY (number) CLEARED TO LAND" (3-10-7).
- Takeoff: runway number first, then the clearance (3-9-10).
- Landing-to-landing traffic phraseology (3-8-1):
  - "NUMBER (n), FOLLOW (traffic)."
  - "TRAFFIC (description) LANDING THE PARALLEL RUNWAY."
  - "GO AROUND (additional instructions)."

### 4.4 Go-around and missed approach

- 3-8-1 phraseology: "GO AROUND (additional instructions as necessary)."
- 4-8-9: an approach clearance automatically authorizes the published missed approach.
- After a missed approach starts, the aircraft may be vectored at or above MVA/MIA, or under 5-6-3.
- ATC assumes terrain and obstacle responsibility when it vectors a go-around (5-6-3 note).
- Low approach: not below 500 ft above the airport, and not over a holding or departing aircraft (3-10-10). Phraseology: "CLEARED LOW APPROACH AT OR ABOVE (altitude). TRAFFIC (description and location)."
- Wake after a missed approach: 5-8-5 note, and 3-9-6 / 3-9-8 intervals.
- 5-9-11: restore approved separation if one aircraft in a reduced-separation pair goes around.

---

## 5. Vectoring and approach

### 5.1 Vectoring (ATC 5-6, PRIMARY)

- 5-6-1: vector at or above MVA/MIA, except for radar approaches, radar departures and similar.
- 5-6-2 methods:
  - "TURN LEFT/RIGHT HEADING (degrees)."
  - "FLY HEADING (degrees)."
  - "FLY PRESENT HEADING."
  - "DEPART (fix) HEADING (degrees)."
  - "TURN (n) DEGREES LEFT/RIGHT."
- 5-6-2: advise the purpose of a vector ("VECTOR FOR SPACING", "VECTOR TO FINAL APPROACH COURSE").
- 5-6-2: assign an altitude, and a speed if needed, with a vector off an assigned procedure that carries restrictions.
- 5-6-2 note: after a vector or deviation off a STAR, **all published altitude and speed restrictions are canceled**. The pilot's FMS may level off at the selected altitude.
- 5-6-2: resume phraseology: "EXPECT TO RESUME (STAR)", and "CLEARED DIRECT (fix) CROSS (fix) AT (altitude), then DESCEND VIA (STAR)".
- 5-6-3 (vectors below minimum altitude, as facility directives describe):
  - Path 3 miles or more from the obstacle, climbing to 1,000 ft above it: maintain at least 3 miles.
  - Path under 3 miles: increase lateral separation until 3 miles.
  - Alternatively, if no prominent obstacles are within 10 NM of the DER and the aircraft can climb uninterrupted to MVA within 10 NM.

### 5.2 Approach clearance (ATC 4-8-1)

- When a STAR and an approach connect at an IAF or IF, clear the aircraft **at least 3 NM before** the IAF/IF and name the connection fix (4-8-1).
- Radar may clear an aircraft to any fix 3 NM or more before the FAF at an intercept angle not above 30 degrees.
- "CLEARED (ILS/LDA) APPROACH, GLIDESLOPE UNUSABLE" when the GS is out.
- Cold-temperature compensation requests must not be disapproved; the controller may delay the clearance.

### 5.3 Glidepath (AIM 1-1-9, PRIMARY)

- The glide path projection angle is "normally adjusted to 3 degrees above horizontal so that it intersects the MM at about 200 feet and the OM at about 1,400 feet above the runway elevation". The GS is normally usable to 10 NM (AIM 1-1-9, line 326).
- tan(3 degrees) x 6,076 ft is about 318 ft/NM. That is my derivation.
- CIFP stores -3.00 degrees at every ATL runway threshold record. See section 7.3 for the CIFP altitude check: at the FAF, (FAF altitude minus altitude over threshold) divided by the FAF-to-threshold distance gives 316-324 ft/NM.

### 5.4 Speed control (ATC 5-7, PRIMARY)

| Rule | Numbers | Cite |
|---|---|---|
| Increments | IAS in 5-knot steps. Mach in 0.01 steps at or above FL240. | 5-7-1 |
| Pilot tolerance | Plus or minus 10 knots, or 0.02 Mach | 5-7-1 note |
| No speed assignments | At or above FL390 without consent; published high-altitude approach; holding; **inside the FAF or 5 miles from the runway, whichever is closer** | 5-7-1 |
| Clearance effects | Approach or descend-via clearance cancels assigned speeds. Restate if needed. Last published STAR speed is kept until ATC deletes it, assigns one, vectors, gives direct, or clears the approach. | 5-7-1 |
| Vector off a STAR | Cancels published speeds. Assign a speed with the vector if needed. | 5-7-1 note |
| FL280 to 10,000 ft | Not less than 250 kt or equivalent Mach | 5-7-3 |
| Beneath Class B | Not more than 200 kt | 5-7-3 |
| Arrivals below 10,000 ft | Turbojet: not less than 210 kt, or 170 kt inside 20 flying miles of the threshold. Recip and turboprop: 200 kt, or 150 kt inside 20 miles. | 5-7-3 |
| Departures | Turbojet not less than 230 kt. Recip and turboprop 150 kt. Helicopter 60 kt. | 5-7-3 |
| Lower speeds | May be assigned when operationally advantageous | 5-7-3 |
| Compression | Reduce the trailing aircraft first, or increase the leader first. | 5-7-1 |
| Sequencing phrases | MAINTAIN MAXIMUM FORWARD SPEED, MAINTAIN SLOWEST PRACTICAL SPEED, MAINTAIN (speed) KNOTS OR GREATER, DO NOT EXCEED (speed) KNOTS, REDUCE SPEED TO (speed), RESUME NORMAL SPEED, RESUME PUBLISHED SPEED, COMPLY WITH SPEED RESTRICTIONS, DELETE SPEED RESTRICTIONS | 5-7-2, 5-7-4 |
| Speed vs descent | Specify which comes first ("REDUCE SPEED TO ... THEN, DESCEND AND MAINTAIN ..."). Level off to slow before descending under 10,000 ft. | 5-7-2 |
| Combined fix restriction | "CROSS (fix) AT AND MAINTAIN (altitude) AT (speed) KNOTS" | 5-7-2 |
| FL390 and above | "(Speed adjustment), IF UNABLE ADVISE." | 5-7-2 |
| Pilot response | Pilots may refuse an adjustment they consider excessive. | 5-7-1 note |
| Controller expectation | Pilots begin changing speed at the minimum distance needed to cross the fix at the published speed. | 5-7-1 |

Also from 5-7-2: aircraft at or above 10,000 ft on an assigned speed above 250 kt must comply with 91.117(a) below 10,000 ft without notifying ATC.

### 5.5 Holding

**ATC 4-6 (PRIMARY):**
- 4-6-1: issue the clearance limit, holding instructions and an EFC (leave the EFC out when no delay is expected).
- 4-6-1, if the charted pattern is on the route, only the direction plus "AS PUBLISHED" is needed.
- 4-6-1: issue these items at least 5 minutes before the aircraft is estimated to reach the limit. If under 5 minutes away, issue immediately.
- 4-6-1: the AIM says pilots start speed reduction at 3 minutes or less from the fix.

**Exact EFC and delay phraseology (ATC 4-6-1):**
- "CLEARED TO (fix), HOLD (direction), AS PUBLISHED," or "CLEARED TO (fix), NO DELAY EXPECTED."
- "EXPECT FURTHER CLEARANCE (time)," plus if required, "ANTICIPATE ADDITIONAL (time) MINUTE/HOUR DELAY AT (fix)", or "...EN ROUTE DELAY", or "...TERMINAL DELAY."
- "DELAY INDEFINITE, (reason if known), EXPECT FURTHER CLEARANCE (time)."
- Example: "Cleared to ASTON, hold west on Victor two twenty-five, seven mile leg, left turns, expect further clearance one niner two zero, anticipate additional one five minute terminal delay."
- Delay indefinite is used when the time and reason cannot be determined.

**Other 4-6 rules:**
- 4-6-3: delays: advise the supervisor or flow controller. At 30-minute delays, the first controller of the receiving facility issues total delay information. Phraseology: "(Airport) ARRIVAL DELAYS (time)." ATIS may carry it.
- 4-6-4: instruction items: direction, fix, radial/course/route, leg length (miles if DME or RNAV), turn direction (only left, or on request).
- 4-6-4 phraseology: "HOLD (direction) OF (fix) ON (radial...)", "(n) MINUTE/MILE LEG", "LEFT/RIGHT TURNS", "MAXIMUM HOLDING AIRSPEED IS (n) KNOTS."

**AIM 5-3-8 (PRIMARY):**
- Maximum holding airspeeds (KIAS): MHA to 6,000 ft, 200; 6,001-14,000 ft, 230; 14,001 ft and above, 265.
- Exceptions: 210 KIAS from 6,001-14,000 ft where depicted; USAF fields 310; Navy fields 230.
- Inbound leg: 1 minute at or below 14,000 ft, 1.5 minutes above.
- Entries: parallel, teardrop, direct.
- Pilots start speed reduction at 3 minutes or less from the clearance limit.
- Without instructions, pilots ask ATC. If they cannot reach ATC, they enter a standard pattern on the course of approach.
- Pilots report reaching and leaving the fix.
- Holding fixes in KATL CIFP: the HM holds in the missed approaches (section 7.3).

---

## 6. Transfer of control and communications

### 6.1 Rules (ATC, PRIMARY)

- **2-1-14:** before a control instruction that changes heading, route, speed or altitude, coordinate with all affected controllers unless an LOA or directive says otherwise.
- **2-1-15:** transfer control at a prescribed location, time, fix or altitude, or on completion of a handoff plus a frequency change under an LOA or directive. Do not transfer control until conflicts with aircraft you separate are cleared. Assume control only after the aircraft enters your area unless coordinated.
- **2-1-17:** transfer radio communications before the aircraft enters the receiving area. Include the facility name (omit it inside your own facility). Name the frequency, and the time, fix or altitude to call. Examples: "Contact Los Angeles Center, One Two Three Point Four", "Contact Departure."
- **5-4-2:** definitions.
  - Handoff = radar identification plus radio.
  - Point-out = radar identification only, no radio transfer.
  - "Radar contact," "Point out approved," "Traffic observed."
- **5-4-3:** methods: physically point, landline, or automation. Pass the handoff in the order: position, aircraft ID, altitude and restrictions, and pertinent info.
- **5-4-5, transferring controller:** complete the handoff before the aircraft enters the receiving airspace. Get verbal approval before changing path, altitude or speed once the handoff is under way. Brief assigned heading, airspeed restrictions, altitude, observed deviation, non-standard beacon code, monitoring. Resolve conflicts before transferring communications.
- **5-4-6, receiving controller:** verify position and association. Issue restrictions needed before accepting. Comply with the transferring controller's restrictions unless coordinated. Tell the transferring controller promptly if a descent or climb will be delayed.
- **5-4-7:** point-out rules.
- **5-4-8:** automated information transfer (AIT) needs a facility AIT directive/LOA.

### 6.2 What ZTL hands to A80: **UNCONFIRMED**

- I did not find the ZTL/A80 LOA or the A80 SOP in retrievable sources.
- General practice, from NASA/FAA TBFM literature (SECONDARY): the meter fix is on the STAR near the Center-TRACON boundary, and the Center delivers the aircraft to the fix at its scheduled time. This is why STARs begin at the 18,000 ft transition altitude in CIFP.
- Modeling statement: the TRACON receives aircraft already metered to the fix, normally on the STAR lateral path, with the altitude and speed the LOA specifies.
- The LOA and facility-directive numbers (crossing altitude, speed, spacing) cannot be sourced here.

### 6.3 TBFM explained (SECONDARY)

- Time-Based Flow Management schedules inbound traffic to an airport over a 30-90 minute horizon.
- It builds a schedule of **meter fixes** and the runway threshold (together, constraint satisfaction points).
- Each aircraft gets an ETA and a **scheduled time of arrival (STA)** at each point. The STA is recomputed with each radar update until the **freeze horizon**.
- Before the freeze, delays are advisory. After it, the Center controllers absorb delay by speed or trajectory changes so the aircraft crosses the meter fix on time.
- Scheduling is first-come, first-served. Delay is added only when demand exceeds the fix or airport acceptance rate.
- Example freeze values in the literature: 19 minutes to the meter fix (time-based) or 130 NM (distance-based). These are examples only, not ATL's settings.
- Internal departures consume arrival slots; TBFM can delay unfrozen STAs to make room.
- Sources:
  - [NASA NTRS 20190025378](https://ntrs.nasa.gov/api/citations/20190025378/downloads/20190025378.pdf)
  - [NASA NTRS 20190000233](https://ntrs.nasa.gov/api/citations/20190000233/downloads/20190000233.pdf)
  - [FAA Notice 7210.890 TBFM](https://www.faa.gov/documentLibrary/media/Notice/Notice_7210.890_TBFM.pdf), listed in search results, not read.
- JO 7210.3 chapter 18 section 25 (TBFM): fetch blocked (403). UNCONFIRMED.

---

## 7. KATL from CIFP

How to read the records (PRIMARY, CIFP "KATLK7E" lines, with my decoding):
- Route type: 4 = enroute transition, 5 = common route, 6 = runway transition. "B" in "RW26B" means both L and R.
- Legs: IF = initial fix, TF = track to fix, CF = course to fix, FM = fix to manual termination (vector), CA = course to altitude, VI = heading to intercept, HM = hold to manual termination.
- Altitude: "+" = at or above (ARINC 424 convention). A blank description with a value is "at". 18000 in the IF line is the transition altitude, not a restriction.
- A blank speed-description with a value (for example "250") is read as "at". UNCONFIRMED. The ARINC 424-18 speed-description codes were not retrievable.
- The J/H codes on ILS records are decoded from the values. UNCONFIRMED.
- "FM DBN K7 theta rho course" at the end of runway transitions: the last four digits are the outbound course in tenths of a degree (inference).

### 7.1 The eight STARs

**CHPPR1** (common: CHPPR at 13,000 to MRCHH)
- Enroute transitions: BBABE (BBABE, LEMKE, CHPPR); LEMKE (LEMKE, CHPPR); MTHEW (MTHEW, MGRIF, BBABE, LEMKE, CHPPR); RUTTH (RUTTH, JCKEE, OWNNS, CHPPR).
- Runway transitions from MRCHH:
  - 08B: JAGRR (9,000), FM course 180.
  - 09L: BSHOP (9,000), NAVVY (+8,000), RYENN (+7,000), AAKAY (+6,000).
  - 09R: BSHOP (9,000), NAVVY (+8,000), ANDIY (+7,000), DFINS (+6,000).
  - 10: BSHOP (9,000), NAVVY (+8,000), DROYD (8,000), FM 180.
  - 26B: HIDRO, RAIIN, KLOWD, SWEPT, KYMMY, KEAVY, FM 094.9.
  - 27B and 28: HIDRO, EAGYL, SHURT, FOGER, HITTT, YURII, FM 094.9.

**GLAVN2** (common: GLAVN to STHRN)
- Enroute transitions: JKSON (JKSON, MADDX, GLAVN); MGRIF (MGRIF, DENST, AAARN, GLAVN); RUSSA (RUSSA, RUTTH, JKSON, MADDX, GLAVN).
- Runway transitions from STHRN:
  - 08L: YABBA (9,000), NAVVY (+8,000), LARII (+5,000), JAAJJ (+5,000).
  - 08R: YABBA, NAVVY, GPEAT (+5,000), PEARI (+5,000).
  - 09L: YABBA, NAVVY, RYENN (+7,000), AAKAY (+6,000).
  - 09R: YABBA, NAVVY, ANDIY (+7,000), DFINS (+6,000).
  - 10: YABBA, NAVVY, DROYD (8,000), FM 180.
  - 26B: HOGGG, RAIIN, KLOWD, SWEPT, KYMMY, KEAVY, FM 094.9.
  - 27B and 28: HOGGG, EAGYL, SHURT, FOGER, HITTT, YURII, FM 094.9.

**GNDLF3** (common: GNDLF to HALRR to SHULR to JNGLE to QUBIT, then FM course 005.0; no runway transitions)
- Speeds and altitudes: GNDLF +11,000 at 250; HALRR +10,000 at 250; SHULR at 8,000.
- Enroute transitions: BEORN, COOUP, DRSDN, ENNTT, FRDDO, GOLLM, KHMYA, ORRKK, SHYRE, STRDR. Most pass SMAWG to GNDLF, with an FL240-or-above restriction at one fix on the way (for example STRDR, FNLEY, GONDR, BGGNS, ROHUN, NZGUL).

**HOBTT3** (common: HOBTT at +14,000 to ENSLL at 12,000)
- Same ten enroute transitions as GNDLF3, each passing SMAWG (+17,000) then HOBTT (+14,000).
- Runway transitions from ENSLL: 26B (RAIIN, KLOWD, SWEPT, KYMMY, KEAVY, FM 094.9); 27B and 28 (EAGYL, SHURT, FOGER, HITTT, YURII, FM 091.9 and 094.9 as coded).
- No transition for runways 08, 09 or 10.

**JJEDI4** (common: JJEDI to DAFII at 8,000 to GRHAM to POOBA, then FM course 004.0)
- Speed and altitude points: FLKNN +14,000 at 280; CHWEE +11,000 at 250; JJEDI +10,000 at 250.
- Enroute transitions: EEWOK (EEWOK, LAYUH), HOTHH (HOTHH, LLNDO, XWNNG), LARZZ (LARZZ, NEWHP, DTSTR), LAYUH, MELNM, SKWKR, TYFTR (TYFTR, NEWHP, DTSTR). All end through FLKNN, CHWEE or WOKIE/BBFET, then JJEDI.
- No runway transitions.

**ONDRE1** (common: ONDRE at 13,000 to SMELY)
- Enroute transitions: HIGGI; HLRRY; KTRYN; PUPDG; STRWY (all feed STRWY, then ONDRE at 13,000).
- Runway transitions from SMELY:
  - 08B: GAASS, KLOWD, KUNFU, TRAPE, SNEVE, FM 274.8.
  - 09B and 10: FRYES, SHURT, REMAC, DACTL, STUMP, FM 274.9.
  - 26B: VOLTS (9,000), FM course 175.0.
  - 27L: ANVAL (9,000), POSEY (+8,000), SLVAA (+7,000), ROMMM (+6,000).
  - 27R: ANVAL, POSEY, YOUYU (+7,000), MMCAP (+6,000).
  - 28: ANVAL, POSEY, BLUFF (8,000), FM 180.

**OZZZI2** (common: OZZZI to HAARY, no altitudes)
- Enroute transitions: DGESS, FLASK, LEAVI, MHONY, WINNG. All are lateral only, ending at OZZZI via WINNG.
- Runway transitions from HAARY:
  - 08B: KILRR, GAASS, KLOWD, KUNFU, TRAPE, SNEVE, FM 274.8.
  - 09B and 10: KILRR, FRYES, SHURT, REMAC, DACTL, STUMP, FM 274.9.
  - 26L: CALLA (9,000), POSEY (+8,000), JIRRI (+5,000), BOYKN (+5,000).
  - 26R: CALLA, POSEY, ZELOW (+5,000), HAINZ (+5,000).
  - 27L: CALLA, POSEY, SLVAA (+7,000), ROMMM (+6,000).
  - 27R: CALLA, POSEY, YOUYU (+7,000), MMCAP (+6,000).
  - 28: CALLA, POSEY, BLUFF (8,000), FM 180.

**SITTH3** (common: SITTH at +14,000 to TIZZY at 12,000)
- Enroute transitions: EEWOK, HOTHH, LARZZ, LAYUH, MELNM, SKWKR, TYFTR (as for JJEDI4 but ending at SITTH).
- Runway transitions from TIZZY: 08B (GAASS, KLOWD, KUNFU, TRAPE, SNEVE, FM 274.8); 09B and 10 (FRYES, SHURT, REMAC, DACTL, STUMP, FM 274.9).

Published restrictions are sparse. Only these STARs carry altitudes: CHPPR1, GLAVN2, HOBTT3, ONDRE1, OZZZI2, SITTH3, GNDLF3 and JJEDI4 (all eight carry some). Speeds are published only in JJEDI4 (280/250) and GNDLF3 (250). The CIFP restrictions above are PRIMARY as encoded. The meaning of "FM" courses (the vector heading left to the controller) is an inference.

Pattern worth modeling (inference from the data):
- Runway transitions for 08L/R, 09L/R, 26L/R and 27L/R end at the IAF of the matching ILS RNAV approach transition (section 7.3), at 5,000-6,000 ft.
- Runway transitions for 26B, 27B, 28, 08B and 10 end in a fly-heading leg. The controller completes them by vector.

### 7.2 Flow and typical arrival runways

- West flow: arrivals 26R, 27L, 28; departures 26L, 27R. East flow: arrivals 8L, 9R, 10; departures 8R, 9L.
- Source: [IVAO KATL SOP](https://wiki.us.ivao.aero/en/atc/sop/kztl/katl) (simulation community, SECONDARY). Calm wind defaults to west ops there.
- FAA [ATL Airport Capacity Profile 2018](https://www.faa.gov/sites/faa.gov/files/airports/planning_capacity/profiles/ATL-Airport-Capacity-Profile-2018.pdf) lists the same sets, but one snippet labels west-flow runways under an east-flow heading (garbled). It is dated 2018 and was fetch-blocked (403). SECONDARY.
- Wind-based flow selection is a general practice (inference); no numeric wind threshold was found.

### 7.3 ILS records (PRIMARY, CIFP "KATLK7FI", 124 lines)

All glidepaths are -3.00 degrees. Altitude over the threshold is threshold elevation plus TCH (CIFP value in the table).

| Rwy | IF / FACF (alt) | FAF (alt) | FAF to threshold NM | TCH ft | Alt over thr ft | Implied ft/NM | Missed approach |
|---|---|---|---|---|---|---|---|
| 08L | BAZAR (4,000) | SCHEL (2,900) | 5.8 | 50 | 1,065 | 316 | CA 095 to 1,500, VI 360, TROYS +3,500, hold |
| 08R | NZBIT (4,000) | HARSN (2,800) | 5.4 | 53 | 1,077 | 319 | CA 095 to 1,500, VI 360, TROYS +3,500, hold |
| 09L | ARRBE (5,000) | VINII (2,700) | 5.1 | 56 | 1,075 | 319 | VI 100, CONNI +4,000, hold |
| 09R | GGUYY (5,000) | BURNY (2,700) | 5.0 | 55 | 1,082 | 324 | VI 100, CONNI +4,000, hold |
| 10 | CTEEE (4,000) | ZMANN (2,700) | 5.2 | 55 | 1,055 | 316 | CA 095 to 1,400, VI 120, IHOPE +3,000, hold |
| 26L | MARKD (4,000) | DEJAA (2,600) | 4.9 | 52 | 1,048 | 317 | CA 275 to 1,500, VI 290, DALAS +4,000, hold |
| 26R | BAMBU (4,000) | AJAAY (2,700) | 5.2 | 55 | 1,045 | 318 | CA 275 to 1,800, DALAS +4,000, hold |
| 27L | GRMPI (4,000) | DEPOT (2,800) | 5.5 | 58 | 1,043 | 319 | CA 275 to 1,500, VI 265, DUTIE +4,000, hold |
| 27R | MAASN (5,000) | OSTRR (2,700) | 5.2 | 56 | 1,034 | 320 | CA 275 to 1,500, VI 265, DUTIE +4,000, hold |
| 28 | WONZR (4,000) | JUBBA (2,700) | 5.2 | 57 | 1,054 | 316 | CA 275 to 1,500, VI 216, PAJVO +3,000, hold |

Notes:
- IF line decode: the first fix of the main ILS record is the final-approach-course fix, at the first altitude. The second altitude is the glideslope intercept altitude, and the FAF row repeats it. The "implied ft/NM" check is (FAF altitude minus altitude over threshold) / FAF-to-threshold distance, within 316-324.
- Approach transitions (IAFs): 08L LARII, JAAJJ; 08R GPEAT, PEARI; 09L RYENN, AAKAY; 09R ANDIY, DFINS; 10 YINNZ, DEWHY; 26L JIRRI, BOYKN; 26R ZELOW, HAINZ; 27L SLVAA, ROMMM; 27R YOUYU, MMCAP; 28 TERII, PRMAN. All at +4,000 to +7,000.
- The localizer ident for each runway is in the CIFP record (for example IHFW, IATL, IHZK, IFUN, IOMO, IBRU, IGXZ, IFSQ, IAFA, IPKU), all category 3 per the runway record.

---

## 8. Emergencies, minimum fuel, priority, pilot behavior

**Priority (ATC 2-1-4, PRIMARY):**
- First come, first served, "as circumstances permit", except for priority classes.
- "An aircraft in distress has the right of way over all other air traffic."
- MEDEVAC is priority only if the pilot says "MEDEVAC" plus the call sign. Flight plan remarks are informational only.
- AIR EVAC and HOSP get priority when verbally requested.

**Emergencies (ATC 10-1, PRIMARY):**
- 10-1-1: Distress = "Mayday" (preferably three times); Urgency = "Pan-Pan". If neither word is used but you believe an emergency exists, handle it as one.
- 10-1-3: "Provide maximum assistance to aircraft in distress."
- 10-1-4: the controller in contact handles the emergency and coordinates the assisting facilities.

**Minimum fuel (PRIMARY):**
- ATC 2-1-8: tell the next facility; be alert for anything that might delay the aircraft. The pilot recognizes "he/she cannot accept any undue delay". It "is not an emergency situation but merely an advisory". It "does not imply a need for traffic priority".
- AIM 5-5-15: state "minimum fuel" after the call sign on initial contact. If the remaining fuel suggests priority is needed, declare an emergency and report fuel remaining in minutes.

**Pilot behavior (AIM 4-4-7, PRIMARY):**
- Pilots read back altitude assignments, vectors and runway assignments.
- Readbacks include the aircraft identification and use the same sequence as the instruction.
- Altitudes in charted procedures are not read back unless the controller stated them.
- An initial taxi, departure or landing clearance readback includes the runway, with left, right or center.
- Pilots may accept or refuse a clearance.
- Pilots advise "unable" (speed, route, RNAV). AIM 5-5-16 covers advising ATC when unable to fly an RNAV/RNP procedure.
- The AIM and 7110.65 give **no response-delay numbers**. Any delay distribution is a modeling assumption, not a sourced figure. UNCONFIRMED.

---

## 9. JO 7360.1 (aircraft type designators)

- Current edition: **JO 7360.1K**, issued 2025-04-10, status Active. Per the FAA document page, it cancelled 7360.1J on 2025-06-12. Status: SECONDARY (search-result snippet; the page returned 403 to my fetch).
- Info page: https://www.faa.gov/regulations_policies/orders_notices/index.cfm/go/document.information/documentID/1043797
- The FAA publications page lists JO 7360.1K (PDF) with a 06/12/2025 date: https://www.faa.gov/air_traffic/publications/ (SECONDARY).
- **Exact PDF URL: https://www.faa.gov/documentLibrary/media/Order/FAA_Order_JO_7360.1K_Aircraft_Type_Designators.pdf** (confirmed 2026-11-16, from the FAA publications page; the old note below says it could not be retrieved). Open the info page or the publications page above and take the PDF link. For comparison, the superseded 7360.1J PDF is https://www.faa.gov/documentLibrary/media/Order/2024-04-29_FAA_Order_JO_7360.1J_Aircraft_Type_Designators--post.pdf
- Active notice: **Notice JO 7360.7**, issued 2025-10-14, changes 7360.1 (adds a new designator, weight class and WTC for new-entrant airframes; some new aircraft will not display a wake category on ATC displays). SECONDARY. The notice PDF URL as returned by search: https://www.faa.gov/documentLibrary/media/Notice/GENOT_N_JO_7360.7_Change_to_FAA_Order_JO_7360.1_Aircraft_Type_Designators.pdf. Notice JO 7360.6 is cancelled.
- CWT column: the older 7360.1J edition includes sections on Wake Turbulence Category and Consolidated Wake Turbulence categories (search summary, SECONDARY). The column layout in the K edition is UNCONFIRMED. The local 3-9-6 note says SRS categories also come from 7360.1 (PRIMARY).

---

## 10. Modeling requirements

Each requirement is testable and tied to a citation. IDs follow the sections above.

**Radar and wake**
- REQ-001: Minimum radar separation shall be selectable by sensor mode: 3 NM (FUSION symbol, single sensor under 40 NM), 5 NM (single sensor at 40 NM or more, STARS multi-sensor, ISR shown). [ATC 5-5-4]
- REQ-002: A 2.5 NM separation mode on final shall activate only inside 10 NM on the final approach course, with all four conditions (wake minima met, ROT of 50 s or less, CTRDs operational, turnoffs visible). [ATC 5-5-4]
- REQ-003: An aircraft flagged NOWGT shall require 10 NM behind and ahead. [ATC 5-5-4]
- REQ-004: Vertical separation shall be 1,000 ft up to FL410. A new altitude shall be assigned only after the previous holder has been observed leaving it. [ATC 4-5-1, 5-5-5]
- REQ-005: Wake separation shall use the TBL 5-5-3 (directly behind) and TBL 5-5-4 (on approach) matrices as published, with blank cells meaning no wake minimum. [ATC 5-5-4, section 2.3-2.4]
- REQ-006: Wake rules shall treat runways under 2,500 ft apart as one runway (and under 700 ft for departure wake). [ATC 5-5-4 notes]
- REQ-007: Departure wake intervals shall follow the section 2.5 table (3/2/2 min; 4/3/3 for opposite-direction and intersection departures) and shall issue "HOLD FOR WAKE TURBULENCE". [ATC 3-9-6 to 3-9-9]
- REQ-008: Wake cautionary advisories shall be issued to B-I behind A, B or D; E-I behind C; I behind E. [ATC 3-10-3]

**Parallel approaches**
- REQ-009: Parallel-approach eligibility shall be computed from CIFP centerline spacing, not hard-coded. [CIFP, ATC 5-9-6/5-9-7]
- REQ-010: Pairs under 2,500 ft shall be ineligible for dependent or independent approaches. [ATC 5-9-6]
- REQ-011: Dependent diagonal spacing shall be 1.0, 1.5 or 2.0 NM for 2,500-3,600, 3,600-8,300 and 8,300-9,000 ft respectively. [ATC 5-9-6]
- REQ-012: Independent approaches shall require spacing of 3,600 ft or more (3,100 ft with HUR), and PRM assignment under 4,300 ft. [ATC 5-9-7, 5-9-8]
- REQ-013: A monitor display shall be required for independent approaches with spacing under 4,300 ft (dual) or 5,000 ft (triple). [ATC 5-9-7]
- REQ-014: NTZ width shall be 2,000 ft for spacing at or above 3,400 ft, and the NOZ 700 ft below it. [ATC 5-9-7]
- REQ-015: During turn-on to parallel finals, aircraft shall have 1,000 ft vertical or 3 NM; triple operations shall have three altitudes 1,000 ft apart. [ATC 5-9-7 and note]
- REQ-016: A monitor shall issue the "I SHOW YOU LEFT/RIGHT OF THE FINAL APPROACH COURSE", the "YOU HAVE CROSSED" turn-back, and the "TRAFFIC ALERT ... TURN IMMEDIATELY" breakout. [ATC 5-9-7]
- REQ-017: Widely spaced approaches shall apply above 9,000 ft with no NTZ. [ATC 5-9-10]
- REQ-018: Go-arounds shall trigger an instruction restoring separation plus a wake advisory. [ATC 5-9-11]

**Same runway and landing**
- REQ-019: Same-runway arrival and departure separation shall apply the SRS distances of 3,000, 4,500 and 6,000 ft by SRS category. [ATC 3-9-6, 3-10-3]
- REQ-020: Landing and takeoff clearances shall state the runway number first. A runway change shall use "CHANGE TO RUNWAY". [ATC 3-10-5, 3-9-10]
- REQ-021: The departure shall be released only with 2 miles from a final-approach arrival when separation will reach 3 miles within 1 minute. [ATC 5-8-4]
- REQ-022: Adjacent-runway simultaneous operations shall follow 5-8-5, and the tool shall report it unmet when stagger is insufficient (ATL close pairs). [ATC 5-8-5]
- REQ-023: Low approaches shall be at or above 500 ft and never over a holding or departing aircraft. [ATC 3-10-10]

**Vectoring and approach**
- REQ-024: Vectors shall remain at or above the MVA/MIA. [ATC 5-6-1]
- REQ-025: A vector off a STAR shall cancel its published altitude and speed restrictions, and the controller shall assign an altitude (and speed if needed). [ATC 5-6-2]
- REQ-026: Approach clearance shall come at least 3 NM before the IAF/IF when a STAR connects to the approach. [ATC 4-8-1]
- REQ-027: Final intercepts shall be at most 30 degrees (20 degrees inside 2 NM of the gate or for triple), and at least 2 NM outside the gate unless the weather exception applies. [ATC 5-9-1, 5-9-2]
- REQ-028: Base-leg aircraft on opposite bases shall hold 1,000 ft vertical unless other separation exists. [ATC 5-9-1]
- REQ-029: The ILS glidepath shall be -3.00 degrees, with altitude over the threshold equal to elevation plus TCH, taken from CIFP. [CIFP KATLK7FI, AIM 1-1-9]
- REQ-030: Speeds shall use 5-knot increments, with pilots held to plus or minus 10 knots. [ATC 5-7-1]
- REQ-031: No speed assignment shall be made inside the FAF or within 5 miles of the runway, whichever is closer. [ATC 5-7-1]
- REQ-032: Assigned-speed floors shall be 250 kt (FL280 down to 10,000 ft), 210 kt (turbojet arrivals under 10,000 ft) or 170 kt within 20 miles of the threshold, and 230 kt (turbojet departures). [ATC 5-7-3]
- REQ-033: An approach or descend-via clearance shall cancel assigned speeds, and the last published STAR speed shall persist until deleted. [ATC 5-7-1]

**Holding**
- REQ-034: Holding instructions shall include direction, fix, course, leg length and turns when non-standard, plus an EFC. Charted holds may be "AS PUBLISHED". [ATC 4-6-1, 4-6-4]
- REQ-035: EFC phraseology shall be "EXPECT FURTHER CLEARANCE (time)", with additional-delay phrases and "DELAY INDEFINITE" when no estimate exists. [ATC 4-6-1]
- REQ-036: Holding instructions shall be issued at least 5 minutes before the aircraft reaches the fix. [ATC 4-6-1]
- REQ-037: Maximum holding speeds shall be 200, 230 and 265 KIAS by altitude band, and the inbound leg 1 minute at or below 14,000 ft or 1.5 minutes above. [AIM 5-3-8]
- REQ-038: Delay of 30 minutes or more shall trigger total-delay information from the first controller of the receiving facility. [ATC 4-6-3]

**Transfer**
- REQ-039: Handoffs shall complete before the aircraft enters the receiving airspace, with radar-contact acknowledgement and the restrictions listed in 5-4-5. [ATC 5-4-5, 5-4-6]
- REQ-040: Communications shall be transferred before the aircraft enters the receiving area, with facility name, frequency and the fix or altitude to call. [ATC 2-1-17]
- REQ-041: A point-out shall transfer identification only, with no frequency change. [ATC 5-4-2, 5-4-7]

**KATL data**
- REQ-042: STAR geometry, transitions and restrictions shall load from CIFP as coded in section 7.1, and the sim shall treat FM legs as vector points, not fixes. [CIFP KATLK7E]
- REQ-043: Runway data (length, elevation, TCH, bearing 095.0/275.0) shall load from CIFP "KATLK7G". [CIFP]
- REQ-044: Arrival runway sets shall be 26R/27L/28 (west flow) and 8L/9R/10 (east flow); departures 26L/27R and 8R/9L. The flow shall be selectable. [IVAO SOP, ATL Capacity Profile; SECONDARY]
- REQ-045: The 26R, 27L and 28 (and 8L, 9R and 10) pairs shall run as triple simultaneous approaches only if the sim's PRM/FMA flag is set. Whether ATL is authorized is UNCONFIRMED. [ATC 5-9-7, 5-9-8]

**Emergencies and pilot behavior**
- REQ-046: A Mayday or Pan-Pan call shall give priority over all other traffic; "minimum fuel" shall not. [ATC 2-1-4, 2-1-8, 10-1-1; AIM 5-5-15]
- REQ-047: A minimum-fuel flag shall carry across every handoff. [ATC 2-1-8]
- REQ-048: Pilots shall read back altitudes, vectors and runway assignments with the call sign and in the same sequence. [AIM 4-4-7]
- REQ-049: Pilots may reply "unable" to speed, route or procedure instructions. [ATC 5-7-1 note; AIM 5-5-16]
- REQ-050: Pilot response-delay values shall be parameters labeled "assumption, unsourced". [Section 8]

**Data currency**
- REQ-051: The sim shall display its data currency (7110.65BB Change 3; CIFP AIRAC 2611) and shall not claim 7360.1K data without loading it. [Section 9]

### Open items for the lead (UNCONFIRMED)
1. Get the 7360.1K PDF from the FAA info page, and the CWT column from it.
2. Confirm the ATL ILS plate authorizations (PRM, simultaneous, triple).
3. Obtain the ZTL/A80 LOA and TBFM adaptation data.
4. Decode the CIFP "NS/DS/PS" flags and the ARINC 424-18 altitude and speed description codes.
5. Settle the CWT A-I definitions from the current 7110.65 or 7360.1, since 7110.126B is cancelled.
6. The 5-5-4 final two letters (NOWGT and 2.5 NM items) were not recovered.

Sources (web):
- [JO 7360.1K info page](https://www.faa.gov/regulations_policies/orders_notices/index.cfm/go/document.information/documentID/1043797)
- [FAA publications](https://www.faa.gov/air_traffic/publications/)
- [JO 7360.7 notice](https://www.faa.gov/documentLibrary/media/Notice/GENOT_N_JO_7360.7_Change_to_FAA_Order_JO_7360.1_Aircraft_Type_Designators.pdf)
- [JO 7110.126A](https://www.faa.gov/documentLibrary/media/Order/JO_7110.126A_Consolidated_Wake_Turbulence_Separation_Standard_FINAL_SIGNED_508.pdf)
- [JO 7110.126B record](https://employees.faa.gov/tools_resources/orders_notices/index.cfm/go/document.information/documentID/1040468)
- [FAA Explanation of Changes](https://www.faa.gov/air_traffic/publications/atpubs/ATC_html/chap0_info_eoc.html)
- [Notice 7210.890 TBFM](https://www.faa.gov/documentLibrary/media/Notice/Notice_7210.890_TBFM.pdf)
- [NASA NTRS 20190025378](https://ntrs.nasa.gov/api/citations/20190025378/downloads/20190025378.pdf)
- [NASA NTRS 20190000233](https://ntrs.nasa.gov/api/citations/20190000233/downloads/20190000233.pdf)
- [AvWeb Vectors to Final](https://avweb.com/features_old/vectors-to-final/)
- [123ATC approach gate](https://123atc.com/term/approach-gate)
- [IVAO KATL SOP](https://wiki.us.ivao.aero/en/atc/sop/kztl/katl)
- [FAA ATL Airport Capacity Profile 2018](https://www.faa.gov/sites/faa.gov/files/airports/planning_capacity/profiles/ATL-Airport-Capacity-Profile-2018.pdf)