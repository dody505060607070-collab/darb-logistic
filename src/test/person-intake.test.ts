import { describe, expect, it } from 'vitest';
import { intakeMissing, type IntakeFields } from '@/lib/person-intake';

const today = '2026-11-15';
const complete: IntakeFields = {
  full_name: 'خالد أحمد', phone: '0551234567', national_id: '2345678901', nationality: 'مصري', license_no: 'L-1', license_expiry: '2028-01-01',
  documents: [
    { file_index: 0, doc_type: 'إقامة', number: '2345678901', issue_date: null, expiry_date: '2027-05-01' },
    { file_index: 1, doc_type: 'رخصة قيادة', number: 'L-1', issue_date: null, expiry_date: '2028-01-01' },
    { file_index: 2, doc_type: 'بطاقة سائق', number: null, issue_date: null, expiry_date: null },
  ],
};

describe('person intake missing items', () => {
  it('a complete driver file has nothing missing', () => expect(intakeMissing('driver', complete, undefined, today)).toEqual([]));
  it('a CV with only name and phone asks a driver for identity, licence and documents', () => {
    const m = intakeMissing('driver', { full_name: 'خالد', phone: '0551234567', national_id: null, nationality: null, license_no: null, license_expiry: null, documents: [{ file_index: 0, doc_type: 'سيرة ذاتية', number: null, issue_date: null, expiry_date: null }] }, undefined, today);
    expect(m).toEqual(['رقم الهوية أو الإقامة', 'صورة الهوية أو الإقامة', 'رقم رخصة القيادة', 'تاريخ انتهاء الرخصة', 'صورة رخصة القيادة', 'صورة بطاقة سائق']);
  });
  it('an expired licence is reported as needing renewal', () => {
    const m = intakeMissing('driver', { ...complete, license_expiry: '2026-01-01', documents: complete.documents.map(d => d.doc_type === 'رخصة قيادة' ? { ...d, expiry_date: '2026-01-01' } : d) }, undefined, today);
    expect(m).toContain('رخصة القيادة منتهية — مطلوب تجديدها');
    expect(m).toContain('صورة رخصة القيادة (منتهية — مطلوب نسخة سارية)');
  });
  it('an employee only needs name, phone and identity', () => {
    expect(intakeMissing('accountant', { ...complete, license_no: null, license_expiry: null, documents: [complete.documents[0]!] }, undefined, today)).toEqual([]);
  });
  it('an invalid phone number counts as missing', () => expect(intakeMissing('accountant', { ...complete, phone: '123' }, undefined, today)).toContain('رقم جوال صحيح'));
});
