import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { RoomServiceClient } from 'npm:livekit-server-sdk@2.19.1';
export const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
export const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
export function response(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers})}
export class HttpError extends Error{constructor(public status:number,message:string){super(message)}}
export async function result(query:any){const {data,error}=await query;if(error)throw new HttpError(400,error.message);return data}
export async function userFor(req:Request){const token=req.headers.get('Authorization')?.replace(/^Bearer /i,'');if(!token)throw new HttpError(401,'Please sign in.');const {data,error}=await db.auth.getUser(token);if(error||!data.user||!data.user.email_confirmed_at)throw new HttpError(401,'Sign in with a verified email address.');return data.user}
export async function config(){const stored=await result(db.rpc('vada_server_config'));return {url:Deno.env.get('LIVEKIT_URL')||stored.LIVEKIT_URL,key:Deno.env.get('LIVEKIT_API_KEY')||stored.LIVEKIT_API_KEY,secret:Deno.env.get('LIVEKIT_API_SECRET')||stored.LIVEKIT_API_SECRET,cron:stored.VADA_CRON_SECRET,hostEmail:stored.VADA_HOST_EMAIL}}
export function roomService(c:any){if(!c.url||!c.key||!c.secret)throw new HttpError(503,'Video service is not configured yet.');return new RoomServiceClient(c.url.replace(/^wss:/,'https:'),c.key,c.secret)}
export async function sweep(c:any){const service=roomService(c);const rows=await result(db.from('pairings').select('id,ends_at,user_a,user_b').is('room_deleted_at',null).or(`ends_at.lte.${new Date().toISOString()},closed_at.not.is.null`).limit(100));let count=0;
 for(const p of rows){for(const id of[p.user_a,p.user_b]){try{await service.removeParticipant(`vada-${p.id}`,id)}catch{}}
 try{await service.deleteRoom(`vada-${p.id}`)}catch(e:any){if(e?.status!==404&&e?.code!=='not_found')continue}
 // Repeat cleanup through the final join-token lifetime, including early skips.
 if(Date.now()>Date.parse(p.ends_at)+15000)await result(db.from('pairings').update({room_deleted_at:new Date().toISOString()}).eq('id',p.id));count++}
 const events=await result(db.from('events').select('*').eq('status','live'));
 for(const e of events){if(Date.now()>=Date.parse(e.started_at)+e.total_rounds*(e.round_seconds+e.break_seconds)*1000)await result(db.from('events').update({status:'finished'}).eq('id',e.id).eq('status','live'))}
 return count;
}
export const safeProfile=(p:any)=>p?{id:p.id,name:p.name,age:p.age,location:p.location,education:p.education,career:p.career,star_sign:p.star_sign,pronouns:p.pronouns,bio:p.bio,interests:p.interests,intent:p.intent}:null;
export function uuid(value:any){if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new HttpError(400,'Invalid identifier.');return value}
export function text(value:any,max:number,required=true){if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))throw new HttpError(400,'Please check the text fields.');return value.trim()}
export function integer(value:any,min:number,max:number){const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw new HttpError(400,`Enter a number from ${min} to ${max}.`);return n}
