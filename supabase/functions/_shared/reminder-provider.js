export function reminderCopy(event,minutes,site){
 const when=new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'}).format(new Date(event.starts_at))+' (UK time)';
 return{eventName:event.title,eventTime:when,reminderLabel:minutes===1440?'tomorrow':'in 30 minutes',joinUrl:`${site}/#/room/${event.id}`,preferencesUrl:`${site}/#/notifications`};
}
export async function sendReminder(job,email,phone,event,c,site,fetcher=fetch){
 const v=reminderCopy(event,job.reminder_minutes,site);let url,options;
 if(job.channel==='email'){
 url='https://app.loops.so/api/v1/transactional';options={method:'POST',headers:{Authorization:`Bearer ${c.loopsKey}`,'Content-Type':'application/json','Idempotency-Key':job.id},body:JSON.stringify({email,transactionalId:c.template,addToAudience:false,dataVariables:v})};
 }else{
 url=`https://api.twilio.com/2010-04-01/Accounts/${c.sid}/Messages.json`;options={method:'POST',headers:{Authorization:`Basic ${btoa(c.sid+':'+c.token)}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({To:phone,MessagingServiceSid:c.messaging,Body:`Vada Meet: your event is ${v.reminderLabel}, ${v.eventTime}. Join: ${v.joinUrl} Sign in to your account. Reply STOP to opt out.`,StatusCallback:c.callback,ValidityPeriod:'300'})};
 }
 try{const r=await fetcher(url,{...options,signal:AbortSignal.timeout(10000)});const data=await r.json();
 if(r.ok&&(job.channel==='sms'?!!data.sid:data.success===true))return{status:'accepted',provider_id:data.sid||null,error_code:null};
 // Ambiguous responses are not resent: a carrier may already have accepted the SMS.
 return{status:r.status>=500||r.status===409?'unknown':'failed',error_code:String(data.code||`http_${r.status}`),provider_id:null};
 }catch{return{status:'unknown',error_code:'provider_response_unknown',provider_id:null}}
}
export async function validTwilioSignature(url,params,signature,token){
 if(!signature||!token)return false;
 const body=url+[...new Set(params.keys())].sort().map(k=>[...new Set(params.getAll(k))].sort().map(v=>k+v).join('')).join('');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(token),{name:'HMAC',hash:'SHA-1'},false,['sign']);
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body)));
 const expected=btoa(String.fromCharCode(...bytes));if(expected.length!==signature.length)return false;let difference=0;for(let i=0;i<expected.length;i++)difference|=expected.charCodeAt(i)^signature.charCodeAt(i);return difference===0;
}
