import { createFileRoute } from '@tanstack/react-router';
import RepairCenterScreen from '@/components/screens/RepairCenterScreen';

export const Route=createFileRoute('/repair-center')({validateSearch:(s:{order?:unknown}):{order?:string}=>(typeof s.order==='string'?{order:s.order}:{}),head:()=>({meta:[{title:'مركز الصيانة والورش | Shata'},{name:'description',content:'بلاغات الصيانة واعتمادها وتوجيه الأعمال للورش والفنيين ومتابعة الإصلاح والاستلام.'},{property:'og:title',content:'مركز الصيانة | Shata'},{property:'og:description',content:'الأعمال المسندة ومراحل الصيانة والموافقات وفحص الاستلام.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),component:RepairCenterScreen});
