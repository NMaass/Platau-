# Plateau AI evaluation — results

Run 2026-11-19 on branch franchise-mode (4 cores, real engine via `sim/node-pool.ts`, 3 workers, AI budget
10 ms/decision unless noted). 560 real-engine battles in total, every match played twice with sides swapped.
Scripts (all read-only against the model; experiments run on cloned states):

```sh
cd web
node franchise/eval/lineup.ts [--static]     # lineup AI: brute force, random, top-6, real-engine A/B tests (~290 battles)
node franchise/eval/draft.ts [--static]      # season draft vs baselines, fantasy draft, mixed need-aware draft (96 battles)
node franchise/eval/market.ts [seasons=3]    # AI-AI trades, free agency (fast sim only)
node franchise/eval/controls.ts              # engine controls: -10 levels, EV grade F, 30 ms budget (90 battles)
node franchise/eval/calibration.ts [--analyse-only]   # 40 cross-club matches + quick-sim calibration over every battle
```
Raw outputs land in `eval/out/` (`battles.jsonl` holds every battle; `*.md` per script). Sample sizes are modest:
±10–20 points on the 95% intervals in the per-experiment tables. Read them as "no effect detected", not "no effect".

## Summary

**The lineup AI is optimal by its own measure, and the draft AI is close to optimal by its own measure. The measure
itself, OVR, does not predict who wins real battles.**

- `planLineup` matches an exhaustive search on on-role slots in 100% of 1,620 team × strategy cases, and on rating sum
  within 2 points in 98% (mean gap 0.2 points).
- Real engine: the auto lineup beats a random 6 from the same roster only **53% ± 13%**, even though its mean OVR is
  11.6 higher (the quick sim predicts 84%). Higher-OVR clubs (mean gap 9 OVR) beat lower ones **51% ± 10%** (quick sim:
  78%). Across all 530 comparable battles the logistic slope is 0.02 ± 0.02 per OVR point: a 10-point edge is worth
  about 54%.
- The engine can tell strong from weak. The same lineup against itself 10 levels lower wins **93%**. So the battles
  are not noise.
- Root cause: rating bases come from Smogon tiers, but battle levels are randbats levels, which are designed to cancel
  tiers out. Across 1,174 species the correlation between a species' best role base and its battle level is
  **−0.88**. A higher-OVR mon is mostly a lower-level mon.
- The quick sim is badly miscalibrated. Its Brier score is 0.29, worse than a coin flip (0.25). Fitted against real
  outcomes, k = 0.10 ± 0.14, where 1 would be calibrated. Fast-sim seasons therefore exaggerate how much roster
  quality matters.
- None of these choices showed a measurable effect in real battles: roles vs top-6 OVR (55% ± 21%), lead order
  (55% ± 15%), a weather setter vs no setter (52% ± 14%), and need-aware drafting (53% ± 10%).
- One weak signal: playing each slot's role set instead of the mon's best-tier set went 35% ± 18%, from only 26
  battles.

## Ranked AI weaknesses and proposed fixes (not implemented)

1. **OVR does not measure battle strength, so every AI decision optimises the wrong thing.** The affected decisions
   are lineups, strategy choice, the draft, trades, FA and the quick sim. Tier bases (`catalog/roles.ts` `TIER_BASE`,
   `model/ratings.ts` `setBase`) are cancelled by randbats battle levels (corr −0.88). Fix: either stop
   level-balancing (`catalog` battle level: one level for everyone, or a much flatter curve), or make the rating
   level-aware (`ratings.ts`: base = a power estimate at the battle level). This is a design decision for Nick,
   because docs/FRANCHISE.md fixes both rules. Then fit `TIER_BASE`/`EV_ADJ` to engine results with
   `eval/calibration.ts`.
2. **EV grade (development) barely matters in battle.** The same six at grade F instead of their grade (−12 OVR) still
   win 40% against themselves; the quick sim says 13%. So Growth, the draft and practice focus pay off far less than
   the UI implies. Fix: `model/grades.ts` `EV_PCT` (F 40% → e.g. 0%, or a wider spread), and IV values.
3. **The quick sim is overconfident and uncalibrated.** It predicts 85–95% where the engine gives 54–59%. Fix:
   `model/quicksim.ts`. Until #1 lands, raise `QUICKSIM_SCALE` from 6.5 to about 40 or more (fitted k ≈ 0.1). After
   #1, refit `strength()` to engine data. The fitted k is uncertain (±0.14).
4. **Strategies converge, and weather and hazard strategies are mostly unfillable.** 84% of AI club-states play Bulky
   Offense, Balance or Hyper Offense. Rosters can't fill the strategy fully on-role in 70–95% of cases for weather and
   77% for Hazard Stack. Setters show no measured value. Fix: `model/strategies.ts` (looser weather slots, e.g.
   abuser | attacker). Have `value.ts` `needBoost` score the club's favourite strategies, not only the current one,
   so the draft and FA build toward them.
5. **AI-AI trades are lopsided and mostly pointless.** 59% of 22 trades give one side less than half the other's true
   value. 73% of the clubs' sides don't change their best lineup at all (bench for bench). Fix: `model/trades.ts`
   `aiTrade`. Require the neutral (viewer `null`) values to be within about 30%, and require at least one side's
   chooseStrategy score to rise.
6. **The draft overrates some legendaries and ignores time to peak.** Articuno-Galar went at pick 7 twice but ranked
   #23–24 by OVR three seasons later. The AI's pick order vs realised OVR gives Spearman 0.46 (0.92 vs its own
   projection). Fix: `model/value.ts` `projectedOvr`, discounted by the Growth still needed and the years to peak.
   The startup draft (`season.ts` `fantasyDraft`) ignores roles. A need-aware variant gains +2.5 starter OVR and
   +19 rating sum at no cost, but only matters once #1 is fixed.
7. **FA signings rarely fill needs.** 63% of AI signings don't improve the club's lineup, and only 37% start. 9% of
   club-seasons pay the salary floor. Fix: `model/freeagency.ts` `faRound`. Rank bids by lineup gain (needBoost on the
   favourite strategies), and spend toward the floor.
8. **(Weak signal) Role sets may be weaker than a mon's best set** (35% ± 18%, n = 26). Fix: `model/lineup.ts`
   `slotFit`. Prefer the best set when the slot's role is not a setter or hazard role. Re-test with more battles first.

---
# Detailed results

## Lineup AI — static (6 leagues × {start, week 8}, 180 AI team-states × 9 strategies = 1620)
| lineup | on-role slots (of 6) | rating sum (6 slots) |
|---|---|---|
| auto (planLineup) | 5.42 | 440.3 |
| brute-force optimum | 5.42 | 440.5 |
| top-6 OVR, best assignment | 4.41 | 431.4 |
| random 6 of active+backup, random slots | 2.14 | 315.1 |
Auto matches the optimum's on-role count in 100% of cases, and its rating sum (±2) in 98%; mean gap 0.00 slots / 0.2 pts (max 10).
Strategies chosen by AI teams: bulky-offense 57, balance 49, hyper-offense 46, hazard-stack 8, rain 8, sun 7, stall 2, snow 2, sand 1. Favourite chosen 65%; chosen lineup fully on-role 98%; chosen strategy's rating sum below the best fully-on-role strategy by 7.1 pts on average.
Strategies a roster cannot fill fully on-role (count of 180 team-states): hyper-offense 12, bulky-offense 12, balance 6, stall 54, rain 125, sun 141, sand 171, snow 156, hazard-stack 139.

## Lineup AI — real engine (budget 10 ms/decision, each match played twice with sides swapped)
| experiment | matches | battles | A win rate (95% CI) | quick-sim P(A) | mean OVR A / B |
|---|---|---|---|---|---|
| auto vs random 6 (active+backup, best sets, random order) | 30 | 60 | 53% ± 13% | 84% | 77.0 / 65.4 |
| auto vs same six, each on its best-OVR set (same order) | 13 | 26 | 35% ± 18% | 50% | 76.7 / 76.7 |
| auto vs same six & sets, shuffled order (lead) | 20 | 40 | 55% ± 15% | 49% | 77.9 / 77.9 |
| auto (strategy) vs top-6 OVR on best sets | 11 | 22 | 55% ± 21% | 42% | 75.5 / 77.7 |
| higher-OVR team vs lower-OVR team (auto lineups) | 48 | 96 | 51% ± 10% | 78% | 82.0 / 72.9 |

OVR gap curve (mean starter OVR A − B):
| gap | battles | real win rate A | quick-sim P(A) |
|---|---|---|---|
| 1.5–3 | 2 | 0% ± 1% | 54% |
| 3–5 | 16 | 38% ± 24% | 64% |
| 5–+ | 78 | 55% ± 11% | 81% |

| weather lineup with setter vs setter swapped for best non-setter | 25 | 50 | 52% ± 14% | 42% | 75.7 / 77.6 |

## Draft AI — season draft (8 leagues, after season 1; class 60.0 prospects, 48 picks)
Value = the prospect's true OVR three seasons later (league simmed on with the AI draft; development is mostly intrinsic).
| policy (all 16 clubs) | round 1 mean | round 2 | round 3 | all 48 | true projected peak at draft | regret vs oracle (pts/pick) |
|---|---|---|---|---|---|---|
| AI (aiChoice) | 70.3 | 57.1 | 54.3 | 60.6 | 58.7 | 0.2 |
| best scouted OVR now | 65.4 | 57.9 | 48.5 | 57.3 | 57.1 | 3.5 |
| best true OVR now | 65.3 | 58.1 | 49.7 | 57.7 | 57.3 | 3.1 |
| best true projected peak | 70.2 | 57.1 | 51.0 | 59.4 | 58.8 | 1.3 |
| random | 56.0 | 52.8 | 55.7 | 54.8 | 55.7 | 6.0 |

One club uses the policy, the other 15 use the AI (its picks' mean value; 4 clubs per league):
| policy | true projected peak | realised OVR +3 seasons |
|---|---|---|
| AI (aiChoice) | 58.7 | 60.5 |
| best scouted OVR now | 55.9 | 55.4 |
| best true OVR now | 56.6 | 56.8 |
| best true projected peak | 60.9 | 59.1 |
| random | 50.5 | 49.4 |
AI pick order vs realised OVR: Spearman 0.46 (vs true projection at draft: 0.92).
Scouting at AI pick time: mean range width 9.9 pts; 0% exact.
AI picks with needBoost > 0 (fills a slot better than the current starter): 26%; drafted mons starting 3 seasons later: R1 41%, R2 15%, R3 10%.
Legendaries in the classes:
- Celebi (pot C, OVR 65): AI pick #6, realised rank #11, OVR +3y 69
- Azelf (pot A, OVR 60): AI pick #7, realised rank #11, OVR +3y 73
- Articuno-Galar (pot AAA, OVR 54): AI pick #7, realised rank #24, OVR +3y 63
- Hoopa (pot B, OVR 55): AI pick #15, realised rank #15, OVR +3y 64
- Articuno-Galar (pot B, OVR 59): AI pick #7, realised rank #23, OVR +3y 63
- Chi-Yu (pot AAA, OVR 84): AI pick #1, realised rank #1, OVR +3y 92
- Lugia (pot AAA, OVR 79): AI pick #2, realised rank #6, OVR +3y 83

## Draft AI — startup (6 leagues each)
| start | starters on-role (of 6) | lineup rating sum | strategies fillable on-role (of 9) | starter OVR mean | SD of starter OVR across clubs | distinct strategies per league |
|---|---|---|---|---|---|---|
| random | 5.98 | 462.2 | 4.3 | 77.7 | 2.48 | 5.3 |
| fantasy-draft | 6.00 | 468.8 | 4.5 | 78.7 | 1.41 | 7.5 |

Mixed fantasy draft (same pools; 8 random clubs per league pick need-aware for 10 rounds = AI heuristic + 0.5 × gain in their best strategy score):
| clubs | starters on-role | lineup rating sum | strategies fillable | starter OVR mean |
|---|---|---|---|---|
| heuristic | 5.96 | 459.3 | 4.2 | 77.5 |
| need-aware | 6.00 | 478.0 | 4.9 | 80.0 |

Real engine, need-aware club vs heuristic club (48 pairings × 2): need-aware wins 53% ± 10% (quick sim predicts 59%; mean starter OVR 80.0 vs 77.5).

## Trades (AI ↔ AI), 22 trades over 4 leagues × 3 fast-sim seasons
Mean |true value gap| 11.3 pts (value scale: OVR-95 prime starter ≈ 100); mean |OVR gap| 5.6; 59% of trades have one side getting < half the other's true value.
Lineup effect (chooseStrategy score, per-slot points): mean 0.5; 27% of sides improve their best lineup, 0% get worse, 73% unchanged (bench-for-bench).
One season later: mean |OVR gap| between what the sides got 5.9 (n=22). Age of mons moved: 26.7.
Largest true-value gaps:
- S1 W7: t12 got OVR 82.0 age 30.0 (value 43.6) ↔ t15 got OVR 69.0 age 31.0 (value 9.4); lineup gain 1.5 / 0.0
- S3 W5: t7 got OVR 72.0 age 23.0 (value 38.3) ↔ t3 got OVR 64.0 age 26.0 (value 9.5); lineup gain 0.0 / 0.0
- S3 W8: t12 got OVR 81.0 age 27.0 (value 50.3) ↔ t9 got OVR 90.0 age 26.0 (value 78.2); lineup gain 1.5 / 3.2
- S1 W4: t9 got OVR 77.0 age 31.0 (value 25.8) ↔ t3 got OVR 67.0 age 27.0 (value 4.2); lineup gain 3.7 / 0.0

## Free agency (AI clubs), 210 signings over 12 offseasons
Signings per offseason 17.5 of 53.0 free agents. Mean OVR signed 71.4, age 29.7.
Signings that improve the club's best lineup: 37%; that start right after FA: 37%; mean lineup gain 0.7 per slot.
Best 5 unsigned free agents after FA: mean OVR 57.0 vs median OVR signed 70.8.
Salary-floor payments: 18 of 192 club-seasons.

## Controls (real engine)
| control | battles | A win rate (95% CI) | quick-sim P(A) | mean OVR A / B |
|---|---|---|---|---|
| same lineup vs itself 10 levels lower (10 ms) | 30 | 93% ± 9% | 50% | 78.6 / 78.6 |
| same lineup vs itself at EV grade F (10 ms) | 30 | 60% ± 18% | 87% | 78.2 / 66.1 |
| largest OVR gaps, 30 ms budget | 30 | 53% ± 18% | 60% | 80.2 / 76.6 |

## Quick-sim calibration (all 530 real-engine battles from every eval script)
| quick-sim P(A) bin | battles | quick-sim mean | real A win rate (95% CI) |
|---|---|---|---|
| 0.00–0.35 | 44 | 28% | 45% ± 15% |
| 0.35–0.45 | 40 | 40% | 55% ± 15% |
| 0.45–0.55 | 160 | 50% | 51% ± 8% |
| 0.55–0.65 | 88 | 60% | 55% ± 10% |
| 0.65–0.80 | 84 | 72% | 50% ± 11% |
| 0.80–0.90 | 70 | 85% | 54% ± 12% |
| 0.90–1.00 | 44 | 95% | 59% ± 15% |
Brier score: quick sim 0.29, coin flip 0.25. Mean |quick sim − 0.5| = 17%.
Logistic fit real ~ k·logit(quick sim): k = 0.10 ± 0.14 (1 = calibrated; <1 = quick sim overconfident).
Real win vs mean-starter-OVR gap: slope 0.02 ± 0.02 per point → a 10-point OVR edge = 54% (quick sim's own scale: 10 pts ≈ 82% before roles).
Cross-club calibration matches (80 battles): per-SD effect of predictor on log-odds — OVR gap -0.00 ± 0.44, level-aware stat proxy -0.01 ± 0.44.
Correlation of OVR gap with stat-proxy gap: -0.17.

Per experiment (quick sim vs real):
| tag | battles | real A win | quick-sim P(A) |
|---|---|---|---|
| auto-vs-random | 60 | 53% ± 13% | 84% |
| auto-vs-bestset | 26 | 35% ± 18% | 49% |
| auto-vs-shuffled | 40 | 55% ± 15% | 49% |
| auto-vs-top6 | 22 | 55% ± 21% | 42% |
| ovr-gap | 96 | 51% ± 10% | 78% |
| weather-setter | 50 | 52% ± 14% | 42% |
| fd-need-vs-heur | 96 | 53% ± 10% | 59% |
| calib | 80 | 53% ± 11% | 43% |
| ctl-ev-F | 30 | 60% ± 18% | 87% |
| ctl-gap-30ms | 30 | 53% ± 18% | 60% |

## Notes on method
- The static lineup objective matches the model's: on-role slots first, then the rating sum. Practice-squad mons are
  allowed only on-role, at −6. The brute-force search covers every assignment by DP over subsets.
- Season-draft "realised OVR" comes from the league simmed on with the AI's own draft. Undrafted prospects sit in
  free agency without practice, which slightly favours drafted mons and hence the AI. The table also gives the true
  projected peak at draft time, which has no such bias.
- The mixed fantasy draft re-runs the snake draft over the pool of `newLeague({start: 'fantasy-draft'})`.
  `season.ts` was being edited concurrently, so its heuristic is copied into `eval/draft.ts`.
- "True value" in the trade check is `monValue(viewer = null)`, i.e. projected OVR and contract surplus with no need
  boost.
- The stat proxy in `calibration.ts` is the sum of actual battle stats (level, EVs, IVs; neutral nature). It did not
  predict wins either (per-SD effect −0.01 ± 0.44, n = 80), so a pure stat rescale is not enough for fix #1. Moves,
  abilities and items are balanced by the randbats levels too.
