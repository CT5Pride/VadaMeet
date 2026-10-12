import { AccessToken } from 'npm:livekit-server-sdk@2.19.1';
import { db,headers,response,HttpError,result,userFor,config,roomService,sweep,safeProfile,uuid,text,integer } from '../_shared/backend.ts';
import { scheduleRounds,pairKey,phaseAt } from '../_shared/pairing.js';
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return response({error:'POST required'},405);
 try{
 const user=await userFor(req);if(Number(req.headers.get('content-length'))>16000)throw new HttpError(413,'Request too large.');
 const body=await req.json();const action=body.action;const input=body.input||{};
 if(!await result(db.rpc('vada_rate_limit',{p_user:user.id,p_bucket:'api',p_limit:100})))throw new HttpError(429,'Please wait a moment and try again.');
 if(action==='me'){const c=await config();if(c.hostEmail&&user.email?.toLowerCase()===c.hostEmail.toLowerCase())await result(db.from('hosts').upsert({user_id:user.id}));}
 const host=!!(await result(db.from('hosts').select('user_id').eq('user_id',user.id).maybeSingle()));
 const requireHost=()=>{if(!host)throw new HttpError(403,'Host access required.')};
 const pairFor=async(id:string)=>{const p=await result(db.from('pairings').select('*').eq('id',uuid(id)).or(`user_a.eq.${user.id},user_b.eq.${user.id}`).maybeSingle());if(!p)throw new HttpError(404,'Date not found.');return p};
 const blocked=async(a:string,b:string)=>!!(await result(db.from('blocks').select('blocker').or(`and(blocker.eq.${a},blocked.eq.${b}),and(blocker.eq.${b},blocked.eq.${a})`).limit(1))).length;
 if(action==='me')return response({profile:await result(db.from('profiles').select('*').eq('id',user.id).maybeSingle()),host,registrations:await result(db.from('registrations').select('event_id,checked_in_at').eq('user_id',user.id))});
 if(action==='profile'){
 if(input.consent!==true)throw new HttpError(400,'Confirm the community agreement.');
 const p={id:user.id,name:text(input.name,80),age:integer(input.age,18,100),location:text(input.location,100),education:text(input.education||'',120,false),career:text(input.career||'',120,false),star_sign:text(input.star_sign||'',20,false),pronouns:text(input.pronouns||'',30,false),bio:text(input.bio||'',500,false),intent:text(input.intent,80),min_age:integer(input.min_age,18,100),max_age:integer(input.max_age,18,100),interests:(Array.isArray(input.interests)?input.interests:[]).slice(0,12).map((s:any)=>text(s,40).toLowerCase()),updated_at:new Date().toISOString()};if(p.min_age>p.max_age)throw new HttpError(400,'Preferred age range is reversed.');
 await result(db.from('profiles').upsert(p));return response({ok:true})}
 if(action==='register'){await result(db.rpc('vada_register',{p_user:user.id,p_event:uuid(input.event_id),p_cancel:input.cancel===true}));return response({ok:true})}
 if(action==='check-in'){
 const e=await result(db.from('events').select('status,starts_at').eq('id',uuid(input.event_id)).single());
 if(!['published','live'].includes(e.status)||Date.now()<Date.parse(e.starts_at)-30*60e3)throw new HttpError(400,'Check-in opens 30 minutes before the event.');
 const row=await result(db.from('registrations').update({checked_in_at:new Date().toISOString()}).eq('event_id',input.event_id).eq('user_id',user.id).select('event_id'));if(!row.length)throw new HttpError(403,'Reserve a place first.');return response({ok:true})}
 if(action==='event-state'){
 const eventId=uuid(input.event_id);const reg=await result(db.from('registrations').select('event_id').eq('event_id',eventId).eq('user_id',user.id).maybeSingle());if(!reg)throw new HttpError(403,'Reserve a place first.');
 const e=await result(db.from('events').select('*').eq('id',eventId).single());const now=Date.now();const phase=phaseAt(e,now);
 if(['published','live'].includes(e.status))await result(db.from('registrations').update({checked_in_at:new Date(now).toISOString()}).eq('event_id',eventId).eq('user_id',user.id));
 const pairs=await result(db.from('pairings').select('*').eq('event_id',eventId).or(`user_a.eq.${user.id},user_b.eq.${user.id}`).order('round_number'));
 let active=pairs.find((p:any)=>p.round_number===phase.round)||null;let partner=null;
 if(active){const other=active.user_a===user.id?active.user_b:active.user_a;if(await blocked(user.id,other)){active={...active,closed_at:active.closed_at||new Date().toISOString()}}else partner=safeProfile(await result(db.from('profiles').select('*').eq('id',other).single()))}
 const decisions=await result(db.from('decisions').select('pairing_id,keep_in_touch').eq('user_id',user.id).in('pairing_id',pairs.map((p:any)=>p.id).length?pairs.map((p:any)=>p.id):['00000000-0000-4000-8000-000000000000']));
 return response({event:e,...phase,server_now:now,pairing:active,partner,decisions,past_pairs:pairs.filter((p:any)=>Date.parse(p.starts_at)<=now).map((p:any)=>({id:p.id,round_number:p.round_number,ends_at:p.ends_at}))})}
 if(action==='token'){
 const p=await pairFor(input.pairing_id);const now=Date.now();const e=await result(db.from('events').select('status').eq('id',p.event_id).single());
 if(e.status!=='live'||p.closed_at||now<Date.parse(p.starts_at)||now>=Date.parse(p.ends_at)-1000||await blocked(p.user_a,p.user_b))throw new HttpError(403,'This video round is not open.');
 const c=await config(),service=roomService(c),room=`vada-${p.id}`;await service.createRoom({name:room,maxParticipants:2,emptyTimeout:30,departureTimeout:10});
 const latest=await pairFor(p.id);if(latest.closed_at||Date.now()>=Date.parse(latest.ends_at)-1000||await blocked(p.user_a,p.user_b)){await service.deleteRoom(room);throw new HttpError(403,'This round has closed.');}
 const token=new AccessToken(c.key,c.secret,{identity:user.id,ttl:Math.max(1,Math.min(10,Math.floor((Date.parse(p.ends_at)-Date.now())/1000)))});token.addGrant({roomJoin:true,room,canPublish:true,canSubscribe:true,canPublishData:false,canPublishSources:['camera','microphone']});
 return response({token:await token.toJwt(),url:c.url,ends_at:p.ends_at})}
 if(action==='decide'){if(typeof input.yes!=='boolean')throw new HttpError(400,'Choose yes or no.');await result(db.rpc('vada_decide',{p_user:user.id,p_pair:uuid(input.pairing_id),p_yes:input.yes}));return response({ok:true})}
 if(action==='skip'){const p=await pairFor(input.pairing_id);await result(db.from('pairings').update({closed_at:new Date().toISOString()}).eq('id',p.id));try{await roomService(await config()).deleteRoom(`vada-${p.id}`)}catch{}return response({ok:true})}
 if(action==='block'){await result(db.rpc('vada_block',{p_user:user.id,p_other:uuid(input.user_id),p_pair:input.pairing_id?uuid(input.pairing_id):null,p_reason:input.reason?text(input.reason,2000):null}));await sweep(await config());return response({ok:true})}
 if(action==='matches'){
 const ms=await result(db.from('matches').select('*').or(`user_a.eq.${user.id},user_b.eq.${user.id}`).order('created_at',{ascending:false}));const list=[];for(const m of ms){const other=m.user_a===user.id?m.user_b:m.user_a;if(!await blocked(user.id,other))list.push({...m,partner:safeProfile(await result(db.from('profiles').select('*').eq('id',other).single()))})}return response({matches:list})}
 if(action==='messages'||action==='send'){
 const id=uuid(input.match_id);const m=await result(db.from('matches').select('*').eq('id',id).or(`user_a.eq.${user.id},user_b.eq.${user.id}`).maybeSingle());if(!m||await blocked(m.user_a,m.user_b))throw new HttpError(403,'Connection unavailable.');
 if(action==='send'){if(!await result(db.rpc('vada_rate_limit',{p_user:user.id,p_bucket:'messages',p_limit:12})))throw new HttpError(429,'Please wait before sending another message.');await result(db.rpc('vada_message',{p_user:user.id,p_match:id,p_body:text(input.body,2000)}))}
 return response({messages:await result(db.from('messages').select('*').eq('match_id',id).order('created_at',{ascending:false}).limit(100))})}
 if(action==='host-data'){requireHost();return response({events:await result(db.from('events').select('*').eq('host_id',user.id).order('starts_at',{ascending:false})),reports:await result(db.from('reports').select('*').eq('status','open').order('created_at',{ascending:false})),video_configured:!!(await config()).secret})}
 if(action==='create-event'){requireHost();const starts=new Date(input.starts_at);if(!Number.isFinite(starts.getTime())||starts.getTime()<Date.now()-60000)throw new HttpError(400,'Choose a future start time.');const e={host_id:user.id,title:text(input.title,120),description:text(input.description||'',2000,false),location:text(input.location||'UK-wide',100),starts_at:starts.toISOString(),min_age:integer(input.min_age,18,100),max_age:integer(input.max_age,18,100),capacity:integer(input.capacity,2,40),round_seconds:integer(input.round_seconds,30,600),break_seconds:30,total_rounds:integer(input.total_rounds,1,10),status:'published'};if(e.min_age>e.max_age)throw new HttpError(400,'Age range is reversed.');return response({event:await result(db.from('events').insert(e).select().single())})}
 if(action==='host-event'){requireHost();const e=await result(db.from('events').select('*').eq('id',uuid(input.event_id)).eq('host_id',user.id).single());const regs=await result(db.from('registrations').select('user_id,checked_in_at,profiles(name,age,interests)').eq('event_id',e.id));return response({event:e,registrations:regs,server_now:Date.now()})}
 if(action==='start-event'){requireHost();const e=await result(db.from('events').select('*').eq('id',uuid(input.event_id)).eq('host_id',user.id).single());await roomService(await config()).listRooms([]);
 const regs=await result(db.from('registrations').select('user_id,profiles(*)').eq('event_id',e.id).gt('checked_in_at',new Date(Date.now()-90e3).toISOString()));const people=regs.map((r:any)=>r.profiles);const ids=people.map((p:any)=>p.id);const bs=ids.length?await result(db.from('blocks').select('blocker,blocked').in('blocker',ids).in('blocked',ids)):[];const plan=scheduleRounds(people,e.total_rounds,new Set(bs.map((b:any)=>pairKey(b.blocker,b.blocked))));return response({event:await result(db.rpc('vada_start',{p_host:user.id,p_event:e.id,p_plan:plan}))})}
 if(action==='end-event'){requireHost();const e=await result(db.from('events').select('*').eq('id',uuid(input.event_id)).eq('host_id',user.id).single());await result(db.from('events').update({status:e.status==='live'?'finished':'cancelled'}).eq('id',e.id));await result(db.from('pairings').update({closed_at:new Date().toISOString()}).eq('event_id',e.id).is('closed_at',null));await sweep(await config());return response({ok:true})}
 if(action==='review-report'){requireHost();await result(db.from('reports').update({status:'reviewed'}).eq('id',uuid(input.report_id)));return response({ok:true})}
 throw new HttpError(400,'Unknown action.');
 }catch(e){if(e instanceof HttpError)return response({error:e.message},e.status);console.error('Vada request failed:',e instanceof Error?e.name:'unknown');return response({error:'We could not complete that request. Please try again.'},500)}
});
