# نقل Darb بالكامل إلى Hostinger — حزمة مرشحة

**الحالة: حزمة إعداد/نشر مرشحة فقط. لم يتم نقل الإنتاج أو تشغيل أي حاوية على VPS.**  
المصدر المعتمد للتطوير يبقى Lovable. هذا الفرع منفصل عن main، ولا يُدمج تلقائيًا.

## المعمارية المستهدفة

- Lovable: تعديل الكود ومراجعته.
- GitHub: حفظ النسخة وتشغيل الاختبارات والبناء.
- Hostinger: تشغيل تطبيق Darb وSupabase self-hosted (Postgres/Auth/REST/Realtime/Storage) وEvolution API وPetroApp bridge والمهام المجدولة.
- Daman GPS وOpenRouteService يظلان مزودين خارجيين؛ لا يمكن نقل أنظمة المزود نفسها إلى VPS.
- كل خدمات Darb في Compose project اسمه `darb-logistic-prod` وشبكة/Volumes مستقلة، ومنافذ الخدمات المنشورة مربوطة على loopback فقط. لا يوجد `container_name` ثابت في الخدمات التي يضيفها Darb، ولا يتم لمس n8n أو أي موقع آخر.

## الملفات

- `Dockerfile`: تطبيق TanStack Start بنمط Nitro Node.
- `ops/hostinger/prepare-supabase.sh`: يجلب Docker setup الرسمي لـ Supabase عند commit مثبت، ويزيل أسماء الحاويات الثابتة ويقيد منافذ API/DB على loopback. يولد أسرار Supabase محليًا ولا يبدأ الحاويات.
- `ops/hostinger/compose.darb.yml`: يضيف التطبيق والـ bridge وEvolution API وقاعدة/Redis خاصة بهما إلى شبكة Supabase نفسها/شبكة Darb خاصة.
- `ops/hostinger/start-supabase.sh`: يبدأ خدمات Supabase فقط حتى يمكن استيراد البيانات؛ لا يبدأ التطبيق أو WhatsApp أو PetroApp أو الجدولة.
- `ops/hostinger/start-stack.sh`: لا يبدأ التطبيق إلا بعد وضع `DARB_DATA_IMPORT_COMPLETE=YES` عقب التحقق من استيراد DB/Auth/Storage. لا يستخدم `down` أو prune أو حذف Volumes.
- `ops/hostinger/backup.sh`: نسخة مشفرة تشمل قاعدة Supabase وملفات Storage وقاعدة/جلسات Evolution وملفات الإعداد السرية. يتطلب `backup.env` محميًا.
- `ops/hostinger/petroapp-smoke.sh`: اختبار `/livez` ثم `/health` الحقيقي للـ PetroApp (قراءة فقط) بعد إضافة بيانات المصدر.
- `ops/hostinger/deploy-app.sh`: يحدّث خدمة التطبيق وحدها، ويتحقق من /api/health ويرجع لصورة التطبيق السابقة عند الفشل.
- `ops/hostinger/scheduler`: جدولة UTC، لكنها غير مفعلة افتراضيًا. حتى تذكيرات المهام التي ترسل WhatsApp تتطلب `DARB_ENABLE_WHATSAPP_SENDING=true` مع تفعيل profile الجدولة.
- `ops/hostinger/proxy`: مثال Nginx فقط، غير مثبت وغير مفعّل تلقائيًا.

## CI/CD والتحديثات المستقبلية

ملف `.github/workflows/hostinger-deploy.yml` يشغّل الاختبارات والبناء وفحص Compose واختبارات PetroApp bridge. بعد دمج الفرع في `main` وإعداد GitHub variables/secrets، يؤدي كل push إلى `main` إلى بناء صور GHCR ونشر التطبيق والـ bridge فقط. لا يعيد تشغيل قاعدة البيانات أو Evolution أو الجلسة أو DNS.

- فعّل `HOSTINGER_DEPLOY_ENABLED=true` فقط بعد اكتمال النقل والاختبارات.
- GitHub variables: `DARB_VITE_SUPABASE_URL`, `DARB_VITE_SUPABASE_PUBLISHABLE_KEY`, `DARB_VITE_SUPABASE_PROJECT_ID`.
- GitHub secrets: `HOSTINGER_SSH_HOST`, `HOSTINGER_SSH_USER`, `HOSTINGER_SSH_KEY`, `HOSTINGER_SSH_KNOWN_HOSTS`, `HOSTINGER_DEPLOY_PATH`, `GHCR_USERNAME`, `GHCR_READ_TOKEN`.
- تغييرات `drizzle/migrations` تتوقف افتراضيًا. لا تُطبق تلقائيًا إلا بعد تفعيل `DARB_AUTO_MIGRATE=true` وإعداد `backup.env`؛ حينها ينشئ النشر نسخة مشفرة أولًا ثم يشغل migration image. لا يوجد rollback تلقائي لتغييرات قاعدة البيانات.
- `DARB_ENABLE_SCHEDULED_JOBS` و`DARB_ENABLE_WHATSAPP_SENDING` يظلان false حتى cutover ومراجعة الطابور.

## ما لم يُنقل بعد

1. قاعدة Lovable Cloud/Auth/Storage الحالية لم تُصدّر أو تُستورد. يجب استخدام مسار التصدير الرسمي من Lovable، ثم اختبار الاستعادة في بيئة معزولة قبل القطع.
2. جلسة WhatsApp الحالية خارج المستودع. لا نعرف إصدار Evolution أو طريقة تصدير الجلسة. لا تُفعّل إرسالًا ولا تعِد إرسال 38 رسالة ذات نتيجة غامضة. يلزم نسخ session مدعوم من المصدر أو إعادة pairing بـ QR بعد موافقة المالك.
3. PetroApp bridge موجود بالكود، لكن لا توجد بيانات اعتماد RAE في الحزمة. اختبارات CI و`/livez` تثبت تشغيل العملية فقط؛ يلزم `PETROAPP_BEARER_TOKEN` و`PETROAPP_FINGERPRINT` وmapping دقيق للحالات قبل اختبار `/health` الحقيقي.
4. AI Gateway الحالي تابع لـ Lovable. أضيف adapter قابل للتهيئة لمزود OpenAI Responses API؛ يلزم `AI_API_KEY` و`AI_MODEL` ويفضل `AI_API_BASE_URL` على Hostinger. لا تُعتبر وظائف AI جاهزة حتى الاختبار الحقيقي.
5. الدومينات والمنافذ وreverse proxy وSSH key غير مثبتة. لا تُفعّل proxy snippet قبل جرد الموجود على VPS.

## إعداد آمن لاحقًا

1. نفّذ جرد VPS للقراءة فقط أولًا، مع اختيار منافذ loopback غير مستخدمة، دون فحص/تعديل خدمات أخرى.
2. جهّز مجلد `/opt/darb` للنسخة البرمجية ومجلدي `/opt/darb/config` و`/opt/darb/supabase` فقط، ثم شغّل `prepare-supabase.sh`. لا يبدأ أي container.
3. شغّل `start-supabase.sh` بعد اختيار منافذ loopback غير مستخدمة؛ هذا يبدأ Supabase فقط، ثم صدّر واستورد بيانات Lovable واختبرها. لا تبدأ التطبيق قبل اكتمال هذا الجزء.
4. أدخل دومينات Darb/اتصال Auth وSMTP ومفاتيح الخدمات في ملفات خارج Git بصلاحية 600.
5. طابق إصدار Evolution مع الخادم الحالي وخذ backup موثقًا لجلسة WhatsApp وقاعدة Evolution قبل أي انتقال.
6. استورد قاعدة البيانات والمستخدمين والتخزين إلى Supabase الجديد في بيئة معزولة، وقارن RLS/RPC/Triggers/IDs والملفات.
7. اختبر Darb وPetroApp على staging مع تعطيل كل وظائف الإرسال والجدولة.
8. بعد موافقة المالك فقط: ضع `DARB_DATA_IMPORT_COMPLETE=YES` ثم شغّل التطبيق، اختبر تسجيل الدخول والملفات وRealtime وGPS والتقارير وPetroApp عبر `petroapp-smoke.sh`، ثم نفّذ cutover مع rollback جاهز.
9. فعّل الجدولة بعد التحقق، ثم فعّل إرسال WhatsApp كخطوة منفصلة.

## CI/CD المقصود

بعد اكتمال النقل وملء GitHub Actions secrets/variables، يُبنى image immutable لكل commit. عند تفعيل المتغير `HOSTINGER_DEPLOY_ENABLED=true)، يتصل GitHub عبر SSH بمفتاح نشر مخصص ويحدّث خدمة `app` فقط. لا يحدّث قاعدة البيانات أو Evolution أو الجلسة أو DNS مع كل تعديل كود.

المتغيرات المطلوبة في GitHub تُوثّق في workflow. لا تحفظ مفاتيح أو بيانات قاعدة البيانات في Git.
