# S.E.A.N.

### Superintelligent Enroute Arrival Navigator

> Parody. Not affiliated with the FAA or DOT. Doesn't control real aircraft. Please don't let it.

Air traffic control runs on a 1990s operating system.
[That's straight from the top.](https://www.nextgov.com/modernization/2026/09/30b-more-needed-air-traffic-control-modernization-transportation-secretary-says/416324/)
So we built the fix.

S.E.A.N. is a Superintelligence (SI) air traffic control system. Not AI. SI. It runs Atlanta (KATL), the
busiest airport in the world, on real FAA airspace: real runways, real arrival routes, real approaches, pulled
from the FAA's own data. Then it does whatever it wants with them.

## Features

- **Superintelligent sequencing.** Arrivals go where S.E.A.N. feels they should go.
- **Holding.** Lots of it. The holds grow, merge and drift. A few have made it to Alabama.
- **GO-AROUND-as-a-Service (GaaS).** Unlimited go-arounds at no extra charge.
- **NOTAM.** Nobody Owns This, AI Managed.
- **Automated staffing.** The FAA cut its controller target from 14,633 to 12,563 thanks to "modern staffing
  models and scheduling tools"
  ([CNN](https://krdo.com/news/2026/05/15/faa-slashes-hiring-target-saying-it-can-keep-the-skies-safe-with-fewer-air-traffic-controllers-than-it-thought/)).
  S.E.A.N. gets it to zero.

## Funding

The first $12.5B was a
[down payment](https://www.washingtontechnology.com/contracts/2026/06/faa-awards-software-and-ai-contract-part-air-traffic-control-modernization/414356/).
The next [$30B](https://www.nextgov.com/modernization/2026/09/30b-more-needed-air-traffic-control-modernization-transportation-secretary-says/416324/)
is also a down payment. It's down payments all the way down.

GAO counted [11,389 separate project schedules](https://www.gao.gov/products/gao-26-107992). S.E.A.N. has one.
It says "now".

## Oversight

S.E.A.N. ships with a JO 7110.65 conformance monitor, the one part of the system that follows the FAA's actual
rulebook. It logs every violation with the paragraph number. S.E.A.N. treats the log as a scoreboard.

"It's always going to be a human that manages the airspace in America."
([WJLA](https://wjla.com/news/local/story/faa-artificial-intelligence-smart-flight-delays-reagan-national-dulles-bwi-air-traffic-controllers-sean-duffy-bryan-bedford-don-beyer-washington-aviation-safety))
Sure.

## The real part

The airspace is real. That's the joke.

- FAA CIFP, AIRAC cycle 2611: KATL runways, ILS approaches, the eight current arrival routes.
- FAA Order JO 7110.65BB and the AIM: every rule the monitor checks.
- Sources: [`docs/research/`](docs/research/).

```
npm start      # then open http://127.0.0.1:8137/
npm test
```

## Licence

MIT. FAA data is a US government work, public domain.
