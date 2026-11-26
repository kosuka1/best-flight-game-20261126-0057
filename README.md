# best-flight-game-20261126-0057

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/kosuka1/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/kosuka1/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Skylane Runner** — a chase-view flight game over a procedural island. Thread six gold rings in order, watch the fuel gauge, then land gently on the runway strip to finish the sortie. Keyboard and mouse, synthesized engine and wind audio, no downloads and no network: every file the game loads lives in `game/`.

- **Fly**: W/S or mouse wheel for throttle, arrow keys / A D / mouse for pitch and bank
- **Missions**: six rings, then the landing — scored on rings, touchdown quality and fuel left
- **Instruments**: compass strip, speed and altitude tapes, artificial horizon, fuel and throttle bars
- **Discipline**: stall below 45 knots, fuel burns with throttle, hard arrivals end the sortie

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

To play it, serve `game/` with any static file server and open `index.html` in a desktop browser. Screenshot rig: `?shot=cover|bank|approach|panorama&seed=7` parks the plane in a composed pose.

---

<sub>Entered on [make.fun](https://make.fun/?ref=9dkktyzh&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
