BONHAYAN Roulette Tracker V12 Shadow Validation

What changed from V11:
- Removed the similar-cases / ESS bottleneck.
- A shadow prediction is generated internally from spin 12 onward and is evaluated only on later results.
- The visible prediction stays hidden until all strong gates pass.
- Current sector concentration and pattern stability update every spin.
- Forward-test metrics no longer remain blank just because a current prediction gate failed.
- Added a recent-6 check so an old pattern cannot keep a stale prediction alive.
- No camera, no RPM, no manual speed or bounce inputs.

Strong gate:
- at least 14 spins current data
- current sector mass >= 39%
- model stability >= 56%
- at least 12 shadow forward tests
- shadow hit rate >= 45%
- one-sided binomial chance probability <= 0.05% versus 9/37 baseline
- at least 3 hits in the latest 6 shadow tests

Important:
Without video/sensor data, the app cannot physically observe the ball bounce. Bounce/volatility is inferred only from pocket-to-pocket landing transitions.
Synthetic tests measure software sensitivity and false-positive behavior only; they do not prove real roulette predictability.
