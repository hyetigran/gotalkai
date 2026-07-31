# Hold-to-think is a no-op unless the learner has the floor

**Status:** accepted

§7.9 flagged three turn-detection edge cases as unresolved: holding during Валентина's turn, holding at session start, and the auto-release timeout. We resolved the first two into a single rule: the hold-to-think button only has an effect when the learner currently holds the conversational floor. Holding at any other moment — during her turn, or immediately after her opening line before the learner has spoken — does nothing.

**Considered alternative:** queue an intent to hold when pressed during her turn, so it takes effect the instant the learner's turn starts. Rejected — it adds state-machine complexity (a queued-hold flag that must survive the turn boundary) to handle a press that's more likely mistimed than a genuine "I'll need time" signal. The learner can simply hold again once their turn actually starts.

**Consequences:** session-start and mid-her-turn presses are indistinguishable from any other press that arrives at the wrong moment — there is no special-casing in the implementation for either, and none should be added without revisiting this decision.
