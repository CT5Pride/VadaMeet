import{createClient}from'@supabase/supabase-js';import{SUPABASE_URL,SUPABASE_KEY}from'./config';
export const supabase=createClient(SUPABASE_URL,SUPABASE_KEY);
export async function api(action,input={}){const{data,error}=await supabase.functions.invoke('vada-api',{body:{action,input}});if(error){let message=error.message;try{message=(await error.context.json()).error||message}catch{}throw new Error(message)}if(data?.error)throw new Error(data.error);return data}
export async function events(){const{data,error}=await supabase.from('events').select('*').in('status',['published','live']).order('starts_at');if(error)throw error;return data}
