grant usage on schema auth to service_role;
grant select(id,email_confirmed_at,created_at) on auth.users to service_role;
create function public.vada_host_analytics(p_host uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare output jsonb;
begin
 if not exists(select 1 from public.hosts where user_id=p_host) then raise exception 'Host access required';end if;
 select jsonb_build_object(
 'signups',(select count(*) from auth.users),
 'verified',(select count(*) from auth.users where email_confirmed_at is not null),
 'profiles',(select count(*) from public.profiles),
 'recent_signups',(select count(*) from auth.users where created_at>=now()-interval '7 days'),
 'reservations',(select count(*) from public.registrations r join public.events e on e.id=r.event_id where e.host_id=p_host),
 'events',(select count(*) from public.events where host_id=p_host),
 'locations',(select coalesce(jsonb_agg(t order by t.count desc,t.label),'[]'::jsonb) from(select lower(trim(location)) as label,count(*) as count from public.profiles group by lower(trim(location)) order by count(*) desc limit 12)t),
 'intentions',(select coalesce(jsonb_agg(t order by t.count desc,t.label),'[]'::jsonb) from(select intent as label,count(*) as count from public.profiles group by intent)t),
 'age_groups',(select coalesce(jsonb_agg(t order by t.label),'[]'::jsonb) from(select case when age<25 then '18–24' when age<35 then '25–34' when age<45 then '35–44' when age<55 then '45–54' else '55+' end as label,count(*) as count from public.profiles group by 1)t),
 'interests',(select coalesce(jsonb_agg(t order by t.count desc,t.label),'[]'::jsonb) from(select lower(trim(i)) as label,count(distinct p.id) as count from public.profiles p cross join lateral unnest(p.interests)i group by lower(trim(i)) order by count(distinct p.id) desc limit 12)t),
 'age_preferences',(select coalesce(jsonb_agg(t order by t.label),'[]'::jsonb) from(select case when max_age-min_age<=10 then 'Up to 10-year range' when max_age-min_age<=20 then '11–20-year range' else 'Over 20-year range' end as label,count(*) as count from public.profiles group by 1)t),
 'signup_trend',(select jsonb_agg(t order by t.day) from(select to_char(d.day,'DD Mon') as label,d.day,count(u.id) as count from generate_series(date_trunc('day',now())-interval '6 days',date_trunc('day',now()),interval '1 day')d(day) left join auth.users u on u.created_at>=d.day and u.created_at<d.day+interval '1 day' group by d.day)t)
 ) into output;
 return output;
end $$;
revoke all on function public.vada_host_analytics(uuid) from public,anon,authenticated;
grant execute on function public.vada_host_analytics(uuid) to service_role;
