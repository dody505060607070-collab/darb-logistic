import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({owner:true,failRole:false,writes:[] as {table:string;method:string;value:unknown}[],deleted:vi.fn(),create:vi.fn()}));
vi.mock('@tanstack/react-start',()=>({createServerFn:()=>{const builder={middleware:()=>builder,inputValidator:()=>builder,handler:(fn:unknown)=>fn};return builder;}}));
vi.mock('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}}));
vi.mock('@/integrations/supabase/client.server',()=>({supabaseAdmin:{
 auth:{admin:{createUser:mocks.create,deleteUser:mocks.deleted}},
 from:(table:string)=>{
  let method='select';
  const q={select:()=>q,in:async()=>({data:[],error:null}),eq:()=>q,
   update:(value:unknown)=>{method='update';mocks.writes.push({table,method,value});return q;},
   insert:(value:unknown)=>{method='insert';mocks.writes.push({table,method,value});return q;},
   delete:()=>{method='delete';mocks.writes.push({table,method,value:null});return q;},
   single:async()=>({data:{id:'new-workshop'},error:null}),
   then:(resolve:(v:unknown)=>void)=>resolve({data:null,error:table==='user_roles'&&method==='insert'&&mocks.failRole?new Error('role failure'):null}),
  };return q;
 },
}}));
import { createEmployee } from '@/lib/employees.functions';
const input={data:{fullName:'Workshop contact',phone:'+966501234567',role:'workshop',branchId:null,workshopId:null,workshopName:'Workshop name'},context:{userId:'owner-id',supabase:{rpc:async()=>({data:mocks.owner,error:null})}}};
const run=createEmployee as unknown as (v:typeof input)=>Promise<unknown>;
describe('workshop account provisioning',()=>{
 beforeEach(()=>{mocks.owner=true;mocks.failRole=false;mocks.writes=[];mocks.create.mockReset().mockResolvedValue({data:{user:{id:'new-user'}},error:null});mocks.deleted.mockReset().mockResolvedValue({error:null});});
 it('requires administrator permission before creating the workshop or account',async()=>{mocks.owner=false;await expect(run(input)).rejects.toThrow();expect(mocks.create).not.toHaveBeenCalled();expect(mocks.writes).toHaveLength(0);});
 it('saves the workshop phone, links the account and grants only workshop role',async()=>{
  await run(input);
  expect(mocks.writes).toContainEqual({table:'workshops',method:'insert',value:{name:'Workshop name',phone:'+966501234567',branch_id:null}});
  expect(mocks.writes).toContainEqual({table:'workshop_members',method:'insert',value:{workshop_id:'new-workshop',user_id:'new-user'}});
  expect(mocks.writes.filter(w=>w.table==='user_roles')).toEqual([{table:'user_roles',method:'insert',value:{user_id:'new-user',role:'workshop'}}]);
 });
 it('removes the newly created workshop and identity if role provisioning fails',async()=>{
  mocks.failRole=true;await expect(run(input)).rejects.toThrow();expect(mocks.deleted).toHaveBeenCalledWith('new-user');expect(mocks.writes).toContainEqual({table:'workshops',method:'delete',value:null});
 });
});