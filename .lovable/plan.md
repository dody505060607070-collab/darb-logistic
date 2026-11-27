# جرد نقل درب إلى Hostinger VPS (قراءة فقط) — 27 نوفمبر 2026

النطاق: درب فقط. لا فحص ولا لمس لـ n8n أو أي موقع آخر. لم تُغيَّر بيانات أو أسرار أو DNS، ولم يُرسل أي واتساب.

## 1) واتساب من البداية للنهاية
- المزود: بوابة ذاتية الاستضافة على نمط Evolution API، **خارج هذا المستودع وخارج Lovable Cloud**. المضيف: نطاق فرعي تحت `tradex1.cloud` (الاسم الكامل محجوب). الإرسال: `POST {WHATSAPP_SERVER_URL}/message/sendText/{WHATSAPP_INSTANCE}` (`src/lib/whatsapp-outbox.server.ts:37`). ليس WhatsApp Cloud API من Meta ولا موصّل Lovable.
- الهوية: اسم instance في السر `WHATSAPP_INSTANCE`، ورقم المرسل مرتبط بجلسة QR داخل البوابة. لا يوجد WABA.
- الجلسة/QR: تُحفظ داخل خادم البوابة الخارجي، لا في قاعدة درب. يدير التطبيق الاتصال وQR وقطع الاتصال عبر دوال owner فقط في `src/lib/whatsapp.functions.ts`.
- الوارد: لا يوجد webhook وارد في المستودع؛ النظام يرسل فقط. المسارات العامة كلها مهام مجدولة: `src/routes/api/public/jobs/{whatsapp-outbox,whatsapp-send,task-reminders,daily-report}.ts`.
- الطابور: triggers تكتب في `whatsapp_outbox` (الأعمدة: event, entity_id, phone, body, state, provider_id, attempts, error, claimed_at, accepted_at)، وكذلك `task_notifications`. الحجز ذري؛ النتيجة الغامضة تصبح `unresolved` ولا يُعاد إرسالها (السطور 20 و42 و46)؛ أخطاء 4xx تصبح `failed`. لا dead-letter منفصل؛ `unresolved` هي قائمة المراجعة اليدوية.
- الجدولة: 6 جداول HTTP نشطة: daily-report `0 5 * * *` (08:00 الرياض)، task-reminders كل ساعة، whatsapp-outbox كل دقيقة، وثلاثة مسارات إرسال a/b/c كل دقيقة. التوثيق بـ `LOVABLE_CRON_SECRET` (`src/integrations/supabase/cron-auth.ts`)، وهو سر مُدار من Lovable.
- لا قوالب ولا وسائط؛ نص فقط.
- النقل: إذا بقيت البوابة مكانها فلا حاجة لإعادة الربط، ويكفي نقل الأسرار الثلاثة. إذا نُقلت البوابة إلى الـ VPS، فقد يمكن نسخ مجلد تخزين instances في Evolution لكن ذلك غير مؤكد؛ **الافتراض الآمن: إعادة مسح QR.**
- منع التكرار: لا يعمل مُرسِلان معًا أبدًا؛ أوقف جداول الإرسال في المصدر قبل تفعيلها في الهدف، وانقل الطابور بحالته. صفوف `unresolved` لا تُعاد تلقائيًا.

### حالة الصفوف العالقة (تم التحقق الآن)
- 89 `accepted` (19–24 نوفمبر، آخر قبول 24 نوفمبر 05:01 UTC)، و38 `unresolved` كلها بتاريخ 19 نوفمبر، محاولة واحدة، محجوزة، بلا provider_id:
  - 21 «انقطع تأكيد الإرسال»: بقيت في `sending` أكثر من 60 ثانية.
  - 16 «aborted due to timeout» و1 «timed out»: مهلة على البوابة.
- الخلاصة: الـ 38 **نتيجتها غامضة**، لا معلّقة ولا فاشلة مؤكدًا؛ ربما وصل بعضها. لا يوجد أي صف جديد بعد 24 نوفمبر، فلا شيء ينتظر الإرسال. القرار المطلوب: أرشفة أو تعليم يدوي، لا إعادة إرسال.
- `task_notifications`: لا صفوف.

## 2) جدول المكوّنات

| المكوّن | المضيف الحالي | البيانات/الحالة | طريقة النقل | العوائق | اختبار التحقق |
|---|---|---|---|---|---|
| تطبيق الويب (SSR + server functions) | استضافة Lovable (Cloudflare Worker) | بلا حالة | بناء Node أو حاوية workerd | preset `cloudflare-module`، لا start script ولا Dockerfile | تطابق الصفحات لكل دور على staging |
| قاعدة البيانات Postgres 17.11 | Lovable Cloud (ref kcccawepjomcggqxtjwx)، 111 MB | 66 جدولًا، 137 دالة، 65 trigger، 219 policy في public + 3 في storage | Export من Lovable (More → Database → Manage → Settings → Export data)؛ dump كامل بالأدوار والـ grants غير متاح لنا | لا استيراد في Lovable؛ كلمة مرور القاعدة غير متاحة | مقارنة العدادات وRLS و`tests/sql/business_rules.sql` |
| Auth | Lovable Cloud | 10 مستخدمين؛ مزودات email وphone | نقل المستخدمين والهويات بنفس المعرّفات | تصدير auth غير مؤكد؛ الدخول OTP مخصص عبر واتساب ثم رابط magiclink من admin API | دخول OTP لكل دور |
| Storage | Lovable Cloud | bucket `attachments` خاص؛ 6 ملفات (~4.7 MB) | تنزيل/رفع بنفس المسارات | أداة النسخ | فتح مرفق برابط موقّع |
| Realtime | Lovable Cloud | publication على `chat_messages` | إعادة تعريفها في الهدف | يحتاج خادم realtime | رسالة دردشة حية |
| المهام المجدولة | Lovable HTTP schedules | 6 جداول | cron على الـ VPS بسر جديد | `LOVABLE_CRON_SECRET` مُدار ولا يُنقل | تشغيل جاف والإرسال متوقف |
| Edge Functions | — | لا يوجد `supabase/functions` | — | — | — |
| واتساب | بوابة Evolution خارجية (tradex1.cloud) | الجلسة في البوابة؛ الطابور في القاعدة | نقل الأسرار؛ QR إن نُقلت البوابة | مكان البوابة ومالكها غير معروفين | رسالة لرقم اختبار بموافقة |
| Lovable AI Gateway | ai.gateway.lovable.dev | لا شيء | يحتاج مزودًا بديلًا | `LOVABLE_API_KEY` لا يعمل خارج Lovable | التقرير اليومي والترجمة وقراءة المستندات |
| ضمان المهندس GPS | مزود خارجي | 40,308 قراءة في `gps_readings` | نقل الأسرار | — | سرعة حية غير صفرية |
| Traccar | demo.traccar.org | لا شيء | سر | خادم تجريبي عام | فحص التكامل |
| OpenRouteService | api.openrouteservice.org | لا شيء | سر | — | حساب مسار |
| PetroApp bridge | غير منشور | لا شيء | Docker على الـ VPS | التقاط RAE وأسرار `PETROAPP_*` غير موجودة | `/livez` ثم `/health` |
| خريطة OpenFreeMap | عامة | لا شيء | بلا تغيير | — | عرض الخريطة |
| بريد/SMS | لا يوجد | — | — | — | — |

الأسرار (أسماء فقط، كلها مضبوطة): DAMAN_GPS_API_KEY, DAMAN_GPS_FLEET_ID, DAMAN_GPS_PASSWORD, DAMAN_GPS_USERNAME, LOVABLE_API_KEY (مُدار), LOVABLE_CRON_SECRET (مُدار), ORS_API_KEY, TRACCAR_EMAIL, TRACCAR_PASSWORD, TRACCAR_URL, WHATSAPP_INSTANCE, WHATSAPP_SERVER_KEY, WHATSAPP_SERVER_URL. الكود لا يقرأ DAMAN_GPS_USERNAME/PASSWORD.

الإضافات: plpgsql, pg_stat_statements, uuid-ossp, pgcrypto, supabase_vault, btree_gist (لازمة لقيد عدم التداخل), pg_cron, pg_net.

## 3) مراجعة أرقام التدقيق السابق
- 66 جدولًا، 137 دالة، 65 trigger، 10 مستخدمين، 6 ملفات، 6 جداول، واتساب 89/38: **صحيحة**.
- السياسات: **219** في public + 3 في storage (الرقم 222 السابق كان الإجمالي).
- GPS: **40,308** (كانت 40,241؛ استيعاب حي مستمر).

## 4) التشغيل
- البناء: `@lovable.dev/vite-tanstack-config` ← nitro `cloudflare-module`؛ المدخل `src/server.ts` (معالج fetch بنمط worker)؛ PWA عبر vite-plugin-pwa.
- لا يوجد start script ولا Dockerfile ولا health route للتطبيق.
- متغيرات العميل: VITE_SUPABASE_URL/PUBLISHABLE_KEY/PROJECT_ID. الخادم: الأسرار أعلاه + اتصال admin بالـ backend (`client.server.ts`).
- Realtime يتصل من المتصفح مباشرة بالـ backend.
- تغييرات التماثل المطلوبة: (أ) preset `node-server` أو workerd + start script؛ (ب) Dockerfile و`/livez`؛ (ج) مُجدول بديل بسر جديد؛ (د) بديل لـ AI؛ (هـ) عند نقل القاعدة: Supabase مستضاف ذاتيًا أو مُدار يشمل Auth وStorage وRealtime وREST.

## 5) المراحل
0. **الآن:** قرار مكان القاعدة (إبقاؤها على Lovable Cloud ونقل الويب فقط أقل خطرًا، أو نقل كامل)؛ مزود AI؛ مصير الـ 38.
1. **يحتاج SSH:** فحوص قراءة فقط (منافذ، موارد، Docker، الـ proxy) دون لمس n8n؛ شبكة Docker مستقلة، منفذ localhost مخصص، ملف env منفصل.
2. **Build بموافقة:** التغييرات (أ–د) في draft أو فرع؛ `main` بلا تغيير.
3. **Staging:** نطاق تجريبي، إرسال واتساب **معطل**، أسرار منفصلة، اختبارات تماثل (دخول كل دور، الطلب→الفوترة على بيانات وهمية، GPS، المرفقات، الدردشة، التقرير dry-run).
4. **نقل القاعدة (إن اختير):** export/import بنفس المعرّفات، ثم مقارنة العدادات وRLS واختبار business_rules.
5. **التحويل:** خفض TTL مسبقًا؛ إيقاف جداول Lovable؛ تحويل DNS لـ darb.website؛ تفعيل جداول الـ VPS؛ يبقى Lovable live للرجوع.
6. **التراجع:** إعادة DNS وتفعيل جداول Lovable، مع ضمان ألا يعمل مُرسِلان معًا.
7. **بعد التحويل:** مراقبة 48 ساعة للطابور والأخطاء وGPS.

## 6) الفروع والمصدر المعتمد
- `main` عند `a07e2f4` هو **المصدر المعتمد**؛ origin/main عند `2125f9d` (المنصة تدفع لاحقًا).
- فروع `edit/ast-*` الثلاثة لا تحمل commits إضافية على `main`؛ يوجد `_bound-first/source` على origin. لم يُدمج أو يُقبل شيء. GitHub غير ظاهر من هنا.

## نقاط غير معروفة
مكان بوابة واتساب الفعلي ومن يديرها؛ قابلية تصدير جلستها؛ قابلية تصدير Auth بكلمات السر؛ منطقة القاعدة؛ بديل AI؛ موارد الـ VPS الحرة.
