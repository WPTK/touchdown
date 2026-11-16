# ATC news, programs and FAA AI stance, Jan 2025 – Nov 2026

Research pass, 2026-11-15. Background for Touchdown SI, the parody. Quote only what is sourced here, with the
link. faa.gov and transportation.gov refused this agent's fetches, so FAA and DOT facts rest on search snippets
or on trade and wire coverage, marked *(snippet)* or *(secondary)*. Everything else was read directly.

## 1. Incidents and safety events

**DCA midair, Jan 29, 2025 (67 killed)**
- NTSB adopted probable cause on Jan 27, 2026. The final report came out Feb 17, 2026
  ([KMPH/CNN](https://kmph.com/news/nation-world/ntsb-to-decide-probable-cause-in-potomac-midair-crash-at-public-board-meeting-dca-black-hawk-american-airlines-national-transportation-safety-board-reagan-national-airport)).
- Probable cause, per the [NTSB investigation page](https://www.ntsb.gov/investigations/Pages/DCA25MA108.aspx):
  - The FAA put a helicopter route near an approach path.
  - It did not review routes and data, or act on earlier recommendations.
  - It overrelied on visual separation.
- Contributing: high tower workload with combined positions, and limits of collision alerting.
- The NTSB page lists 57 recommendations, 33 of them to the FAA. Among them:
  - **A-26-12**, fully implement time-based flow management
  - A-26-13, reassess the DCA arrival rate
  - A-26-14, miles-in-trail
  - A-26-20/21, conflict alert

**Newark (EWR) and Philadelphia TRACON, 2025**
- Radar and communications outages of about 90 seconds, Apr 28 and May 9, 2025
  ([Flying](https://www.flyingmag.com/newark-airport-suffers-another-90-second-radar-outage/),
  [WHYY](https://whyy.org/articles/newark-airport-radar-access/)).
- Cause: copper lines carrying radar and voice from New York to Philadelphia. The FAA promised fiber.
- Staffing: Philadelphia TRACON had 82 certified controllers against a target of 114 *(secondary,
  [Fox Business](https://www.foxbusiness.com/fox-news-travel/faa-institutes-ground-delay-program-newark-airport-due-staffing-shortages))*.
- DOT OIG audit opened
  ([AVweb](https://avweb.com/aviation-news/outage-outrage-leads-to-dot-audit-of-faas-handling-of-newark-airport/)).
  No findings had been published as of this pass.

**Northeast recurrence, Sep 21, 2026**
- Philadelphia TRACON lost its primary circuit after a contractor cut the backup fiber.
- Ground stops hit EWR, PHL, TEB, JFK and LGA.
- FAA Administrator Bedford: "We're pulling copper up and putting fiber down, but it's the same data architecture
  that we've had for 50 years."
  ([Aerocorner](https://aerocorner.com/news/philadelphia-tracon-outage-newark-ground-stop/);
  [Nextgov](https://www.nextgov.com/modernization/2026/09/30b-more-needed-air-traffic-control-modernization-transportation-secretary-says/416324/))

**LaGuardia, Mar 22, 2026 (2 killed)**
- A Jazz CRJ-900 struck a fire truck that had been cleared to cross Runway 4.
- ASDE-X gave no alert; the truck had no transponder. Controllers were handling an earlier emergency.
  (NTSB preliminary report via
  [KATV/ABC](https://katv.com/news/nation-world/stop-warning-missed-amid-communication-breakdown-in-deadly-laguardia-jet-crash-national-transportation-safety-board-preliminary-report-air-canada-jazz-fire-truck-runway-4-technology-system-failures-air-traffic-control);
  [CRS IN12675](https://www.everycrsreport.com/reports/IN12675.html))

**Other events**
- Boston Logan, Jun 20, 2026 (NTSB DCA26LA242): weak sources, treat as unverified.
- JFK: NTSB final report on an April 2024 incursion *(secondary)*.

**Root causes cited across events:** route design, overreliance on visual separation, workload and combined
positions, copper telecom, surveillance gaps, staffing and training success, alerting limits.

## 2. Staffing

- FY2026: record 2,235 trainee hires; about 11,000 certified controllers
  ([AVweb, Oct 2, 2026](https://avweb.com/aviation-news/faa-reports-record-controller-hiring/)).
- May 15, 2026 workforce plan:
  - The certified-controller target was cut to 12,563 from 14,633, credited to "modern staffing models and
    scheduling tools".
  - Hiring goals: 2,300 in FY27 and 2,400 in FY28
    ([CNN via KRDO](https://krdo.com/news/2026/05/15/faa-slashes-hiring-target-saying-it-can-keep-the-skies-safe-with-fewer-air-traffic-controllers-than-it-thought/)).
- Training can take more than two years.
- Fatigue rules from 2024: 10 hours off between shifts, 12 before a midnight shift
  ([Flying](https://www.flyingmag.com/faa-modifies-rest-rules-for-air-traffic-controllers/)).
  A 2026 relaxation is reported but unconfirmed.
- The 43-day shutdown ended Nov 12, 2025. Flight cuts at 40 airports went 4% to 6% to 3% and were lifted
  Nov 17, 2025
  ([ABC7/AP](https://abc7news.com/post/faa-lifts-order-slashing-flights-allowing-commercial-airlines-resume-regular-schedules/18163057/)).

## 3. Modernization

**The program and its money**
- The "Brand New Air Traffic Control System" got **$12.5B** in the July 2025 reconciliation law, called a
  "down payment"
  ([Washington Technology](https://www.washingtontechnology.com/contracts/2026/06/faa-awards-software-and-ai-contract-part-air-traffic-control-modernization/414356/)).
- Sep 2026: Duffy is seeking **$30B more**, not approved
  ([Nextgov](https://www.nextgov.com/modernization/2026/09/30b-more-needed-air-traffic-control-modernization-transportation-secretary-says/416324/);
  [AOPA](https://aopa.org/news-and-media/all-news/2026/september/24/duffy-unveils-plan-for-additional-atc-modernization-funding)).
- Target: most work done by end of 2028.

**Contracts**
- **Prime integrator: Peraton**, Dec 2025, about $1.5B
  ([AVweb](https://avweb.com/aviation-news/dot-names-prime-integrator-new-atc-system)).
  Politico reported in Aug 2026 that the FAA was weighing a smaller role for it; the FAA and Peraton deny it
  ([AVweb](https://avweb.com/aviation-news/faa-frustrated-atc-overhaul-contractor/)).
- **Air Space Intelligence: $875M over 12 years**, Jun 2026. Covers Flow Management Data and Services, and SMART.
- **AT&T: $74.3M** initial telecom task order
  ([AIN](https://backend.ainonline.com/aviation-news/air-transport/2026-08-17/faa-installs-surface-radars-key-airports-and-awards-743m-att)).
- Voice switches, about $5B *(secondary)*. Radar replacement *(snippet)*.

**GAO-26-107992, Sep 14, 2026** ([GAO](https://www.gao.gov/products/gao-26-107992))
- Phase 1 (communications, surveillance, weather) is due Dec 2028.
- 2,560 of 5,170 copper lines replaced.
- **Phase 2, new automation, is about $10.2B with no start or end date.**
- No lifecycle cost estimate. No integrated master schedule: 11,389 separate project schedules instead.

**Automation replacement:** Common Automation Platform RFI (ERAM + STARS), Nov 2025
([ExecutiveGov](https://executivegov.com/articles/faa-rfi-common-automation-platform-atc)).

## 4. FAA and DOT on AI

**FAA roadmap:** "Roadmap for Artificial Intelligence Safety Assurance", first version Jul 2024
([AIN](https://backend.ainonline.com/aviation-news/futureflight/2024-08-21/faa-issues-first-artificial-intelligence-roadmap)).

**SMART**
- Deployed Sep 21, 2026 at DCA, IAD and BWI. It predicts flows and conflicts; facility leaders accept or reject
  its suggestions
  ([WJLA](https://wjla.com/news/local/story/faa-artificial-intelligence-smart-flight-delays-reagan-national-dulles-bwi-air-traffic-controllers-sean-duffy-bryan-bedford-don-beyer-washington-aviation-safety)).
- Duffy: "It's always going to be a human that manages the airspace in America." (WJLA)
- Rep. Beyer called it a "guinea pig" rollout and said controllers weren't consulted. NATCA said it wasn't
  involved in design or testing
  ([NPR, Sep 21, 2026](https://npr.org/2026/09/21/nx-s1-5976816/faa-ai-manage-airspace), *snippet*).
- Duffy said FAA tools still run on a 1990s operating system (Nextgov).

**Assurance regime:** FAA Order 8040.4C (safety risk management); DO-278A for ground software *(secondary)*.

**Commentary:** automation raises controller workload before it lowers it
([Leeham](https://leehamnews.com/2026/09/23/automation-doesnt-reduce-atc-workload-not-at-first/)).

## 4a. Floppy disks, Nov 5, 2026

- **FOX 29, Nov 5, 2026** (read directly,
  [FOX 29](https://fox29.com/news/faa-finally-phase-out-floppy-disks-from-air-traffic-control-systems-2028)): the FAA
  plans to finish replacing systems that still use floppy disks by 2028, at "hundreds" of facilities that use them for
  weather and other critical information. The agency relies on decades-old Compaq computers and "replacement parts it
  purchases on eBay, Reuters reported." The article repeats the $12.5B and the $30B ask.
- **DOT announcement, Nov 5, 2026** *(secondary)*
  ([DOT](https://www.transportation.gov/briefing-room/trumps-transportation-secretary-sean-p-duffy-begins-retiring-decades-old-floppy-disks)).
  The claims that DOT is replacing the floppies with E-IDS at 435 sites by the end of 2028, and that Duffy said "Good news
  America: floppy disks are out, 21st century tech is in," come from the project brief and the page's title, not from
  the page. transportation.gov answered `403` to a plain `curl` and to the WebFetch tool on 2026-11-16, so the quote is
  unverified here. Check it against the page in a browser before quoting it anywhere that matters.

## 5. Atlanta

- A80: 79 certified controllers against a target of 100, 44% training success, about 1.19M operations a year
  *(third-party, [123atc](https://123atc.com/facility/A80); not FAA data)*.
- 2025: tower about 69% staffed, TRACON about 63%. Six-day, 60-hour weeks
  ([AJC](https://ajc.com/business/2025/06/understaffed-tired-but-middle-of-the-pack-inside-atlantas-air-traffic-control-tower)).
- 2026 ATL ground stops were weather-driven. No 2026 ATC incident at ATL was found.

## 6. Channels to the FAA

- Research BAA 692M15-25-R-00004 at the Tech Center (valid to 2034, often OTAs)
- CRDAs through ANG-E4
- SBIR, reauthorized through 2031 ([CRS IN12705](https://www.everycrsreport.com/reports/IN12705.html))
- RFIs on SAM.gov
- MITRE CAASD, the FAA's federally funded research center, renewed Jan 2026

## Not found or unverified

- FAA primary text for 2026 program claims
- TBFM and Data Comm news
- The 2026 fatigue rule text
- FAA SBIR topics
- DOT OIG Newark findings
- **A sourced Duffy quote saying AI will fix the FAA.** The closest found is the SMART rollout, where he said a
  human will always manage the airspace.
