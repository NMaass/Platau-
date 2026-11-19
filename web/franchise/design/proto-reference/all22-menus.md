# Menus in Pokémon All22 and Football GM: what to borrow

Researched 2026-11-19. All22's franchise screens only render with JavaScript, so most of the All22 detail below comes from its patch notes. The Football GM (ZenGM) detail comes from its blog and from how its screens are built today.

## Pokémon All22 (all22pokemon.com)
- **Top level** (each sport has the same five): Build (lineup builder), Play (the arcade games), Franchise (run a Gym Leader's team for many seasons), Challenges (17–0, 151, Retro, with leaderboards) and Draft (a snake draft with friends, pick timers, public or private rooms, CPU teams fill empty seats). [home](https://all22pokemon.com/), [franchise](https://all22pokemon.com/franchise)
- **Ratings:** a player card shows its best positions as position + OVR, e.g. "NT 92 · DT 91 · OL 90". Off-position play reads "At CB: 64% fit · plays like a 71 OVR here". Each player is priced at his best position. The scouting guide grades each stat per position as Key / Helps / A small part / Doesn't count, and keeps the numbers hidden. [scouting](https://all22pokemon.com/scouting), [patch notes](https://all22pokemon.com/patch-notes)
- **Home:** a to-do list, "Your latest games" (Watch / Box score), news, compact standings, and an Activate button for a healthy player on IR.
- **Roster:** lenses LIST / CONTRACTS / XP. Contracts shows this season plus four more, colour-coded deal types, and totals for dead money, committed money, cap and space.
- **Trades:** a two-sided builder. An eye button opens a player in a pop-up without leaving the trade. There is a "Search the league" finder. A **trade meter** turns green when the other team will say yes. The **trade block** lists only your own players, and a player drops off it when traded or cut. **CPU offers** come in and go through on Accept.
- **Free agents:** each is listed at his best position with a percentile ("top 6%") and a secondary position. Waivers read "+ Name · − Name".
- **Draft:** a board where taken players stay in place, dimmed and labelled TAKEN with the pick and team, plus a "Hide taken" toggle. Ratings are **ranges that narrow with scouting**, and scouting gives **30 points a week**. "Sim to end" makes your picks from your board. Rookie cap hits and the cap room left after signing the class show before the draft. The class can be redrawn once a season. A lottery exists only in basketball.
- **League:** standings set the draft order during the season. Playoffs run 14 teams in football, and basketball uses 16 clubs in best-of-seven series. The schedule marks a game in progress LIVE and offers WATCH. History has Transactions and Injuries tabs and every week's news. There are awards (MVP, ROY, DPOY, Most Improved, All-League…) and a Hall of Fame each offseason.
- **Game view:** play the game yourself, watch it or sim it. Replays offer pause and 1×/2×/4× speed, with "Watch it" or "Skip to results". The box score names a Player of the Game and a Defensive Player of the Game.
- Press coverage: [Dexerto](https://www.dexerto.com/pokemon/pokemon-browser-game-lets-fans-draft-fantasy-football-teams-and-play-full-seasons-3417793/), [Retro Dodo](https://retrododo.com/pokemon-meets-american-football-in-this-new-free-to-play-browser-game/), [HeldGames](https://heldgames.com/guides/all22-pokemon-football-game-handhelds)

## Football GM / Basketball GM (zengm.com)
- **Trade:** your roster on one side, the other team's (picked from a team dropdown) on the other. You tick players and draft picks. A summary shows each side's payroll after the trade and warns when a side goes over the cap. "What would make this deal work?" asks the AI to balance the deal, and Propose returns the AI's answer as a message. The AI's trade logic has been tuned repeatedly. [trades tag](https://zengm.com/blog/tag/trades), [trade finder](https://zengm.com/blog/2021/05/trade-finding-algorithm/), [AI pick valuation](https://zengm.com/blog/2023/01/ai-draft-pick-valuation/), [multi-pick trades](https://zengm.com/blog/2025/08/ai-draft-pick-trade-limit/)
- **Trading Block:** you tick the players and picks you would move, then "What are other teams willing to give?" lists offers, one per team, each with a Negotiate button.
- **Free Agents:** columns are Name, Pos, Age, Ovr, Pot, Contract (asking amount × years) and Mood (the player's willingness, with traits on hover), plus Negotiate. Cap space and roster spots show above the list. Negotiating is a separate page where you counter on amount and years.
- **Draft:** draft order on one side and undrafted prospects on the other (Name, Pos, Age, Ovr, Pot), with Draft buttons. "Sim until your pick", "Sim one pick" and "Sim to end" sit at the top. The lottery is its own page with odds per team. [draft tag](https://zengm.com/blog/tag/draft/), [lottery odds](https://zengm.com/blog/2026/06/draft-lottery-probability-calculation/)
- **Draft Scouting:** prospect ratings are fuzzed, and a scouting budget (an expense level) reduces the fuzz. A rank column helps you build a board.
- **Standings:** one table per division, with W, L, Pct, GB, Home, Road, Div, Streak and L10. Clinch markers are letters (x, y, z, o) with a legend.
- **Playoffs:** a bracket. During the season it shows the projected bracket "if the season ended today", and you see the bubble and magic numbers.
- **Schedule:** upcoming games with the opponent and a play action. Past games show the score and link to a box score.
- **League:** History (each season's champion, runner-up and award winners), Awards, Hall of Fame, Team Records and League Records.
- **Live game:** play-by-play log, box score and a speed slider. Buttons for stop, one play, to end of quarter and to end of game.

## Our versions (in screens.js)
- Ratings are a role badge plus OVR (`ROK 91`), as on All22's player card. Prospects get a range (`SWP 68–81`) that narrows with scouting points, like All22.
- Trades work like ZenGM's builder, with All22's meter (green = yes) and the reason in a peek. "What would make this work?" opens a dialog. The trade block lists only our players.
- Offers are CPU proposals with an expiry (All22 + ZenGM). Accept goes through. Counter opens them in the builder.
- Free agents use ZenGM's columns, with Mood renamed Interest and Pos replaced by the role badge. Negotiation happens in a dialog.
- The draft board keeps taken players in place, dimmed and labelled with the pick (All22), next to ZenGM's order list and sim buttons.
- Standings, playoff picture and bracket follow ZenGM, with clinch chips in words instead of x/y/z letters.
- The battle view combines ZenGM's play-by-play log with All22's 1×/2×/4× speed and "Sim to end".
