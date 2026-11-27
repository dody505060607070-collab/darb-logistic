# نقل Darb بالكامل إلى Hostinger — حزمة مرشحة

**الحالة: حزمة إعداد/نشر مرشحة فقط. لم يتم نقل الإنتاج أو تشغيل أي حاوية على VPS.**  
المصدر المعتمد للتطوير يبقى Lovable. هذا الفرع منفصل عن main، ولا يُدمج تلقائيًا.

## المعمارية المستهدفة

- Lovable: تعديل الكود ومراجعته.
- GitHub: حفظ النسخة وتشغيل الاختبارات والبناء.
- Hostinger: تشغيل تطبيق Darb وSupabase self-hosted (Postgres/Auth/REST/Realtime/Storage) وEvolution API وPetroApp bridge والمهام المجدولة.
- Daman GPS وOpenRouteService يظلان مزودين خارجيين؛ لا يمكن نقل أنظمة المزود نفسها إلى VPS.
- كل خدمات Darb في Compose project اسمه `darb` وشبكة/Volumes مستقلة. لا يوجد `container_name` ثابت في الخدمات التي يضيفها Darb، ولا يتم لمس n8n أو أي موقع آخر.

## الملفات

- `Dockerfile`: تطبيق TanStack Start بنمط Nitro Node.
- `ops/hostinger/prepare-supabase.sh`: يجلب Docker setup الرسمي لـ Supabase عند commit مثبت، ويزيل أسماء الحاويات الثابتة ويقيد منافذ API/DB على loopback. يولد أسرار Supabase محليًا ولا يبدأ الحاويات.
- `ops/hostinger/compose.darb.yml`: يضيف التطبيق والـ bridge وEvolution API وقاعدة/Redis خاصة بهما إلى شبكة Supabase نفسها/شبكة Darb خاصة.
- `ops/hostinger/start-stack.sh`: لا يعمل إلا بتأكيد صريح، ويتحقق من المتغيرات والمنافذ قبل `up -d`. لا يستخدم `down` أو prune أو حذف Volumes.
- `ops/hostinger/deploy-app.sh`: يحدّث خدمة التطبيق وحدها، ويتحقق من /api/health ويرجع لصورة التطبيق السابقة عند الفشل.
- `ops/hostinger/scheduler`: جدولة UTC، لكنها معطلة افتراضيًا عبر Compose profile وبـ flags إضافية. لا تُرسل WhatsApp حتى تفعيل صريح.
- `ops/hostinger/proxy`: مثال Nginx فقط، غير مثبت وغير مفعّل تلقائيًا.

## ما لم يُنقل بعد

1. قاعدة Lovable Cloud/Auth/Storage الحالية لم تُصدّر أو تُستورد. يجب استخدام مسار التصدير الرسمي من Lovable، ثم اختبار الاستعادة في بيئة معزولة قبل القطع.
2. جلسة WhatsApp الحالية خارج المستودع. لا نعرف إصدار Evolution أو طريقة تصدير الجلسة. لا تُفعّل إرسالًا ولا تعِد إرسال 38 رسالة ذات نتيجة غامضة. يلزم نسخ session مدعوم من المصدر أو إعادة pairing بـ QR بعد موافقة المالك.
3. PetroApp bridge موجود بالكود، لكن لا توجد بيانات اعتماد RAE في الحزمة. اختبارات محلية/CI لا تثبت اتصال المصدر الحقيقي.
4. AI Gateway الحالي تابع لـ Lovable. يلزم مزود Responses API متوافق ومفتاح API وموديل محدد على Hostinger. لا تُعتبر وظائف AI جاهزة حتى الاختبار الحقيقي.
5. الدومينات والمنافذ وreverse proxy وSSH key غير مثبتة. لا تُفعّل proxy snippet قبل جرد الموجود على VPS.

## إعداد آمن لاحقًا

1. نفّذ جرد VPS للقراءة فقط أولًا، مع اختيار منافذ loopback غير مستخدمة، دون فحص/تعديل خدمات أخرى.
2. جهّز مجلدات `/opt/darb` فقط، ثم شغّل `prepare-supabase.sh`. لا يبدأ أي container.
3. أدخل دومينات Darb/اتصال Auth وSMTP ومفاتيح الخدمات في ملفات خارج Git بصلاحية 600.
4. طابق إصدار Evolution مع الخادم الحالي وخذ backup موثقًا لجلسة WhatsApp وقاعدة Evolution قبل أي انتقال.
5. استورد قاعدة البيانات والمستخدمين والتخزين إلى Supabase الجديد في بيئة معزولة، وقارن RLS/RPC/Triggers/IDs والملفات.
6. اختبر Darb وPetroApp على staging مع تعطيل كل وظائف الإرسال والجدولة.
7. بعد موافقة المالك فقط: شغّل الخدمات، اختبر تسجيل الدخول والملفات وRealtime وGPS والتقارير وPetroApp، ثم نفّذ cutover مع rollback جاهز.
8. فعّل الجدولة بعد التحقق، ثم فعّل إرسال WhatsApp كخطوة منفصلة.

## CI/CD المقصود

بعد اكتمال النقل وملء GitHub Actions secrets/variables، يُبنى image immutable لكل commit. عند تفعيل المتغير `HOSTINGER_DEPLOY_ENABLED=true)، يتصل GitHub عبر SSH بمفتاح نشر مخصص ويحدّث خدمة `app` فقط. لا يحدّث قاعدة البيانات أو Evolution أو الجلسة أو DNS مع كل تعديل كود.

المتغيرات المطلوبة في GitHub تُوثّق في workflow. لا تحفظ مفاتيح أو بيانات قاعدة البيانات في Git.
