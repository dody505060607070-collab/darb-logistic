export function isPwaBlocked(hostname:string,production:boolean,framed:boolean,off:boolean){
 const h=hostname.toLowerCase();const label=h.split('.')[0]??'';
 return !production||framed||off||h==='localhost'||h==='127.0.0.1'||['lovableproject.com','lovableproject-dev.com','beta.lovable.dev'].some(d=>h===d||h.endsWith('.'+d))||(['lovable.app','gpt-eng.com','gptengineer.run'].some(d=>h.endsWith('.'+d))&&(/^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/.test(label)||label==='project--34e7ab5b-6194-4eb4-836b-e1575047322c-dev'));
}
export async function initializePwa(){
 if(!('serviceWorker' in navigator))return;
 const blocked=isPwaBlocked(location.hostname,import.meta.env.PROD,window.self!==window.top,new URLSearchParams(location.search).get('sw')==='off');
 if(blocked){for(const r of await navigator.serviceWorker.getRegistrations()){const u=r.active?.scriptURL??r.waiting?.scriptURL??r.installing?.scriptURL;if(u&&new URL(u).pathname==='/sw.js')await r.unregister();}return;}
 await navigator.serviceWorker.register('/sw.js');
}