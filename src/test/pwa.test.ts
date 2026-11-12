import {describe,it,expect} from 'vitest';
import {isPwaBlocked} from '@/lib/pwa';
describe('PWA registration boundaries',()=>{
 it('keeps published custom domains eligible',()=>expect(isPwaBlocked('darb.website',true,false,false)).toBe(false));
 it('blocks built main and draft previews',()=>{expect(isPwaBlocked('id-preview--abc.lovable.app',true,false,false)).toBe(true);expect(isPwaBlocked('preview-v2--abc.lovable.app',true,false,false)).toBe(true);});
 it('blocks frames, development and explicit kill switch',()=>{expect(isPwaBlocked('darb.website',true,true,false)).toBe(true);expect(isPwaBlocked('darb.website',false,false,false)).toBe(true);expect(isPwaBlocked('darb.website',true,false,true)).toBe(true);});
 it('does not block unrelated preview-looking custom domain',()=>expect(isPwaBlocked('preview-v2--shop.example.com',true,false,false)).toBe(false));
});