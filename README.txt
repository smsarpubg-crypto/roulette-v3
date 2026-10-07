BONHAYAN Roulette Tracker V8 — Strict Auto Vision

What changed:
- No RPM, direction, or reference-pocket values are written before wheel authentication locks.
- Authentication requires multiple independent cues: wheel ring, 37-pocket cadence, stable rotor motion, separate ball motion, green-zero evidence, and ball/rotor motion separation.
- Requires 18 consecutive authenticated frames to lock.
- Loses lock after 10 bad frames and clears all automatically written measurements.
- Static circular graphics and motionless images cannot pass because both rotor and ball motion are mandatory.

Testing:
- JavaScript syntax checked with Node.
- 1,000,000 synthetic gate cases tested.
- 500,000 mandatory-signal-negative cases: 0 false passes.
- 250,000 circular/impostor scenarios: 0 false passes.
- 250,000 plausible-valid metric cases: strict gate intentionally accepted only the stronger subset.

Important:
These are synthetic regression tests. Camera/video conditions (angle, blur, reflections, compression, table design) still need validation on real roulette footage; V8 is designed to refuse uncertain scenes rather than invent readings.
