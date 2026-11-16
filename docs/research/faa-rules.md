# FAA rules the simulator models

Research pass, 2026-11-15. Every number the sim uses must trace to a line here, and every line here must
trace to a primary source before the sim relies on it.

**Source status.** faa.gov blocked automated fetches (HTTP 403), so the JO 7110.65 text below was read from
the pointsixtyfive.com mirror, which labels itself JO 7110.65BB Change 3 (effective 2026-07-09). It is a
secondary source: each item lists the official chapter URL to verify against. 14 CFR text is from eCFR
(primary, as of 2026-11-01). AIM text is from the faraim.org mirror.

Edition watch: JO 7110.65CC is scheduled for 2026-12-24. Notice JO 7110.806 (effective 2026-09-14) inserts a
new 5-5-4e and re-letters e–j to f–k. JO 7110.126B (Consolidated Wake Turbulence) shows as cancelled
2026-01-22; presumably folded into 7110.65 (not confirmed).

Status key: **mirror** = read on a secondary mirror, verify against the official text; **primary** = read
on eCFR; **UNCONFIRMED** = not found in any source read; the sim must not depend on it until confirmed.

## Separation

| Rule | Value | Source | Status |
|---|---|---|---|
| Terminal radar lateral, single-sensor ASR | 3 NM within 40 NM of antenna, 5 NM at 40 NM or more | 7110.65 5-5-4 | mirror |
| FUSION lateral | 3 NM (5 NM when ISR shown in data block) | 7110.65 5-5-4 | mirror |
| Reduced separation on final | 2.5 NM within 10 NM of runway; needs wake minima met, documented ROT ≤ 50 s, CTRDs, turnoffs visible | 7110.65 5-5-4 j (k after 9/14/2026) | mirror |
| Vertical, up to FL410 | 1,000 ft | 7110.65 4-5-1 | mirror |
| Assigning a vacated altitude | after the previous aircraft has been issued a climb or descent and is observed (valid Mode C) or reports leaving the altitude | 7110.65 5-5-5 b | mirror |
| Fixed "leave by N ft" threshold | none found | – | UNCONFIRMED |
| Wake, on approach | CWT categories A–I, TBL 5-5-4 | 7110.65 5-5-4 | UNCONFIRMED (matrix not recovered) |
| Same runway | arrival may not cross threshold until preceding arrival is clear of runway, or departure has crossed runway end; daytime distance options by category | 7110.65 3-10-3 | mirror |

Official: https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap5_section_5.html,
chap3_section_10.html, chap4_section_5.html.

## Holding (AIM 5-3-8, 7110.65 4-6)

- Maximum holding speed: 200 KIAS to 6,000 MSL; 230 KIAS 6,001–14,000 (may be restricted to 210); 265 KIAS above 14,000. (mirror)
- Standard pattern right turns; inbound leg 1 min at or below 14,000 MSL, 1.5 min above. (mirror)
- Delay information at least 5 min before the fix; EFC unless no delay expected. (7110.65 4-6-1, mirror)
- No speed adjustments assigned in holding. (7110.65 5-7-1, mirror)

## Speed

- 250 KIAS below 10,000 MSL; 200 KIAS beneath Class B. (14 CFR 91.117, primary)
- Assigned speed minimums, arriving turbojets: 210 kt, or 170 kt within 20 flying miles of the threshold. Turboprops: 200 kt / 150 kt. (7110.65 5-7-3, mirror)
- No speed adjustments inside the FAF or 5 NM from the runway, whichever is closer. (7110.65 5-7-1, mirror)

## Final approach (7110.65 5-9-1, 5-9-2)

- Intercept at least 2 NM outside the approach gate (exceptions by weather, never inside the FAF). (mirror)
- Maximum intercept angle 20° within 2 NM of the gate or with triple simultaneous approaches, 30° otherwise. (mirror)
- Approach gate: 1 NM outside the FAF, no closer than 5 NM from the threshold. (Pilot/Controller Glossary, mirror)
- Intercept altitude: not above the glideslope, not below the minimum glideslope intercept altitude. (mirror)
- 3° glidepath ≈ 318 ft/NM: derived (tan 3° × 6,076 ft), source UNCONFIRMED.

## Aircraft and fuel

- Approach categories by Vref: A < 91, B 91–120, C 121–140, D 141–165, E ≥ 166 kt. (14 CFR 97.3, primary)
- IFR fuel: destination + alternate + 45 min at normal cruise. (14 CFR 91.167, primary)
- "Minimum fuel" is an advisory, not an emergency, and does not by itself give priority. (7110.65 2-1-8, mirror)
- Standard-rate turn 3°/s: FAA-H-8083-15, UNCONFIRMED (snippet only).

## Phraseology

- "DESCEND AND MAINTAIN (altitude)." (4-5-7)
- "HOLD (direction) OF (fix) ON (radial/course/route). (n) MINUTE/MILE LEG. LEFT TURNS." Turn direction only for left turns. (4-6-4) EFC wording UNCONFIRMED.
- "CLEARED (procedure) APPROACH." (4-8-1)
- "CONTACT (facility) (frequency)." (2-1-17)
- Speed in single-digit form (5-7-2); "REDUCE SPEED TO" wording UNCONFIRMED.

## Still to research

- Simultaneous independent and dependent parallel approaches (7110.65 5-9-6, 5-9-7), runway spacing minima, NTZ/PRM; required for KATL's parallel arrival runways.
- Full CWT wake matrix and the type-to-category list (JO 7360.1).
- A80 TRACON specifics: KATL flows, arrival runways, corner-post STARs (from CIFP, not memory).
