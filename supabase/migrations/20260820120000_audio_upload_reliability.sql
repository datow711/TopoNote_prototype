alter table public.audio_records
  add column if not exists client_upload_id uuid,
  add column if not exists recorder_account text,
  add column if not exists original_file_name text,
  add column if not exists audio_mime_type text,
  add column if not exists file_size_bytes bigint,
  add column if not exists upload_source text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.audio_records'::regclass
      and conname = 'audio_records_client_upload_id_key'
  ) then
    alter table public.audio_records
      add constraint audio_records_client_upload_id_key unique (client_upload_id);
  end if;
end
$$;

comment on column public.audio_records.client_upload_id is
  'Immutable browser upload request id used to make Drive, Supabase, and Records idempotent.';
comment on column public.audio_records.recorder_account is
  'Stable uploader account identifier; display name remains in recorder_name.';
comment on column public.audio_records.original_file_name is
  'Original browser file name kept as metadata; it is not used as the Drive file name.';
comment on column public.audio_records.audio_mime_type is
  'Canonical MIME type reported by the browser and validated by Root GAS.';
comment on column public.audio_records.file_size_bytes is
  'Browser-reported audio byte size; phase two may add enforcement after distribution analysis.';
comment on column public.audio_records.upload_source is
  'recording or file.';
