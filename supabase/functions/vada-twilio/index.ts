import{db,result}from '../_shared/backend.ts';
import{notificationConfig}from '../_shared/notifications.ts';
import{validTwilioSignature}from '../_shared/reminder-provider.js';
Deno.serve(async req=>{
 if(req.method!=='POST')return new Response('POST required',{status:405});
 try{const c=notificationConfig();if(!c.token)return new Response('Not configured',{status:503});
 if(Number(req.headers.get('content-length'))>20000)return new Response('Too large',{status:413});
 const params=new URLSearchParams(await req.text());
 if(!await validTwilioSignature(c.callback,params,req.headers.get('x-twilio-signature'),c.token)||params.get('AccountSid')!==c.sid)return new Response('Unauthorized',{status:401});
 // Advanced Opt-Out remains enabled in Twilio so STOP takes effect at the provider too.
 if(params.get('OptOutType')==='STOP'||/^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)$/i.test((params.get('Body')||'').trim())){
 await result(db.from('notification_preferences').update({sms_enabled:false,sms_consented_at:null,updated_at:new Date().toISOString()}).eq('phone',params.get('From')));
 }
 const sid=params.get('MessageSid'),status=params.get('MessageStatus');
 if(sid&&['delivered','failed','undelivered'].includes(status||''))await result(db.from('notification_jobs').update({status:status==='delivered'?'delivered':'failed',error_code:params.get('ErrorCode'),updated_at:new Date().toISOString()}).eq('provider_id',sid).neq('status','delivered'));
 return new Response('<Response/>',{headers:{'Content-Type':'text/xml'}});
 }catch{return new Response('Callback processing failed',{status:500})}
});
