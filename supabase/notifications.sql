-- Private notification preferences: never included in public profiles.
create table public.notification_verify_attempts(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,created_at timestamptz not null default now());
create index notification_verify_user on public.notification_verify_attempts(user_id,created_at);
alter table public.notification_verify_attempts enable row level security;
revoke all on public.notification_verify_attempts from public,anon,authenticated;
grant all on public.notification_verify_attempts to service_role;
create table public.notification_preferences(
 user_id uuid primary key references auth.users(id) on delete cascade,
 email_enabled boolean not null default false,email_consented_at timestamptz,
 phone text check(phone ~ '^\+[1-9][0-9]{7,14}$'),phone_verified_at timestamptz,
 sms_enabled boolean not null default false,sms_consented_at timestamptz,
 updated_at timestamptz not null default now(),
 check(not sms_enabled or (phone is not null and phone_verified_at is not null and sms_consented_at is not null)),
 check(not email_enabled or email_consented_at is not null)
);
create unique index notification_phone on public.notification_preferences(phone) where phone_verified_at is not null;
create table public.notification_jobs(
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.events(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,channel text not null check(channel in('email','sms')),
 reminder_minutes int not null check(reminder_minutes in(1440,30)),due_at timestamptz not null,
 status text not null default 'pending' check(status in('pending','sending','accepted','delivered','failed','unknown','skipped')),
 provider_id text,error_code text,claimed_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(event_id,user_id,channel,reminder_minutes)
);
create index notification_jobs_pending on public.notification_jobs(due_at) where status='pending';
create index notification_jobs_event on public.notification_jobs(event_id);
create index notification_jobs_user on public.notification_jobs(user_id);
create index notification_jobs_provider on public.notification_jobs(provider_id) where provider_id is not null;
alter table public.notification_preferences enable row level security;
alter table public.notification_jobs enable row level security;
revoke all on public.notification_preferences,public.notification_jobs from public,anon,authenticated;
grant all on public.notification_preferences,public.notification_jobs to service_role;

-- Atomic claim prevents overlapping scheduler calls from sending the same job.
-- Crashed or timed-out requests are marked unknown, never automatically resent.
create function public.vada_claim_reminders(p_email boolean,p_sms boolean) returns setof public.notification_jobs
language plpgsql security invoker set search_path='' as $$
begin
 update public.notification_jobs set status='unknown',error_code='worker_interrupted',updated_at=now()
 where status='sending' and claimed_at<now()-interval '5 minutes';
 insert into public.notification_jobs(event_id,user_id,channel,reminder_minutes,due_at)
 select e.id,r.user_id,c.channel,m.minutes,e.starts_at-m.minutes*interval '1 minute'
 from public.events e join public.registrations r on r.event_id=e.id
 join public.notification_preferences p on p.user_id=r.user_id
 cross join (values(1440),(30)) m(minutes) cross join(values('email'),('sms')) c(channel)
 where e.status='published' and e.starts_at>now()
 and e.starts_at-m.minutes*interval '1 minute' between now()-interval '10 minutes' and now()
 and r.joined_at<=e.starts_at-m.minutes*interval '1 minute'
 and ((c.channel='email' and p_email and p.email_enabled) or (c.channel='sms' and p_sms and p.sms_enabled and p.phone_verified_at is not null))
 on conflict(event_id,user_id,channel,reminder_minutes) do nothing;
 return query with candidates as (
 select id from public.notification_jobs where status='pending' order by due_at for update skip locked limit 20
 ) update public.notification_jobs j set status='sending',claimed_at=now(),updated_at=now()
 from candidates c where j.id=c.id returning j.*;
end $$;
revoke all on function public.vada_claim_reminders(boolean,boolean) from public,anon,authenticated;
grant execute on function public.vada_claim_reminders(boolean,boolean) to service_role;
