import{db,result,config,response}from '../_shared/backend.ts';
import{notificationConfig,notificationAvailability,SITE}from '../_shared/notifications.ts';
import{sendReminder}from '../_shared/reminder-provider.js';
Deno.serve(async req=>{
 if(req.method!=='POST')return response({error:'POST required'},405);
 try{const server=await config();if(!server.cron||req.headers.get('x-vada-cron')!==server.cron)return response({error:'Unauthorized'},401);
 const c=notificationConfig(),available=notificationAvailability(c);
 if(!available.email&&!available.sms)return response({enabled:false,processed:0});
 const jobs=await result(db.rpc('vada_claim_reminders',{p_email:available.email,p_sms:available.sms}));
 async function run(job:any){
 try{const p=await result(db.from('notification_preferences').select('*').eq('user_id',job.user_id).maybeSingle());
 const e=await result(db.from('events').select('id,title,starts_at,status').eq('id',job.event_id).maybeSingle());
 const reg=await result(db.from('registrations').select('event_id').eq('event_id',job.event_id).eq('user_id',job.user_id).maybeSingle());
 const allowed=job.channel==='email'?available.email&&p?.email_enabled:available.sms&&p?.sms_enabled&&p?.phone_verified_at;
 let outcome:any={status:'skipped',error_code:'no_longer_eligible'};
 if(allowed&&reg&&e?.status==='published'&&Date.parse(e.starts_at)>Date.now()&&Date.parse(job.due_at)>Date.now()-15*60e3){
 const {data,error}=await db.auth.admin.getUserById(job.user_id);
 if(!error&&data.user?.email_confirmed_at)outcome=await sendReminder(job,data.user.email,p.phone,e,c,SITE);
 }
 // A very fast delivery callback may already have advanced this job.
 await result(db.from('notification_jobs').update({...outcome,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','sending'));
 if(outcome.error_code==='21610')await result(db.from('notification_preferences').update({sms_enabled:false,sms_consented_at:null}).eq('user_id',job.user_id));
 }catch{await db.from('notification_jobs').update({status:'unknown',error_code:'worker_error',updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','sending')}
 }
 for(let i=0;i<jobs.length;i+=5)await Promise.all(jobs.slice(i,i+5).map(run));
 return response({enabled:true,processed:jobs.length});
 }catch{return response({error:'Reminder processing failed'},500)}
});
