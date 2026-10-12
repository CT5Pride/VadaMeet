create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
grant usage on schema vault to service_role;
grant select on vault.decrypted_secrets to service_role;
create or replace function public.vada_server_config() returns jsonb language sql security invoker set search_path='' as $$
 select coalesce(jsonb_object_agg(name,decrypted_secret),'{}'::jsonb) from vault.decrypted_secrets where name in('LIVEKIT_URL','LIVEKIT_API_KEY','LIVEKIT_API_SECRET','VADA_CRON_SECRET');
$$;
revoke all on function public.vada_server_config() from public,anon,authenticated;
grant execute on function public.vada_server_config() to service_role;
-- Generated on the database; never placed in source or returned to a browser.
do $$ begin if not exists(select 1 from vault.secrets where name='VADA_CRON_SECRET') then perform vault.create_secret(gen_random_uuid()::text||gen_random_uuid()::text,'VADA_CRON_SECRET');end if;end $$;
create schema if not exists private;
revoke all on schema private from public,anon,authenticated;
create or replace function private.vada_sweep_tick() returns void language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.pairings where room_deleted_at is null and (ends_at<=now() or closed_at is not null)) or exists(select 1 from public.events where status='live' and started_at+total_rounds*(round_seconds+break_seconds)*interval '1 second'<=now()) then
 perform net.http_post(url:='https://zccppmeltuvhdlmhqrnc.supabase.co/functions/v1/vada-sweep',headers:=jsonb_build_object('Content-Type','application/json','x-vada-cron',(select decrypted_secret from vault.decrypted_secrets where name='VADA_CRON_SECRET')),body:='{}'::jsonb,timeout_milliseconds:=8000);
 end if;
end $$;
revoke all on function private.vada_sweep_tick() from public,anon,authenticated;
select cron.schedule('vada-close-expired-rooms','5 seconds','select private.vada_sweep_tick()');
