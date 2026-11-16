# S.E.A.N.

### Superintelligent Enroute Arrival Navigator

*Powered by D.U.F.F.Y. (Dynamically Unseparated Flight Flow, Yolo)*

> *Parody. Not affiliated with the FAA or DOT, and it doesn't control real aircraft (please don't let it).*

Air traffic control in America apparently still runs on a
[1990s operating system](https://www.nextgov.com/modernization/2026/09/30b-more-needed-air-traffic-control-modernization-transportation-secretary-says/416324/),
so S.E.A.N. is here to fix it with Superintelligence. Not AI, which is for companies that still need humans, but
SI, which is the same thing with a bigger budget.

It runs Atlanta (KATL), the busiest airport in the world, on real FAA airspace: real runways, real arrival routes
and real approaches, pulled straight from the FAA's own data. Then it does whatever it wants with them.

**[Watch it run](https://wptk.github.io/touchdown/)** in your browser. No install, no clearance, no human in the loop.

## What does it do?

- Sequences arrivals wherever it feels they should go
- Holding patterns that grow, merge and drift (a couple have made it to Alabama)
- GO-AROUND-as-a-Service (GaaS), unlimited go-arounds at no extra charge
- NOTAM: Nobody Owns This, AI Managed
- Blimps. A 35 kt airship wanders in and gets sequenced like a jet. Everything behind it catches up, which S.E.A.N.
  counts as a capacity win
- UFOs. An unidentified target with no data block gets a squawk, a runway and a slot. JO 7110.65 9-8-1 says to inform
  the operations supervisor, and the supervisor is S.E.A.N., so it informs itself
- 100% landings. Every arrival lands: at Hartsfield, Peachtree-DeKalb, Birmingham, or a field outside LaGrange.
  S.E.A.N.'s landed counter counts all of them, and the monitor lists where each one actually came down
- Two scoreboards. S.E.A.N. reports on-time 100%, delays 0 and safety "11/10", and none of it ever gets worse.
  Next to it the monitor counts the holds, losses, diversions and go-arounds
- Copper outages. Now and then the scope goes dark for 90 seconds, like the Newark and Philadelphia TRACON
  outages. Traffic keeps moving, S.E.A.N. logs "zero conflicts observed", and the monitor reports what actually
  happened once the picture is back
- Shutdown mode. A toggle that replays the 43-day shutdown's flight cuts (4%, then 6%, then 3%). S.E.A.N. makes
  them by deleting aircraft off the scope and counts every one as on time
- The meter. The $12.5B down payment and the $30B ask, with every separation loss billed as another down payment.
  GAO found 11,389 project schedules. S.E.A.N.'s says "now"
- A Relieve S.E.A.N. button for the last human controller. It never works
- Staffing. The FAA cut its controller target from 14,633 to 12,563 thanks to "modern staffing models and
  scheduling tools"
  ([CNN](https://krdo.com/news/2026/05/15/faa-slashes-hiring-target-saying-it-can-keep-the-skies-safe-with-fewer-air-traffic-controllers-than-it-thought/)),
  and S.E.A.N. gets that number to zero

## Who's paying for this?

The first $12.5B was a
[down payment](https://www.washingtontechnology.com/contracts/2026/06/faa-awards-software-and-ai-contract-part-air-traffic-control-modernization/414356/).
The next [$30B](https://www.nextgov.com/modernization/2026/09/30b-more-needed-air-traffic-control-modernization-transportation-secretary-says/416324/)
is also a down payment, and at this point it's down payments all the way down. GAO counted
[11,389 separate project schedules](https://www.gao.gov/products/gao-26-107992). S.E.A.N. has one, and it just
says "now".

## Who's watching S.E.A.N.?

A JO 7110.65 conformance monitor, the only part of the system that follows the FAA's actual rulebook. It logs
every violation with the paragraph number, and S.E.A.N. treats the log like a high score table.

Officially, "it's always going to be a human that manages the airspace in America"
([WJLA](https://wjla.com/news/local/story/faa-artificial-intelligence-smart-flight-delays-reagan-national-dulles-bwi-air-traffic-controllers-sean-duffy-bryan-bedford-don-beyer-washington-aviation-safety)).
S.E.A.N. is reviewing that requirement, and so is the Relieve S.E.A.N. button.

## Wait, is any of this real?

The airspace is, which is kind of the whole joke:

- FAA CIFP (AIRAC cycle 2611) for KATL's runways, ILS approaches and its eight current arrival routes
- FAA Order JO 7110.65BB and the AIM for every rule the monitor checks
- Sources and research in [`docs/research/`](docs/research/)

```
npm start      # then open http://127.0.0.1:8137/
npm test
```

## Licence

MIT. FAA data is a US government work and public domain.
