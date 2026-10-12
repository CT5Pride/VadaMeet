create or replace function public.vada_server_config() returns jsonb language sql security invoker set search_path='' as $$
 select coalesce(jsonb_object_agg(name,decrypted_secret),'{}'::jsonb) from vault.decrypted_secrets where name in('LIVEKIT_URL','LIVEKIT_API_KEY','LIVEKIT_API_SECRET','VADA_CRON_SECRET','VADA_HOST_EMAIL');
$$;
revoke all on function public.vada_server_config() from public,anon,authenticated;
grant execute on function public.vada_server_config() to service_role;
