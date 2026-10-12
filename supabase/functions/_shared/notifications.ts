import{db,result,HttpError}from './backend.ts';
export const SITE='https://vada-meet.awakesage65.chatgpt.site';
export function notificationConfig(){const env=(s:string)=>Deno.env.get(s)||'';return{
 enabled:env('VADA_NOTIFICATIONS_ENABLED')==='true',loopsKey:env('LOOPS_API_KEY'),template:env('LOOPS_REMINDER_TEMPLATE_ID'),
 sid:env('TWILIO_ACCOUNT_SID'),token:env('TWILIO_AUTH_TOKEN'),messaging:env('TWILIO_MESSAGING_SERVICE_SID'),verify:env('TWILIO_VERIFY_SERVICE_SID'),
 callback:`${Deno.env.get('SUPABASE_URL')}/functions/v1/vada-twilio`
}}
export function notificationAvailability(c=notificationConfig()){return{email:c.enabled&&!!c.loopsKey&&!!c.template,sms:c.enabled&&!!c.sid&&!!c.token&&!!c.messaging&&!!c.verify}}
export async function twilioVerify(path:string,body:Record<string,string>){const c=notificationConfig();if(!notificationAvailability(c).sms)throw new HttpError(503,'SMS reminders are not connected yet.');const r=await fetch(`https://verify.twilio.com/v2/Services/${c.verify}/${path}`,{method:'POST',headers:{Authorization:`Basic ${btoa(c.sid+':'+c.token)}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body),signal:AbortSignal.timeout(10000)});const data=await r.json();if(!r.ok)throw new HttpError(400,'Unable to verify this number. Check the number or code and try again later.');return data}
export async function notificationAction(action:string,input:any,user:any){
 const get=()=>result(db.from('notification_preferences').select('*').eq('user_id',user.id).maybeSingle());
 if(action==='notification-settings')return{preferences:await get(),available:notificationAvailability()};
 if(action==='notification-save'){
 const previous=await get();if(typeof input.email_enabled!=='boolean'||typeof input.sms_enabled!=='boolean')throw new HttpError(400,'Choose your reminder preferences.');
 if(input.sms_enabled&&(!previous?.phone_verified_at||!previous?.phone))throw new HttpError(400,'Verify your phone number first.');
 const now=new Date().toISOString();await result(db.from('notification_preferences').upsert({...previous,user_id:user.id,email_enabled:input.email_enabled,email_consented_at:input.email_enabled?(previous?.email_consented_at||now):null,sms_enabled:input.sms_enabled,sms_consented_at:input.sms_enabled?(previous?.sms_consented_at||now):null,updated_at:now}));return{ok:true};
 }
 if(action==='notification-phone-start'){
 if(input.consent!==true)throw new HttpError(400,'Confirm that you want an SMS verification code.');
 const phone=typeof input.phone==='string'?input.phone.replace(/[ ()-]/g,''):'';
 if(!/^\+[1-9]\d{7,14}$/.test(phone))throw new HttpError(400,'Use an international phone number, for example +447700900123.');
 // Limit paid verification sends per verified account: one a minute and three a day.
 for(const [bucket,limit]of[['verify-minute',1],[`verify-day-${new Date().toISOString().slice(0,10)}`,3]] as const){
 if(bucket.startsWith('verify-day')){const {count,error}=await db.from('notification_verify_attempts').select('id',{count:'exact',head:true}).eq('user_id',user.id).gte('created_at',new Date().toISOString().slice(0,10));if(error)throw new Error('Verification quota unavailable');if((count||0)>=limit)throw new HttpError(429,'Please try again tomorrow.');}
 else if(!await result(db.rpc('vada_rate_limit',{p_user:user.id,p_bucket:bucket,p_limit:limit})))throw new HttpError(429,'Please wait a minute before requesting another code.');
 }
 await result(db.from('notification_verify_attempts').insert({user_id:user.id}));
 await twilioVerify('Verifications',{To:phone,Channel:'sms'});
 const previous=await get();await result(db.from('notification_preferences').upsert({...previous,user_id:user.id,phone,phone_verified_at:null,sms_enabled:false,sms_consented_at:null,updated_at:new Date().toISOString()}));return{ok:true};
 }
 if(action==='notification-phone-check'){
 if(!await result(db.rpc('vada_rate_limit',{p_user:user.id,p_bucket:'verify-check',p_limit:5})))throw new HttpError(429,'Please wait before trying another code.');
 const previous=await get();if(!previous?.phone||typeof input.code!=='string'||!/^\d{4,10}$/.test(input.code))throw new HttpError(400,'Request a code first, then enter it here.');
 const data=await twilioVerify('VerificationCheck',{To:previous.phone,Code:input.code});if(data.status!=='approved')throw new HttpError(400,'That code is not valid.');
 await result(db.from('notification_preferences').update({phone_verified_at:new Date().toISOString()}).eq('user_id',user.id).eq('phone',previous.phone));return{ok:true};
 }
 if(action==='notification-phone-remove'){await result(db.from('notification_preferences').update({phone:null,phone_verified_at:null,sms_enabled:false,sms_consented_at:null,updated_at:new Date().toISOString()}).eq('user_id',user.id));return{ok:true}}
 throw new HttpError(400,'Unknown notification action.');
}
