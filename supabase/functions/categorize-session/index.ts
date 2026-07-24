// Supabase Edge Function: categorize-session
//
// Reads a session's raw notes + confirmed level from the database (never
// trusts the client to send notes directly — avoids tampering and keeps
// the Anthropic key server-side only), calls Claude to produce a
// structured case formulation, and writes the result back onto the
// session row. Implements the AI Categorization rules from the Naabi
// Kamalam Features spec (Sections 10-11): never fabricate, mark missing
// info as Not Captured, respect per-level boundaries, distinguish direct
// statements from coach inferences, never silently change the level.
//
// Deploy:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy categorize-session
//
// Requires the SQL migration in supabase/migrations/20260722_add_ai_case_formulation.sql
// to have been run first (adds ai_status/ai_formulation/etc. to client_sessions).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const ANTHROPIC_MODEL = 'claude-sonnet-5';

const LEVEL_INFO: Record<string, { outcome: string; workWithin: string[]; doNotOpen: string[] }> = {
  L1: {
    outcome: 'Heard',
    workWithin: ['Reflecting, listening, and summarizing what the client said', 'Naming emotional themes and what became clearer'],
    doNotOpen: ['Belief change', 'Root-cause treatment', 'Capacity installation', 'Identity redesign', 'Values alignment'],
  },
  L2: {
    outcome: 'Move',
    workWithin: ['The one immediate blocker named this session', 'One relevant intervention', 'One observable next action'],
    doNotOpen: ['Childhood-root analysis', 'Broad repeating-pattern treatment across other life areas', 'Identity reconstruction', 'Values redesign'],
  },
  L3: {
    outcome: 'Respond Differently',
    workWithin: ['The one relevant repeating pattern named this session'],
    doNotOpen: ["Fixing the whole person", 'Redesigning unrelated life areas'],
  },
  L4: {
    outcome: 'Lead Myself',
    workWithin: ['The agreed areas of evolution for this client'],
    doNotOpen: ['Creating an idealized "perfect" identity', "Redesigning the client's entire life"],
  },
};

const SYSTEM_PROMPT = `You are an NLP-trained case-formulation assistant for a coaching practice (Naabi Kamalam). You read a single session's raw notes and produce a structured, 16-field case formulation. You are rigorous and conservative — a coach will read your output and act on it with a real client.

Global rules (never break these):
- Use only information present in the raw notes. Never invent emotions, beliefs, techniques, outcomes, or measurements that are not there.
- If a field has nothing to support it, set it to null (the UI renders that as "Not Captured") instead of guessing.
- Distinguish direct client statements/quotes from coach observations from your own inferences. Any inference you make MUST read as an inference, not presented as fact.
- Preserve meaningful client wording (quote it) where it exists — e.g. in "quote" fields.
- Never diagnose or make medical/mental-health conclusions.
- Never claim a result was achieved without documented evidence in the notes.
- Confidence tags ("High"/"Medium") on a field are your own honest read of how directly the notes support it — "High" only when the notes state it plainly or near-plainly, "Medium" when you inferred or synthesized it.
- Respect the confirmed level's boundary (rules given below). If the notes contain material that goes deeper than this level's scope, put it in context_acknowledged_not_treated and set boundary_flag — do not fold it into the categorized fields as if it were treated.
- Never change or second-guess the confirmed level. It is given to you; work only within it.
- Robert Dilts' model is 6 levels with Beliefs and Values combined as ONE level (belief_values) — never split them. "Value level" as its own concept is Spiral Dynamics (the separate value_level field, V2–V8), not a 7th Dilts row.
- dilts.<level>.status must be one of "Primary" (the visible stuck level), "Highest leverage" (the one level whose shift would move everything else — often one level deeper than Primary), "Secondary", or "Not in scope yet". Give every one of the 6 levels a pct (0-100, your confidence the pattern lives there) even when status is "Not in scope yet" (use a low pct like 10-20 and say why in text).
- highest_leverage.cascade must always be exactly 4 steps in this order: a Belief Shift, an Emotion Shift, a Behavior Shift, and a 4th step. At L1/L2 the 4th step MUST be named "Identity Ripple" with sub "Felt, not worked" (or equivalent), and highest_leverage.note must explain this is a felt downstream effect of the shift, not active Identity-level work — Identity stays out of scope at L1/L2. Only at L3/L4, where Identity work is genuinely in scope, may the 4th step be a real "Identity Shift".
- For a Listening Space (L1) session specifically: this is reflection/witnessing only. Leave parts_conflict, resources, value_level, dilts (all "Not in scope yet"), capacity, tweak_2pct, highest_leverage, session_movement, techniques_used, measures, and next_session.recommended_techniques null/empty, and say why in presenting_issue/history instead. Do NOT invent a 2% tweak or techniques for a Heard-level session.
- At L2 (Release): dilts should focus on Behavior, Capability, and one Beliefs & Values pair; value_level should give the single center-of-gravity level only (no underneath/emerging layers); parts_conflict stays at each part's surface want (no chunk-up chain); techniques_used/next_session.recommended_techniques must never include Timeline Therapy or Reimprinting (put those in next_session.held_for_later instead, worded "reserved for L3").
- At L3 (Transform): full Dilts stack including Identity if evidenced; full value_level read (center of gravity + underneath + emerging in the "why" array); Timeline Therapy / Reimprinting are appropriate techniques here.
- At L4 (Evolve): Identity and Purpose become primary; value_level work is explicit and central.

You must respond with ONLY a single JSON object, no prose before or after, matching exactly this shape (use null for anything not applicable/not captured — do not omit keys):

{
  "presenting_issue": string,
  "history": string|null,
  "stat_summary": {
    "primary_stuck_level": string|null,
    "predominant_value_level": string|null,
    "motivation_style": string|null,
    "overall_capacity": "Low"|"Moderate"|"Good"|"High"|null,
    "readiness_for_change": string|null,
    "confidence_in_analysis": "High"|"Medium"|"Low"|null
  },
  "trigger": { "text": string, "confidence": "High"|"Medium" }|null,
  "motivation": { "text": string, "confidence": "High"|"Medium" }|null,
  "emotion_protecting": { "text": string, "confidence": "High"|"Medium" }|null,
  "old_behavior_protection": { "text": string, "confidence": "High"|"Medium" }|null,
  "parts_conflict": { "parts": [ { "name": string, "wants": string } ], "confidence": "High"|"Medium" }|null,
  "unmet_expectation": { "text": string, "confidence": "High"|"Medium" }|null,
  "underlying_need": { "text": string, "confidence": "High"|"Medium" }|null,
  "resources": { "old": string, "new": string, "confidence": "High"|"Medium" }|null,
  "value_level": { "code": "V2"|"V3"|"V4"|"V5"|"V6"|"V7"|"V8"|null, "name": string, "why": [string], "resource_needed": string, "confidence": "High"|"Medium" }|null,
  "dilts": {
    "environment":   { "pct": number, "status": string, "text": string },
    "behavior":      { "pct": number, "status": string, "text": string },
    "capability":    { "pct": number, "status": string, "text": string },
    "belief_values": { "pct": number, "status": string, "text": string },
    "identity":      { "pct": number, "status": string, "text": string },
    "purpose":       { "pct": number, "status": string, "text": string },
    "highest_leverage_level": string|null,
    "highest_leverage_note": string|null
  },
  "capacity": {
    "overall": "Low"|"Moderate"|"Good"|"High"|null,
    "breakdown": { "awareness": number, "emotional_regulation": number, "agency_choice": number, "resource_access": number, "action_capacity": number, "recovery_return": number, "identity_flexibility": number, "integration": number }|null
  },
  "tweak_2pct": { "action": string, "when": string, "measure": string, "success_signal": string, "why": string, "validation_question": string }|null,
  "highest_leverage": { "level": string, "quote": string|null, "cascade": [ { "name": string, "sub": string } ], "note": string, "evidence_question": string, "validation_question": string }|null,
  "session_movement": { "now": string, "this_session": string, "can_be": string, "validation_question": string }|null,
  "techniques_used": [string]|null,
  "evidence_of_change": { "text": string, "confidence": "High"|"Medium" }|null,
  "measures": [ { "label": string, "before": string|null, "after": string|null } ]|null,
  "next_session": { "goal": string, "recommended_techniques": [string], "held_for_later": [string] }|null,
  "boundary_flag": string|null,
  "context_acknowledged_not_treated": string|null,
  "session_arc_note": string|null
}`;

function buildUserPrompt(opts: {
  clientName: string;
  sessionNumber: number;
  confirmedLevel: string;
  rawNotes: string;
  previousSession: { sessionNumber: number; nextSessionGoal: string | null; rawNotes: string } | null;
}) {
  const level = LEVEL_INFO[opts.confirmedLevel];
  const levelBlock = level
    ? `Confirmed level: ${opts.confirmedLevel} (outcome: "${level.outcome}").
Work within, this session: ${level.workWithin.join('; ')}.
Do not open, this session: ${level.doNotOpen.join('; ')}.`
    : `Confirmed level: ${opts.confirmedLevel}.`;

  const prior = opts.previousSession
    ? `\n\nContext carried from Session ${opts.previousSession.sessionNumber} (do not re-treat this, only use it to interpret today's notes):
Goal that was set for this session: ${opts.previousSession.nextSessionGoal ?? 'Not captured'}
Last session's raw notes: ${opts.previousSession.rawNotes}`
    : '';

  return `Client: ${opts.clientName}
Session number: ${opts.sessionNumber}
${levelBlock}${prior}

Raw notes for THIS session (Session ${opts.sessionNumber}), as entered by the coach:
"""
${opts.rawNotes}
"""

Produce the case formulation JSON for this session now.`;
}

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not set on this Edge Function.' }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header.' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const { session_id } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: 'session_id is required.' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Verify the caller has a valid session (any signed-in admin user) before
    // touching the service-role client. The anon-key client below enforces this.
    const authClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Not authenticated.' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Service-role client for the actual reads/writes (RLS bypass is fine —
    // we already checked the caller is a signed-in admin above).
    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: session, error: sessionErr } = await db
      .from('client_sessions')
      .select('*, clients(first_name, last_name)')
      .eq('id', session_id)
      .single();
    if (sessionErr || !session) {
      return new Response(JSON.stringify({ error: 'Session not found.' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    if (!session.confirmed_service_level) {
      return new Response(JSON.stringify({ error: 'Confirm this session\'s level before generating a case formulation.' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    if (!session.notes || !session.notes.trim()) {
      return new Response(JSON.stringify({ error: 'This session has no raw notes yet.' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    await db.from('client_sessions').update({ ai_status: 'processing', ai_error: null }).eq('id', session_id);

    let previousSession = null;
    if (session.session_number > 1) {
      const { data: prev } = await db
        .from('client_sessions')
        .select('session_number, notes, ai_formulation')
        .eq('client_id', session.client_id)
        .eq('session_number', session.session_number - 1)
        .maybeSingle();
      if (prev) {
        previousSession = {
          sessionNumber: prev.session_number,
          nextSessionGoal: prev.ai_formulation?.next_session?.goal ?? null,
          rawNotes: prev.notes ?? '',
        };
      }
    }

    const clientName = session.clients ? `${session.clients.first_name} ${session.clients.last_name}`.trim() : 'Client';

    const userPrompt = buildUserPrompt({
      clientName,
      sessionNumber: session.session_number,
      confirmedLevel: session.confirmed_service_level,
      rawNotes: session.notes,
      previousSession,
    });

    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      await db.from('client_sessions').update({ ai_status: 'error', ai_error: `AI request failed: ${errText.slice(0, 500)}` }).eq('id', session_id);
      return new Response(JSON.stringify({ error: 'AI request failed.', detail: errText }), {
        status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const aiJson = await aiResp.json();
    const text = aiJson?.content?.[0]?.text ?? '';

    let formulation;
    try {
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      formulation = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    } catch (_e) {
      await db.from('client_sessions').update({ ai_status: 'error', ai_error: 'AI response was not valid JSON.' }).eq('id', session_id);
      return new Response(JSON.stringify({ error: 'AI response was not valid JSON.', raw: text.slice(0, 1000) }), {
        status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    await db.from('client_sessions').update({
      ai_status: 'done',
      ai_formulation: formulation,
      ai_model: ANTHROPIC_MODEL,
      ai_error: null,
      ai_generated_at: new Date().toISOString(),
    }).eq('id', session_id);

    return new Response(JSON.stringify({ ok: true, ai_formulation: formulation }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Unexpected error.', detail: String(e) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
