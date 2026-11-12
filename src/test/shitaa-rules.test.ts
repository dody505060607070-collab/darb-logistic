import { describe,it,expect } from 'vitest';
import { walletTotals } from '@/lib/wallet';
import { maintenanceActions } from '@/lib/maintenance-flow';
import { roleHome } from '@/components/darb/AppShell';
import { validateAttachment,MAX_ATTACHMENT_BYTES } from '@/lib/files';
describe('Shitaa operating rules',()=>{
 it('5000 issued less 1800 approved leaves 3200',()=>expect(walletTotals([{id:'issue',kind:'issue',amount:5000,status:'approved'},{id:'expense',kind:'expense',amount:1800,status:'approved'}])).toEqual({balance:3200,pending:0,cost:1800}));
 it('rejected spending does not reduce the balance',()=>expect(walletTotals([{id:'issue',kind:'issue',amount:5000,status:'approved'},{id:'reject',kind:'expense',amount:1800,status:'rejected'}]).balance).toBe(5000));
 it('duplicate spending does not reduce twice',()=>expect(walletTotals([{id:'issue',kind:'issue',amount:5000,status:'approved'},{id:'spend',kind:'expense',amount:1800,status:'approved'},{id:'spend',kind:'expense',amount:1800,status:'approved'}]).balance).toBe(3200));
 it('issue is not maintenance cost',()=>expect(walletTotals([{id:'issue',kind:'issue',amount:5000,status:'approved'}]).cost).toBe(0));
 it('submitted spending is separate',()=>expect(walletTotals([{id:'issue',kind:'issue',amount:5000,status:'approved'},{id:'pending',kind:'expense',amount:1800,status:'submitted'}])).toEqual({balance:5000,pending:1800,cost:0}));
 it('workshop cannot approve or close its work',()=>{expect(maintenanceActions('review',false)).not.toContain('approved');expect(maintenanceActions('ready_delivery',false)).not.toContain('closed');});
 it('only approved work may be assigned',()=>{expect(maintenanceActions('review',true)).not.toContain('assigned');expect(maintenanceActions('approved',true)).toContain('assigned');});
 it('workshop and field staff land on assigned jobs',()=>{expect(roleHome(['workshop'])).toBe('/repair-center');expect(roleHome(['field_maintenance'])).toBe('/repair-center');});
 it('representative lands in mobile workflow',()=>expect(roleHome(['representative'])).toBe('/driver'));
 it('attachment limit is 10MiB and executable types rejected',()=>{expect(MAX_ATTACHMENT_BYTES).toBe(10485760);expect(()=>validateAttachment({size:10485761,type:'application/pdf'})).toThrow();expect(()=>validateAttachment({size:1,type:'text/html'})).toThrow();expect(()=>validateAttachment({size:10485760,type:'application/pdf'})).not.toThrow();});
});