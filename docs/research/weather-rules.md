# Weather rules and data

Rule text is from the official JO 7110.65BB and AIM on faa.gov, confirmed 2026-11-16 (see `faa-rules.md`). Paragraph numbers below are the ones the code cites.

| Where | What the sim does |
|---|---|
| 7110.65 3-5-1 | Assigns the flow most nearly aligned with the wind at 5 kt or more. Under 5 kt (or variable) the current flow stays. "Tailwind and crosswind considerations take precedence over delay/capacity considerations", so the sim drains the airspace and turns the runway around even though that costs landings. |
| 7110.65 3-5-3 | The tailwind component is computed and shown. State the wind when a tailwind exists. |
| 7110.65 2-6-4 | Storm cells are drawn as precipitation on the scope. |
| 7110.65 3-1-8 | Low level wind shear advisory, held for 20 minutes after the last indication. The triggers (gust spread of 15 kt or more, or a strong cell over the field) are this sim's, the rule says what to do once there is an indication. |
| AIM 7-1-7 | LIFR, IFR, MVFR and VFR from ceiling and visibility. VFR uses a visual approach, everything else an ILS. |
| AIM 7-1-28 | METAR codes: TS, FC, +FC, DS, SS. |

## UNCONFIRMED

- ATL arrival rates. No sourced table was found, so `RATE_BY_CATEGORY` and `RATE_STORM_OVERHEAD` in `src/weather.js` are stand-in multipliers on landing spacing.
- Which runway ATL treats as the calm-wind runway. The sim starts in west flow.
- METAR winds are true and runway numbers are magnetic. The few degrees between them are ignored.

## Scenarios (`src/scenarios.js`)

| id | date | window (Z) |
|---|---|---|
| west-flow | 2026-03-21 | 12:52 to 18:52 |
| east-flow | 2026-11-02 | 12:52 to 18:52 |
| ifr-freezing-rain | 2026-01-25 | 12:52 to 18:52 |
| thunderstorm | 2026-06-18 | 18:14 to 22:00 |

Every METAR and SPECI in each window, from the Iowa Environmental Mesonet ASOS archive. aviationweather.gov's own archive only reaches back about two weeks. The TAF is the one aviationweather.gov issued for KATL at 0943Z on 2026-11-16.

Live KATL weather on page load is not possible: aviationweather.gov sends no `Access-Control-Allow-Origin` header and a browser `fetch` from a page fails (checked 2026-11-16).
