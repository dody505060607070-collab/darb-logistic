import { createFileRoute } from '@tanstack/react-router';
import { MapPin } from 'lucide-react';
import { LegalLayout } from '@/components/darb/LegalLayout';
import { CONTACT_LOCATION, legalHead } from '@/lib/legal';

export const Route = createFileRoute('/contact')({ head: () => ({ ...legalHead('التواصل وموقع الشركة', 'موقع Shata في الرياض، المملكة العربية السعودية.', '/contact'), scripts: [{ type: 'application/ld+json', children: JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: 'Shata', url: 'https://darb.website', address: { '@type': 'PostalAddress', addressLocality: 'Riyadh', addressCountry: 'SA' } }) }] }), component: Contact });
function Contact() { return <LegalLayout title="التواصل وموقع الشركة"><div className="flex items-center gap-3 border-b py-4"><MapPin className="size-6 text-gold" /><address className="not-italic">{CONTACT_LOCATION.city}، {CONTACT_LOCATION.country}</address></div><p>للمساعدة في حسابك أو تكليفاتك، تواصل مع إدارة الشركة عبر المحادثة الداخلية بعد تسجيل الدخول.</p><p className="text-muted-foreground">العنوان التفصيلي ورقم التواصل الرسمي لم يُضافا بعد.</p></LegalLayout>; }