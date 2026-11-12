export type WalletMovement={id:string;kind:string;amount:number;status:string;reversalOf?:string};
export function walletTotals(entries:WalletMovement[]){
 let balance=0, pending=0, cost=0; const seen=new Set<string>();
 for(const e of entries){if(seen.has(e.id))continue;seen.add(e.id);if(e.status==='submitted'&&e.kind==='expense')pending+=Math.round(e.amount*100);
 if(e.status!=='approved')continue;const amount=Math.round(e.amount*100);const original=entries.find(x=>x.id===e.reversalOf);
 if(['opening','issue'].includes(e.kind))balance+=amount;
 if(['expense','return'].includes(e.kind))balance-=amount;
 if(e.kind==='expense')cost+=amount;
 if(e.kind==='correction'&&original){balance+=['opening','issue'].includes(original.kind)?-amount:amount;if(original.kind==='expense')cost-=amount;}}
 return {balance:balance/100,pending:pending/100,cost:cost/100};
}