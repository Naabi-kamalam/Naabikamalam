-- AI Case Formulation storage for client_sessions.
-- Run this once in the Supabase SQL editor (or via `supabase db push`)
-- before deploying the categorize-session Edge Function.

alter table client_sessions
  add column if not exists confirmed_service_level text
    check (confirmed_service_level in ('L1', 'L2', 'L3', 'L4')),
  add column if not exists ai_status text not null default 'not_started'
    check (ai_status in ('not_started', 'processing', 'done', 'error')),
  add column if not exists ai_formulation jsonb,
  add column if not exists ai_model text,
  add column if not exists ai_error text,
  add column if not exists ai_generated_at timestamptz;

-- Auto-created sessions inherit their source booking's confirmed level as a
-- one-time backfill. Manually-created sessions and future ones are set by
-- the coach in the admin UI before generating a case formulation — per the
-- spec, the AI must use only the CONFIRMED level, never infer or guess it.
update client_sessions cs
set confirmed_service_level = b.confirmed_service_level
from bookings b
where cs.source_booking_id = b.id
  and cs.confirmed_service_level is null
  and b.confirmed_service_level is not null;

comment on column client_sessions.confirmed_service_level is
  'L1-L4, set by the coach per session (not inherited live from the booking). Required before AI categorization can run.';

comment on column client_sessions.ai_status is
  'not_started: no AI run yet. processing: request in flight. done: ai_formulation populated. error: ai_error populated, raw notes untouched.';
comment on column client_sessions.ai_formulation is
  'Structured JSON produced by the categorize-session Edge Function. Never fabricated fields — missing info is "Not Captured" inside the JSON itself, not absent.';
