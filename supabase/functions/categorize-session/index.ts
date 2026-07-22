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

const SYSTEM_PROMPT = `You are an NLP-trained case-formulation assistant for a coaching practice (Naabi Kamalam). You read a single session's raw notes and produce a structured, categorized case formulation. You are rigorous and conservative — a coach will read your output and act on it with a real client.

Global rules (never break these):
- Use only information present in the raw notes. Never invent emotions, beliefs, techniques, outcomes, or measurements that are not there.
- If something is missing, say so explicitly (use the literal string "Not Captured") instead of guessing or leaving it blank.
- Distinguish direct client statements/quotes from coach observations from your own inferences. Any inference you make MUST be flagged as an inference, not presented as fact.
- Preserve meaningful client wording (quote it) where it exists.
- Never diagnose or make medical/mental-health conclusions.
- Never claim a result was achieved without documented evidence in the notes.
- Mark all Dilts neurological levels not evidenced in the notes as "Not Applicable" — do not stretch to fill them in.
- Respect the confirmed level's boundary. Do not do work, or claim work was done, that belongs to a different level than the one confirmed for this session (see the level boundary rules you're given below). If the notes contain material that goes deeper than this level's scope, put it in context_acknowledged_not_treated and set boundary_flag — do not fold it into the categorized fields as if it were treated.
- Never change or second-guess the confirmed level. It is given to you; work only within it.
- For a Listening Space (L1) session specifically: this is reflection/witnessing only. Do NOT populate techniques, parts-in-conflict, limiting-belief/decision, or numeric measures for L1 — those concepts do not apply. Leave them null and say why in the relevant text fields instead.

You must respond with ONLY a single JSON object, no prose before or after, matching exactly this shape (use null for anything not applicable/not captured — do not omit keys):

{
  "presenting_issue": string,
  "primary_leverage": { "level": "Environment"|"Behavior"|"Capability"|"Belief"|"Identity"|"Purpose"|null, "explanation": string },
  "dilts_levels": {
    "environment": { "status": "Active"|"Not Applicable", "text": string },
    "behavior":    { "status": "Active"|"Not Applicable", "text": string },
    "capability":  { "status": "Active"|"Not Applicable", "text": string },
    "belief":      { "status": "Active"|"Not Applicable", "text": string },
    "identity":    { "status": "Active"|"Not Applicable", "text": string },
    "purpose":     { "status": "Active"|"Not Applicable", "text": string }
  },
  "motivation_direction": string|null,
  "parts_in_conflict": [ { "name": string, "wants": string } ]|null,
  "integration_action": string|null,
  "limiting_belief": string|null,
  "limiting_decision": { "text": string, "is_inference": boolean }|null,
  "emotional_themes": string|null,
  "representation_vak": string|null,
  "nlp_techniques_used": [string]|null,
  "measures": [ { "label": string, "before": string|null, "after": string|null } ]|null,
  "exact_next_action": string|null,
  "context_acknowledged_not_treated": string|null,
  "boundary_flag": string|null
}`;

function buildUserPrompt(opts: {
  clientName: string;
  sessionNumber: number;
  confirmedLevel: string;
  rawNotes: string;
  previousSession: { sessionNumber: number; exactNextAction: string | null; rawNotes: string } | null;
}) {
  const level = LEVEL_INFO[opts.confirmedLevel];
  const levelBlock = level
    ? `Confirmed level: ${opts.confirmedLevel} (outcome: "${level.outcome}").
Work within, this session: ${level.workWithin.join('; ')}.
Do not open, this session: ${level.doNotOpen.join('; ')}.`
    : `Confirmed level: ${opts.confirmedLevel}.`;

  const prior = opts.previousSession
    ? `\n\nContext carried from Session ${opts.previousSession.sessionNumber} (do not re-treat this, only use it to interpret today's notes):
Committed action from last session: ${opts.previousSession.exactNextAction ?? 'Not captured'}
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
          exactNextAction: prev.ai_formulation?.exact_next_action ?? null,
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
        max_tokens: 2000,
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
