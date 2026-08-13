# animations/

HyprTab intentionally ships **zero** pre-baked animation files: every
motion — the webhead's walk cycles, swings, poses and web physics — is
generated procedurally at runtime by `src/spider/` (IK-driven rig +
verlet rope physics + a mood-based behaviour brain).

This folder is reserved for user-supplied Lottie packs (drop a `.json`
here and reference it from a scene if you want extra ambient layers in
a fork). The core product never needs them.
