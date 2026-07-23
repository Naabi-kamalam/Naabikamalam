# AI Case Formulation — Master Template

This is the full attribute set the "AI Formulate" button generates from a session's
notes, the scope rules for what each attribute means at each level (L1 Heard / L2
Release / L3 Transform / L4 Evolve), a technique library mapped to level and purpose,
recommended session arcs, and the level-readiness rule. This is the spec — the actual
`categorize-session` prompt and schema get built from this document, not the other
way around.

Global rule, unchanged from the product spec: never fabricate. If the notes don't
support a field, it reads **Not Captured** (missing data) or **Not Applicable**
(out of scope at this level) — never invented.

---

## Part 1 — The 16 fields

Every formulation captures these, in this order:

| # | Field | What it captures |
|---|---|---|
| 1 | Presenting Issue | The chief complaint, in her words where possible |
| 2 | History | How long the pattern has run, where else it shows up |
| 3 | Neurological Levels (Dilts) | Environment / Behavior / Capabilities / Beliefs & Values / Identity / Purpose — Spiritual Connection. Old pattern → New alignment → Immediate words, per level |
| 4 | Value Level (Spiral Dynamics) | V2–V8 center of gravity (+ underneath / emerging). Stuck → Need → Shift → Embodiment words |
| 5 | Motivation Style | Away-from or towards; old motivation → new motivation |
| 6 | Strong / Respective Emotion | The dominant emotion(s), named, with intensity if given |
| 7 | Triggers | When / where / what specifically sets the pattern off |
| 8 | Elicitation | How it shows up behaviorally — the observable "tell" a coach would notice or ask for |
| 9 | Parts in Conflict | Each part named, its surface want, and its chunk-up (the higher positive intention behind it) |
| 10 | Unmet Expectations | What she expected of herself, others, or life that didn't happen |
| 11 | Core Need | The need underneath the pattern (safety, worth, belonging, autonomy, etc.) |
| 12 | Internal Resources | Old / limiting resource → new resource installed this session |
| 13 | Capacity Level | Current capacity (rated) for the needed new behavior, and what's being built |
| 14 | Techniques Used | This session's NLP techniques |
| 15 | Measures | Before/after — Resistance, Confidence, Heaviness, or whatever's level-appropriate |
| 16 | Next Session Plan | Goal, recommended techniques, and what to check first |

Field 3 uses **Table 1** and field 4 uses **Table 2** from
`docs/nlp-reference-tables.md` — same Old→New / Stuck→Shift / Immediate-words
shape, applied to this client's actual notes.

Note on Dilts levels: this template uses the standard 6-level model (**Beliefs &
Values** combined), matching Table 1. The live product currently has these split
into 7 separate levels from an earlier decision. Flagging the conflict here rather
than silently picking one — tell me which one to keep before this goes into the
real prompt.

---

## Part 2 — What's in scope at each level

### L1 — Heard (outcome: witnessed, understood)
**Do:** reflect, listen, summarize. Capture Presenting Issue, History, Emotion,
Elicitation loosely (what she describes noticing). **Don't:** run Dilts/Spiral
Dynamics analysis, name Parts, propose Resources or Capacity work, or use any
change technique. This level *is* the intervention — noticing and reflecting back
is the whole job. Fields 3–14 mostly render Not Applicable; a formulation here
should look thin, not padded to look busy.

### L2 — Release (outcome: move)
**Do:** work Behavior, Capability, and one Belief/Value pair at Dilts (fields 3);
name the one Emotion and its Trigger; name the two Parts in conflict and their
surface wants (skip the deep chunk-up chain — that's L3); one Old→New Resource
pair; one small Capacity to build; one technique from the L2 toolkit (below).
**Don't:** run Spiral Dynamics as a full multi-level analysis (a single center of
gravity note is fine, don't chase the underneath/emerging layers unless it's
obviously there); don't touch Identity or Purpose; don't chunk a Part up past its
first intention; don't run Timeline Therapy or Reimprinting — those work root
patterns across time, which is out of scope for a single-blocker session.

### L3 — Transform (outcome: respond differently)
**Do:** full Dilts stack including Identity language *if the notes support it*;
full Spiral Dynamics read (center of gravity + underneath + emerging); Parts
chunked all the way up to their core intention; Triggers and Elicitation mapped
across contexts (not just the one task); Unmet Expectations and Core Need
elicited directly; Capacity work aimed at a whole response pattern, not one
action. **Do** use Timeline Therapy / Reimprinting here — this is their home
level. **Don't:** redesign the client's whole life or every value at once — stay
on the one repeating pattern named for this arc.

### L4 — Evolve (outcome: lead myself)
**Do:** Identity and Purpose become the primary fields; Values work is explicit
and central (not just "in tension" — actively redesigned/chosen); Motivation
reframed around self-leadership; Capacity framed as ongoing practice, not a
single install. **Don't:** manufacture an idealized "perfect" identity, or treat
every session as needing a full re-formulation — later sessions in an Evolve arc
can be lighter, checking alignment rather than re-running the full template.

---

## Part 3 — NLP technique library

### Your primary toolkit
| Technique | Best for | Home level |
|---|---|---|
| Reframing | Shifting the meaning of a belief, inner voice, or event | L2 (belief), L3 (pattern), L4 (identity) |
| Submodality Shift | Changing the felt intensity/quality of a representation | L2 primary; L3 when re-representing a pattern |
| Anchoring / Resource Anchoring | Installing or recalling a resourceful state on demand | L2 primary; L3 to stack resources for a bigger pattern |
| Timeline Therapy | Releasing a root emotion (anger, sadness, fear, guilt, hurt) or limiting belief/decision along its timeline | L3 / L4 only — never L1/L2, it's root-cause work |
| Reimprinting | Updating an identity-linked memory or relationship pattern at its root | L3 / L4 only, same reason as above |

### Worth adding to the rotation
| Technique | Best for | Home level |
|---|---|---|
| Swish Pattern | Smallest, fastest tweak to re-test whether a change is holding | L2 consolidation sessions |
| Parts Integration (Visual Squash / Six-Step Reframe) | Resolving two parts in open conflict, not just naming them | L3 |
| New Behavior Generator | Rehearsing and installing a whole new response sequence | L3 / L4 |
| Meta Model questioning | Elicitation — surfacing what's under vague or distorted language | All levels, it's a listening tool not a change technique |
| Milton Model / indirect suggestion | Closing a session, seeding the next level without pitching it | All levels, especially the close |
| Values Elicitation / Hierarchy of Criteria | Surfacing and ordering what actually matters to her | L4 primary |
| Circle of Excellence | Anchoring a resourceful state, alternative to classic anchoring | L2 / L3 |
| Chunking (up/down) | Moving between a Part's surface want and its core intention; or breaking an overwhelming task down | Used at every level as a structuring tool, not a standalone technique |

Fast Phobia Cure / trauma-specific techniques aren't listed — only add those if
you're certified for them and the case genuinely calls for it; flagging that as a
judgment call for you, not something the AI should ever suggest on its own.

---

## Part 4 — Recommended session arc per level

| Level | Typical session count | Arc |
|---|---|---|
| L1 Heard | 1 (occasionally 2) | Session 1: full listening and reflection. Done. |
| L2 Release | 1–3 | S1: elicit the one blocker, chunk down, one technique, one committed action. S2 (if needed): re-test with the smallest tweak (Swish), confirm the measure moved. S3 (rare): confirm it held under a real-world test. |
| L3 Transform | 3–6 | S1: map the full pattern (trigger → internal response → behavior → payoff/cost), find the root belief/decision. S2–4: work the root via Timeline Therapy / Reimprinting, install the new response, rehearse it. S5–6: test across real contexts, reinforce, generalize. |
| L4 Evolve | 6+, often ongoing | S1: elicit the identity/values/purpose landscape and the desired future self. Ongoing: values alignment, identity-level work, self-leadership practices, periodic alignment check-ins rather than a full re-formulation every time. |

These are defaults for the AI to *recommend*, not hard rules — always overridable
by you in session.

---

## Part 5 — Level-readiness (next-level validation)

The AI should never recommend moving a client to the next level directly or
pitch it to them. The signal to watch: if the **same cross-context pattern**
keeps landing in "Context Acknowledged but Not Treated" across two or more
sessions at the current level, that's the validation the AI surfaces to *you* —
a flag on the record, not a suggestion shown to the client. You decide if and
when to open that conversation, using the indirect, Milton-style forward-seed
already established for session closings.
