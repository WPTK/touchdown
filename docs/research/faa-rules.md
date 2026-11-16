# FAA rules the simulator models

Research pass 2026-11-15, confirmed against faa.gov on 2026-11-16 (issue #7). Every number the sim uses traces to a
line here, and every line here traces to an FAA publication.

## Source status

faa.gov answers a plain `curl` with a 403 but serves a request that sends a browser user agent (sent openly, no
other tricks). Every page the sim cites was fetched that way on 2026-11-16 and compared byte for byte with the local
copy in `touchdown-data/faa/`. All 16 7110.65 sections were identical, so the local copies are the live official text.

| Publication | Edition | Official URL |
|---|---|---|
| JO 7110.65 Air Traffic Control | **BB, Change 3, effective 2026-07-09** | https://www.faa.gov/air_traffic/publications/atpubs/atc_html/ |
| Aeronautical Information Manual | **effective 2026-07-09** | https://www.faa.gov/air_traffic/publications/atpubs/aim_html/ |
| Pilot/Controller Glossary | Change 3, effective 2026-07-09 | https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/ |
| 14 CFR | eCFR as of 2026-11-01 | https://www.ecfr.gov/ |

The earlier mirror pass (pointsixtyfive.com, faraim.org) agreed with the official text everywhere except the items in
"Where the official text differs" below. No mirror is used any more.

Status key: **confirmed** = read in the official publication on faa.gov; **derived** = computed from a confirmed number;
**not FAA** = a sim choice the rule does not set.

## Confirmed paragraphs

Every 7110.65 and AIM paragraph that `src/` or `docs/` cites. URLs are
`https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap<N>_section_<M>.html` (7110.65) and
`.../aim_html/chap<N>_section_<M>.html` (AIM).

| Para | Title in BB / AIM | Where it is used | Status |
|---|---|---|---|
| 2-1-8 | Minimum fuel | comms | confirmed: advisory, not an emergency |
| 2-1-17 | Radio communications | phrase | confirmed: "CONTACT (facility name or location name and terminal function), (frequency)." |
| 2-4-3 | Pilot acknowledgment/read back | monitor READBACK | confirmed: "Ensure that items read back are correct." |
| 2-4-17 | Numbers usage | phrase, listen | confirmed |
| 2-6-4 | Issuing weather and chaff areas | weather | confirmed |
| 2-9-1 | Application | atis | confirmed: letters sequential, Alpha to Zulu, repeated |
| 2-9-2 | Operating procedures | atis, monitor ATIS | confirmed |
| 3-1-8 | Low level wind shear/microburst advisories | weather | confirmed: "A statement must be included on the ATIS for 20 minutes following the last report or indication"; without ATIS, broadcast for 20 minutes after the last report |
| 3-5-1 | Selection | sean, weather, monitor RWY | confirmed: most nearly aligned with the wind at 5 knots or more, calm-wind runway under 5 |
| 3-5-3 | Tailwind components | weather | confirmed: state wind direction and velocity |
| 3-10-3 | Same runway separation | docs | confirmed |
| 3-10-5 | Landing clearance | phrase | confirmed; changes 2026-10-18, see below |
| 4-5-1 | Vertical separation minima | monitor, enroute | confirmed: up to and including FL 410, 1,000 ft; 2,000 ft between non-RVSM and all others at or above FL 290 |
| 4-5-2 | Flight direction | enroute | confirmed: courses 0 to 179 odd cardinal levels at 2,000 ft, 180 to 359 even |
| 4-5-7 | Altitude information | phrase | confirmed: "CLIMB/DESCEND AND MAINTAIN (altitude)." |
| 4-6-1 | Clearance to holding fix | phrase | confirmed, incl. EFC, and "Do not specify this item if no delay is expected" |
| 4-6-4 | Holding instructions | phrase | confirmed: "HOLD (direction) OF (fix/waypoint) ON (...)", "(number of minutes/miles) MINUTE/MILE LEG", turn direction only if left turns are to be made, the pilot requests it, or the controller considers it necessary |
| 4-8-1 | Approach clearance | phrase | confirmed: "CLEARED (type) APPROACH." |
| 5-5-4 | Minima | monitor SEP, WAKE, fleet | confirmed, one difference below |
| 5-5-5 | Vertical application | monitor ALT | confirmed: assign an altitude "after the aircraft previously at that altitude has been issued a climb/descent clearance and is observed (valid Mode C), or reports leaving the altitude" (b) |
| 5-6-1 | Application (vectoring) | phrase | confirmed |
| 5-7-1 | Application (speed) | monitor SPEED_ADJ | confirmed: not in a holding pattern; not inside the FAF or 5 miles from the runway, whichever is closer; pilot may refuse |
| 5-7-2 | Methods | phrase | confirmed: single-digit form, "Reduce speed to two five zero." |
| 5-7-3 | Speed assignments | monitor SPEED_MIN | confirmed: turbojet not less than 210, or 170 within 20 flying miles of the threshold; turboprop 200 / 150 |
| 5-9-1 | Vectors to final approach course | docs | confirmed: at least 2 miles outside the approach gate (weather and pilot-request exceptions, never inside the FAF) |
| 5-9-2 | Final approach course interception | docs | confirmed: TBL 5-9-1, 20° inside 2 miles of the gate or with triple simultaneous approaches, 30° otherwise (45° helicopters) |
| 5-9-6 | Simultaneous dependent approaches | separation | confirmed; bands are inclusive at the top, see below |
| 5-9-7 | Simultaneous independent approaches, dual and triple | separation | confirmed; sim uses one spacing threshold, see below |
| 5-9-8 | PRM approaches | separation, airspace | confirmed: PRM assigned when centerlines are under 4,300 ft |
| 5-9-10 | Simultaneous independent approaches to widely spaced parallel runways without final monitors | separation | confirmed; the 9,000 ft figure holds for field elevations at or below 5,000 ft MSL, 9,200 ft above that (no KATL or KCLT pair is near it) |
| 9-8-1 | UAP general | monitor UAP | confirmed: "Inform the operations supervisor/CIC of any reported or observed unidentified anomalous phenomena (UAP)" |
| AIM 5-3-8 | Holding | docs | confirmed: 200 KIAS to 6,000 MSL, 230 from 6,001 to 14,000 (a 210 restriction is allowed), 265 above 14,000; inbound leg 1 minute to 14,000 MSL, 1.5 above |
| AIM 7-1-7 | Categorical ceiling and visibility | weather | confirmed: LIFR under 500 ft or 1 mile, IFR 500 to under 1,000 or 1 to under 3, MVFR 1,000 to 3,000 or 3 to 5 |
| AIM 7-1-28 | Key to TAF and METAR | weather, wx-sean | confirmed |
| AIM 7-7-4 | Unidentified Anomalous Phenomena (UAP) reports | monitor AARO | confirmed |
| P/CG "Approach gate" | glossary-a.html | docs | confirmed: "1 mile from the final approach fix on the side away from the airport and ... no closer than 5 miles from the landing threshold" |

### Numbers

| Rule | Value | Source | Status |
|---|---|---|---|
| Terminal single-sensor ASR lateral | 3 NM under 40 NM from the antenna, 5 NM at 40 or more | 5-5-4 a | confirmed |
| Terminal FUSION lateral | 3 NM; 5 NM when ISR is shown in the data block | 5-5-4 b | confirmed |
| STARS multi-sensor mode | 5 NM | 5-5-4 | confirmed (the sim uses the FUSION 3 NM) |
| ERAM lateral | 5 NM below FL 600 | 5-5-4 | confirmed |
| Reduced separation on final | 2.5 NM within 10 NM of the runway, FUSION or single sensor under 40 NM; needs wake separation, an average runway occupancy of 50 s or less documented, CTRDs, turnoffs visible. The sim does not use it. | 5-5-4, last subparagraph (j in BB, k once N JO 7110.806 took effect) | confirmed |
| Vertical | 1,000 ft up to FL 410 | 4-5-1 | confirmed |
| Wake on approach | the 9 by 9 matrix in `fleet.js` | TBL 5-5-4 | **confirmed**: all 81 cells compared against the official HTML table, no differences. The old UNCONFIRMED mark is cleared. |
| Same runway | arrival may not cross the threshold until the previous arrival is clear, or a departure has crossed the runway end | 3-10-3 | confirmed |
| Fixed "leave by N ft" threshold for vacated altitudes | none exists; the text says "observed (valid Mode C), or reports leaving" | 5-5-5 b | confirmed absent |
| 3° glidepath, about 318 ft/NM | tan 3° x 6,076 ft | AIM 1-1-9 | derived |
| Standard-rate turn 3°/s | | FAA-H-8083-15, not 7110.65 or AIM | not checked here, outside this issue |
| Approach categories, IFR fuel, 250 kt, 200 kt under Class B | | 14 CFR 97.3, 91.167, 91.117 | confirmed on eCFR |

## Where the official text differs

1. **5-9-6 band edges.** The text reads "at least 2,500 feet but no more than 3,600", "more than 3,600 but no more than
   8,300", "more than 8,300 but no more than 9,000". `diagonalNm` treated each upper edge as the next band's start
   (a pair exactly 3,600 ft apart got 1.5 NM, not 1.0). Fixed, with a test. No KATL or KCLT pair sits on an edge
   (KATL pairs run 4,209 to 6,464 ft, KCLT 4,291 to 4,989 ft), so no run changes.
2. **5-9-7 spacing.** Dual independent approaches need centerlines at least 3,600 ft apart (3,000 ft with a 2.5° to
   3.0° offset); triple need at least 3,900 ft (3,100 ft with 1.2 s fusion surveillance, and offsets). The sim tests 3,600 ft
   for every pair. Every KATL and KCLT parallel pair is 4,209 ft or more, so the 3,900 ft triple minimum is met either way. (KCLT's 01L/01R and 19L/19R pairs are 4,291 ft, under the 4,300 ft PRM line; the sim treats them as PRM when the flag is on, which is a sim choice, not a claim about CLT.) Left as is and
   noted here so a runway pair under 3,900 ft is not added without changing the rule.
3. **Reduced separation lettering.** The 2.5 NM paragraph is the last subparagraph of 5-5-4. BB letters it j, and N JO
   7110.806 (Micro-EARTS 3 NM, effective 2026-09-14) inserts a new e and re-letters e through j as f through k, so it
   is k today. The HTML carries list letters in CSS, so the letter itself is read from the notice and from item order.
   Nothing in `src/` cites the letter.
4. **TBL numbering inside 5-5-4.** The 2.5 NM subparagraph says wake separation "must be applied in accordance with
   TBL 5-5-2". The captions in the published tables are TBL 5-5-3 (directly behind) and TBL 5-5-4 (on approach). The
   sim reads it as the on-approach table. That is an inference about the FAA's own cross-reference.

Nothing else differed from the mirror: no wrong number, no wrong paragraph.

## JO 7110.65CC (effective 2026-12-24)

Not published yet. The FAA's publication schedule lists CC for 2026-12-24 and says orders appear on the website 30
days before they take effect, which is about 2026-11-24. The monitor stays on BB until after 2026-12-24. When CC is
up, diff it against the BB copies here.

What is known now: seven notices and GENOTs amend 7110.65. Six cancel on 2026-12-24, the date they fold into CC;
N JO 7110.807 cancels 2027-06-10. These are the cited paragraphs they touch:

| Notice | Effective | Cited paragraph affected |
|---|---|---|
| [N JO 7110.806](https://www.faa.gov/documentLibrary/media/Notice/2026-08-11_Notice_7110.806_MEARTS_3_NM_Separation_Utilizing_FDM_v2.pdf) | 2026-09-14 | **5-5-4**: new subparagraph e (MEARTS fused display mode: 5 miles below FL 600, 3 miles up to FL 230 under conditions), e through j re-lettered f through k. Terminal and ERAM minima unchanged, so the monitor's numbers stand. |
| [N JO 7110.807](https://www.faa.gov/documentLibrary/media/Notice/2026-09-17_Notice_JO_7110.807_Airport_Surface_Detection_Equipment_ASDE_System_Operating_Procedures_FINAL_SIGNED.pdf) | 2026-10-18 (cancels 2027-06-10) | **3-10-5** e: landing clearance restrictions with an aircraft holding in position or taxiing to LUAW, by ASDE safety logic state. `phrase.js` only cites the paragraph for the clearance wording, which does not change. Also edits 3-1-9, 3-6-1, 3-9-4, 5-14-5. |

Notices that touch 7110.65 but no paragraph the sim cites: N JO 7110.801 (7-2-1, interim helicopter separation),
.802 (2-1-21 traffic advisories on closely spaced parallels), .803 (7-6-2, 7-6-3, 7-7-3, 7-8-3, 7-9-4), .804 (7-2-1
visual separation, effective 2026-10-28), .805 (7-4-4 approaches to multiple runways, effective 2026-06-19). The FAA
bulletin on visual separation says the December edition lowers the general use of visual separation to aircraft at
or below 10,000 ft MSL; that is 7-2-1, which the sim does not use.

So far no cited paragraph changes its numbers or its phraseology in CC. This list is from the notices, not from CC
itself, so it is final only once CC is read.

## Holding (AIM 5-3-8, 7110.65 4-6)

- Maximum holding speed: 200 KIAS to 6,000 MSL; 230 KIAS 6,001–14,000 (may be restricted to 210); 265 KIAS above 14,000. (confirmed)
- Standard pattern right turns; inbound leg 1 min at or below 14,000 MSL, 1.5 min above. (confirmed)
- Delay information and EFC (4-6-1, confirmed). No speed adjustments in holding (5-7-1, confirmed).

## Still to research

Settled in [`faa-rules-deep.md`](faa-rules-deep.md). What it could not settle is in its section 0.

- Whether ATL is authorized for triple simultaneous approaches (REQ-045). Needs the FAA's ATL plates and JO 7210.3.
- A80 TRACON specifics from CIFP, not memory.
