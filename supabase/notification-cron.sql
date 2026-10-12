create or replace function private.vada_reminder_tick() returns void language plpgsql security invoker set search_path='' as $$
begin
 delete from public.notification_verify_attempts where created_at<now()-interval '2 days';
 if exists(select 1 from public.notification_jobs where status in('pending','sending')) or exists(
 select 1 from public.events e join public.registrations r on r.event_id=e.id
 join public.notification_preferences p on p.user_id=r.user_id
 where e.status='published' and (p.email_enabled or p.sms_enabled) and
 (e.starts_at between now()+interval '23 hours 50 minutes' and now()+interval '24 hours'
 or e.starts_at between now()+interval '20 minutes' and now()+interval '30 minutes')) then
 perform net.http_post(url:='https://zccppmeltuvhdlmhqrnc.supabase.co/functions/v1/vada-reminders',headers:=jsonb_build_object('Content-Type','application/json','x-vada-cron',(select decrypted_secret from vault.decrypted_secrets where name='VADA_CRON_SECRET')),body:='{}'::jsonb,timeout_milliseconds:=60000);
 end if;
end $$;
revoke all on function private.vada_reminder_tick() from public,anon,authenticated;
select cron.schedule('vada-event-reminders','* * * * *','select private.vada_reminder_tick()');
