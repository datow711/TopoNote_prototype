begin;

-- Browser clients may still read audio metadata, but uploads must go through
-- Root GAS so the task-assignment check cannot be bypassed with a direct INSERT.
drop policy if exists "Allow anon insert audio_records" on public.audio_records;
drop policy if exists "Allow authenticated insert audio_records" on public.audio_records;
revoke insert on table public.audio_records from anon, authenticated;

commit;
