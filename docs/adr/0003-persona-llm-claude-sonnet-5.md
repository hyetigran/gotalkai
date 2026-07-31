# Persona LLM: Claude Sonnet 5, thinking disabled, low/medium effort

**Status:** accepted

The persona LLM stage (§7.2 cascade) generates Валентина's dialogue at runtime. We're using Anthropic's Claude Sonnet 5, with `thinking` explicitly disabled and `effort` set to low/medium, rather than Claude Opus 5 or a competing provider.

**Reasoning:** dialogue generation for 1–2 sentence conversational turns is not a reasoning-heavy task, so Opus-tier latency and cost aren't justified. Sonnet 5 supports the full effort ladder including `low`, and — unlike Opus 5 — disabling thinking carries no restrictions or failure modes on Sonnet 5. Sonnet 5's prompt-cache minimum (1024 tokens) sits comfortably below the expected size of the persona identity/memory prefix, so the 14x caching cost lever from §9 still applies. Structured output (`output_config.format`) covers the Zod-validated schema requirement from §7.8.

**Consequences:** verify the actual assembled persona prompt exceeds the 1024-token cache minimum before relying on the §9 caching economics. If a future need arises for deeper reasoning per turn (e.g. complex avoidance-detection performed at generation time rather than post-hoc), revisit the effort/thinking settings — this decision assumes turns stay simple.
