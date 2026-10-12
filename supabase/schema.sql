-- Browser roles can read published event listings only. All personal-data
-- operations go through authenticated Edge Functions, with service-only RPCs.
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null check (length(name) between 1 and 80),
 age integer not null check(age between 18 and 100),
 location text not null check(length(location) between 1 and 100),
 education text not null default '', career text not null default '', star_sign text not null default '',
 pronouns text not null default 'he/him', bio text not null default '' check(length(bio)<=500),
 interests text[] not null default '{}', intent text not null default 'Dating and seeing where it goes',
 min_age integer not null default 18 check(min_age>=18), max_age integer not null default 100 check(max_age<=100),
 consent_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(min_age<=max_age)
);
create table public.hosts(user_id uuid primary key references auth.users(id) on delete cascade);
create table public.events (
 id uuid primary key default gen_random_uuid(), title text not null check(length(title) between 1 and 120),
 description text not null default '' check(length(description)<=2000), location text not null default 'UK-wide',
 starts_at timestamptz not null, min_age int not null default 18 check(min_age>=18),max_age int not null default 100 check(max_age<=100),
 capacity int not null default 20 check(capacity between 2 and 40),round_seconds int not null default 180 check(round_seconds between 30 and 600),
 break_seconds int not null default 30 check(break_seconds between 15 and 120),total_rounds int not null default 5 check(total_rounds between 1 and 10),
 status text not null default 'draft' check(status in('draft','published','live','finished','cancelled')),
 started_at timestamptz, host_id uuid not null references auth.users(id),created_at timestamptz not null default now(),check(min_age<=max_age)
);
create index events_starts on public.events(status,starts_at);
create table public.registrations(event_id uuid references public.events(id) on delete cascade,user_id uuid references public.profiles(id) on delete cascade,checked_in_at timestamptz,joined_at timestamptz not null default now(),primary key(event_id,user_id));
create index registrations_user on public.registrations(user_id);
create table public.pairings(id uuid primary key default gen_random_uuid(),event_id uuid not null references public.events(id) on delete cascade,round_number int not null check(round_number>0),user_a uuid not null references public.profiles(id),user_b uuid not null references public.profiles(id),starts_at timestamptz not null,ends_at timestamptz not null,closed_at timestamptz, room_deleted_at timestamptz,check(user_a<user_b),check(ends_at>starts_at),unique(event_id,user_a,user_b));
create index pairings_active on public.pairings(ends_at) where room_deleted_at is null;
create index pairings_a on public.pairings(user_a,event_id);
create index pairings_b on public.pairings(user_b,event_id);
create table public.round_assignments(event_id uuid references public.events(id) on delete cascade,round_number int not null,user_id uuid references public.profiles(id),pairing_id uuid references public.pairings(id) on delete cascade,primary key(event_id,round_number,user_id));
create index assignments_pairing on public.round_assignments(pairing_id);
create table public.decisions(pairing_id uuid references public.pairings(id) on delete cascade,user_id uuid references public.profiles(id),keep_in_touch boolean not null,created_at timestamptz not null default now(),primary key(pairing_id,user_id));
create table public.matches(id uuid primary key default gen_random_uuid(),user_a uuid references public.profiles(id),user_b uuid references public.profiles(id),created_at timestamptz not null default now(),check(user_a<user_b),unique(user_a,user_b));
create index matches_b on public.matches(user_b);
create table public.messages(id uuid primary key default gen_random_uuid(),match_id uuid not null references public.matches(id) on delete cascade,sender_id uuid not null references public.profiles(id),body text not null check(length(body) between 1 and 2000),created_at timestamptz not null default now());
create index messages_match on public.messages(match_id,created_at);
create table public.blocks(blocker uuid references public.profiles(id),blocked uuid references public.profiles(id),created_at timestamptz not null default now(),primary key(blocker,blocked),check(blocker<>blocked));
create index blocks_blocked on public.blocks(blocked);
create table public.reports(id uuid primary key default gen_random_uuid(),reporter uuid not null references public.profiles(id),reported uuid not null references public.profiles(id),pairing_id uuid references public.pairings(id),reason text not null check(length(reason) between 1 and 2000),status text not null default 'open' check(status in('open','reviewed')),created_at timestamptz not null default now());
create index reports_open on public.reports(status,created_at);
create table public.rate_limits(user_id uuid not null,bucket text not null,window_at timestamptz not null,hits int not null,primary key(user_id,bucket));
do $$ declare t text; begin foreach t in array array['profiles','hosts','events','registrations','pairings','round_assignments','decisions','matches','messages','blocks','reports','rate_limits'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop; end $$;
grant select on public.events to anon,authenticated;
create policy published_events on public.events for select to anon,authenticated using(status in('published','live','finished'));

create function public.vada_rate_limit(p_user uuid,p_bucket text,p_limit int) returns boolean language plpgsql security invoker set search_path='' as $$
declare n int; begin
 insert into public.rate_limits values(p_user,p_bucket,date_trunc('minute',now()),1)
 on conflict(user_id,bucket) do update set hits=case when rate_limits.window_at=excluded.window_at then rate_limits.hits+1 else 1 end,window_at=excluded.window_at returning hits into n;
 return n<=p_limit; end $$;

create function public.vada_register(p_user uuid,p_event uuid,p_cancel boolean default false) returns void language plpgsql security invoker set search_path='' as $$
declare e public.events; p public.profiles; begin
 select * into e from public.events where id=p_event for update;
 if e.id is null or e.status<>'published' then raise exception 'This event is not open for reservations.';end if;
 if p_cancel then delete from public.registrations where event_id=p_event and user_id=p_user;return;end if;
 if e.starts_at<now()-interval '30 minutes' then raise exception 'Reservations have closed.';end if;
 select * into p from public.profiles where id=p_user;
 if p.id is null then raise exception 'Complete your profile first.';end if;
 if p.age<e.min_age or p.age>e.max_age then raise exception 'Your age does not fit this event.';end if;
 if exists(select 1 from public.registrations where event_id=p_event and user_id=p_user) then return;end if;
 if (select count(*) from public.registrations where event_id=p_event)>=e.capacity then raise exception 'This event is full.';end if;
 insert into public.registrations(event_id,user_id) values(p_event,p_user);end $$;

create function public.vada_start(p_host uuid,p_event uuid,p_plan jsonb) returns public.events language plpgsql security invoker set search_path='' as $$
declare e public.events; r jsonb; pair jsonb; a uuid;b uuid; pid uuid; rn int:=0; start_time timestamptz; begin
 if not exists(select 1 from public.hosts where user_id=p_host) then raise exception 'Host access required.';end if;
 select * into e from public.events where id=p_event for update;
 if e.id is null or e.host_id<>p_host or e.status<>'published' then raise exception 'This event cannot be started.';end if;
 if jsonb_typeof(p_plan)<>'array' or jsonb_array_length(p_plan)<1 or jsonb_array_length(p_plan)>e.total_rounds then raise exception 'No compatible pairs are checked in.';end if;
 start_time:=now()+interval '15 seconds';
 for r in select value from jsonb_array_elements(p_plan) loop
 rn:=rn+1;
 for pair in select value from jsonb_array_elements(r) loop
 a:=least((pair->>0)::uuid,(pair->>1)::uuid);b:=greatest((pair->>0)::uuid,(pair->>1)::uuid);
 if a=b or (select count(*) from public.registrations where event_id=p_event and user_id in(a,b) and checked_in_at>now()-interval '90 seconds')<>2 then raise exception 'Check-in changed. Refresh and start again.';end if;
 if exists(select 1 from public.blocks where (blocker=a and blocked=b) or(blocker=b and blocked=a)) then raise exception 'A blocked pairing was excluded. Please retry.';end if;
 if not exists(select 1 from public.profiles pa,public.profiles pb where pa.id=a and pb.id=b and pa.age between pb.min_age and pb.max_age and pb.age between pa.min_age and pa.max_age) then raise exception 'Dating preferences changed. Please retry.';end if;
 insert into public.pairings(event_id,round_number,user_a,user_b,starts_at,ends_at) values(p_event,rn,a,b,start_time+((rn-1)*(e.round_seconds+e.break_seconds))*interval '1 second',start_time+((rn-1)*(e.round_seconds+e.break_seconds)+e.round_seconds)*interval '1 second') returning id into pid;
 insert into public.round_assignments values(p_event,rn,a,pid),(p_event,rn,b,pid);
 end loop;end loop;
 update public.events set status='live',started_at=start_time,total_rounds=rn where id=p_event returning * into e;return e;end $$;

create function public.vada_decide(p_user uuid,p_pair uuid,p_yes boolean) returns void language plpgsql security invoker set search_path='' as $$
declare p public.pairings; other_id uuid; begin
 select * into p from public.pairings where id=p_pair for update;
 if p.id is null or p_user not in(p.user_a,p.user_b) then raise exception 'Date not found.';end if;
 if now()<p.starts_at or now()>p.ends_at+interval '1 day' then raise exception 'Decisions are not open for this date.';end if;
 if exists(select 1 from public.blocks where (blocker=p.user_a and blocked=p.user_b) or(blocker=p.user_b and blocked=p.user_a)) then raise exception 'This connection is unavailable.';end if;
 insert into public.decisions(pairing_id,user_id,keep_in_touch) values(p_pair,p_user,p_yes) on conflict(pairing_id,user_id) do nothing;
 if (select count(*) from public.decisions where pairing_id=p_pair and keep_in_touch)=2 then insert into public.matches(user_a,user_b) values(p.user_a,p.user_b) on conflict(user_a,user_b) do nothing;end if;
 end $$;

create function public.vada_message(p_user uuid,p_match uuid,p_body text) returns public.messages language plpgsql security invoker set search_path='' as $$
declare m public.matches; result public.messages; begin
 select * into m from public.matches where id=p_match for update;
 if m.id is null or p_user not in(m.user_a,m.user_b) then raise exception 'Connection not found.';end if;
 if exists(select 1 from public.blocks where (blocker=m.user_a and blocked=m.user_b) or(blocker=m.user_b and blocked=m.user_a)) then raise exception 'This connection is unavailable.';end if;
 insert into public.messages(match_id,sender_id,body) values(p_match,p_user,trim(p_body)) returning * into result;return result;end $$;

create function public.vada_block(p_user uuid,p_other uuid,p_pair uuid default null,p_reason text default null) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_user=p_other then raise exception 'Invalid participant.';end if;
 if not exists(select 1 from public.pairings where (user_a=least(p_user,p_other) and user_b=greatest(p_user,p_other))) and not exists(select 1 from public.matches where user_a=least(p_user,p_other) and user_b=greatest(p_user,p_other)) then raise exception 'Participant not found.';end if;
 -- Serialize against chat writes and decisions before recording a block.
 perform 1 from public.pairings where user_a=least(p_user,p_other) and user_b=greatest(p_user,p_other) for update;
 perform 1 from public.matches where user_a=least(p_user,p_other) and user_b=greatest(p_user,p_other) for update;
 insert into public.blocks(blocker,blocked) values(p_user,p_other) on conflict do nothing;
 update public.pairings set closed_at=coalesce(closed_at,now()) where user_a=least(p_user,p_other) and user_b=greatest(p_user,p_other) and ends_at>now();
 if p_reason is not null then
 if p_pair is not null and not exists(select 1 from public.pairings where id=p_pair and user_a=least(p_user,p_other) and user_b=greatest(p_user,p_other)) then raise exception 'Invalid report date.';end if;
 insert into public.reports(reporter,reported,pairing_id,reason) values(p_user,p_other,p_pair,p_reason);end if;
 end $$;

-- No personal data RPC is callable by browser keys, even with a valid login.
do $$ declare f record; begin for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'vada_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;end $$;
