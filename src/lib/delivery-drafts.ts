import { openDB } from 'idb';
import { supabase } from '@/integrations/supabase/client';
import { db,uploadFile } from './db';
import { validateAttachment } from './files';
export type DeliveryDraft={id:string;userId:string;tripId:string;payload:Record<string,unknown>;files:File[];paths?:string[];status:'pending'|'rejected';error?:string};
async function store(){return openDB('shitaa-driver-drafts',1,{upgrade(db){db.createObjectStore('delivery',{keyPath:'id'});}});}
export async function saveDeliveryDraft(draft:DeliveryDraft){draft.files.forEach(validateAttachment);const s=await store();await s.put('delivery',draft);window.dispatchEvent(new Event('shitaa-delivery-drafts'));}
export async function deliveryDrafts(userId:string):Promise<DeliveryDraft[]>{const s=await store();return (await s.getAll('delivery')).filter(d=>d.userId===userId);}
export async function retryDeliveryDraft(id:string,userId:string){const s=await store();const d:DeliveryDraft|undefined=await s.get('delivery',id);if(!d||d.userId!==userId)return;await s.put('delivery',{...d,status:'pending',error:undefined});return syncDeliveryDrafts();}
let flushing=false;
export async function syncDeliveryDrafts(){
 if(flushing||!navigator.onLine)return 0;flushing=true;
 try{const {data}=await supabase.auth.getUser();if(!data.user)return 0;let count=0;const s=await store();
 for(const d of await deliveryDrafts(data.user.id)){if(d.status!=='pending')continue;try{const paths=d.paths??[];for(let i=paths.length;i<d.files.length;i++){const f=d.files[i];if(!f)continue;paths.push(await uploadFile(f,`pod/${d.tripId}`));d.paths=paths;await s.put('delivery',d);}const {error}=await db.rpc('submit_delivery',{...d.payload,p_photos:paths,p_client_ref:d.id});if(error)throw error;await s.delete('delivery',d.id);count++;}catch(e){const message=e instanceof Error?e.message:String((e as {message?:string}).message??e);if(!navigator.onLine||/fetch|network/i.test(message))break;await s.put('delivery',{...d,status:'rejected',error:message});}}
 window.dispatchEvent(new Event('shitaa-delivery-drafts'));return count;
 }finally{flushing=false;}
}