# جرد درب وخطة النقل الكامل — قراءة فقط

27 نوفمبر 2026. **هذا جرد لا إذن بالتنفيذ.** الهدف KVM 4 / Ubuntu 24.04 بحسب المالك؛ لم يُفحص VPS. n8n وكل خدمة أخرى خارج النطاق. لا تعديل تشغيل أوإرسال/pairing أوtests/build/fixtures؛وثيقةالخطة فقط.
**حي**=قراءة مجمعة؛**كود**≠تشغيل؛**مجهول**=غير متحقق. لا طلب PetroApp.

## المصدر والتشغيل
- main الحالي `82c7244`؛ آخر تغيير فعلي للتطبيق/الجسر `0786a45`. origin/main المحلي `a07e2f4`؛لايفحصGitHub. edit/ast-* تختلفبالخطط فقط.
- **Draft 1 مفتوح بتحديثات وقاعدةtest مستقلة**؛لميُفتح/يُقبل؛محتواه مجهول،المرجع main. repo `dody505060607070/darb-logistic` منالمالك؛الربط/sync branch يحتاج Project settings→Git؛remotes داخلية.
- React19/TanStack Start/Vite8؛vite.config.ts:Lovable config؛src/server.ts:fetch. dist/nitro.json الموجود(22:38UTC):**cloudflare-module**،Nitro3.0.260603-beta،server/index.mjs،nodeCompat:true.
- package.json:build=vite build؛لاstart/Dockerfile/Compose للتطبيق. preview ليس إنتاجًا. bridge Docker:Python3.12/non-root/PORT أو8080/no-access-log.
- createServerFn/JWT ثم RLS/RPC/triggers؛ `src/start.ts` يحفظ bearer/CSRF/security headers. لاagent مستقل؛HTTP jobs وبوابة خارجية.

## جدول النقل
| المكوّن | المضيف/الحالة | البيانات | النقل | العائق/الاختبار |
|---|---|---|---|---|
| التطبيق | Lovable؛Worker build | UI/server functions | Node target موثّق أو workerd وصورة مستقلة | تشغيل إنتاج وSSR/auth/CSRF |
| DB/REST/RPC | Lovable Cloud managed،Tiny/running؛PostgreSQL17.11؛نحو111MB | الأعمال/الصلاحيات/queue | export رسمي إلى backend متوافق | restore مستقل؛Postgres وحده لا يكفي |
| Auth | Cloud؛10 مستخدمين | UUIDs/identities/password hashes | export بنفس UUIDs؛إعادة إعداد المزود | مفاتيح جديدة؛OTP لكل دور |
| Storage | Cloud؛attachments private |6objects/4,858,514bytes؛حد10MiB | تنزيل/رفع بنفس المسارات | خارج DB export؛count/hash/signed URL |
| Realtime | Cloud | chat publication | خدمة وpublication الهدف | رسالة بين جلستين |
| HTTP jobs | Lovable؛6active | تقارير/GPS/إرسال/تذكيرات | scheduler للدرب فقط | جهة واحدة؛cron auth/dry-run |
| Edge Functions | لا supabase/functions بالمصدر | نشر قديم محتمل | حفظ كوده وإعداداته إن وجد | العدد المنشور مجهول؛واجهة Edge functions |
| WhatsApp | **evo.tradex1.cloud**؛open حيًا | session خارجrepo؛queue بالDB | إبقاء البوابة أو restore معتمد | المضيف/version/session storage مجهولة |
| AI | ai.gateway.lovable.dev؛كود | تقارير؛مستندات/ترجمة للمزود | استمرارية أو بديل بموافقة | openai/gpt-6-astra؛نقل السر/workability منVPS غير مثبت |
| Daman | **v20api.ewe4tech.net**؛ingestion حديث | gps_provider_vehicles/readings وروابط العهد | أسرار/جداول/job واحد | freshness/speed/idempotency |
| Traccar | **demo.traccar.org**؛secrets set | فحص devices/positions بالكود | إعداداته إن لازمة | لا ingestion مثبت؛ليس بديل Daman |
| ORS/HeiGIT | api.openrouteservice.org؛key set | trip_routes/fallback | الإعدادات والمنطق | DB:مسار straight واحد؛لا نجاح ORS/قيود شاحنات مثبتة |
| PetroApp | bridge كود؛لاsecrets/runs | stateless؛staging بالDB | Docker وHTTPS | NOT COMPLETE؛payment_status غير مثبت |

الأدلة: src/lib/*،src/routes/settings.tsx،docs/petroapp-rae-bridge-contract.md؛التفاصيل في الأقسام أدناه.

الخرائط/الخطوط: OpenFreeMap وGoogle Fonts؛Maps/wa.me روابط؛احفظ public/assets/vendor. ZATCA بطاقة وروابط وفواتيرداخلية،لاsender ظاهر.

## واتساب
**حي:** instance درب HTTP200/open و**WHATSAPP-BAILEYS**. الهوية «instance الشركة»؛لا عرضرقم/token. ليسMetaCloudAPI؛WABA خارجي ومضيف«Ubuntu الشركة» غيرمتحققين.
QR/create/logout للمالك في whatsapp.functions.ts لم تُستدعَ. apikey منenv؛session بالبوابة،التخزين/export مجهولان؛restore معتمد **لدرب فقط** أوpairing بموافقة.

**الصادر:** triggers/RPC→whatsapp_outbox→claim_whatsapp_message→gateway→provider_id/accepted. task_notifications طابور مستقل. OTP/test/notifyTripDriver مسارات مباشرة؛flushWhatsApp بعد أفعال المستخدم. إيقاف scheduler وحده لا يمنع كل الإرسال.
**وسائط:** العام نص؛المهام تدعم sendMedia بصورة signed attachments لمدة ساعة (task-notifications.server.ts:38–46). لا Meta templates ظاهرة. **الوارد:** لا receiver/callback فيrepo؛لم يظهر webhook فيmetadata، وإعداد البوابة الخارجي غير متحقق. accepted≠delivered/read.
**retry:** إرسال3ثوان/budget4.3ثوان/حتى5lanes لكلsender (outbox-budget.ts). العامة pending/failed ومحاولات<5؛4xx failed حتى السقف؛5xx/network/غيابID→unresolved بلاresend. لا backoff أُسّي عامة. المهام failed مؤجلة ساعة ولا سقف واضح فيclaim. sending أقدم من دقيقة→unresolved. enqueue dedupe دقيقتان؛الحجز الذري لا يمنع التكرار عبر قاعدتين.

### الجداول الحية، UTC
| الاسم | التوقيت | المسار |
|---|---|---|
| darb-daily-ai-report |0 5 * * *؛08:00 الرياض|/api/public/jobs/daily-report|
| shata-task-reminders |0 * * * *|/api/public/jobs/task-reminders|
| shata-whatsapp-outbox |* * * * *؛GPS→monitor→send|/api/public/jobs/whatsapp-outbox|
| shata-whatsapp-send-a/b/c |كل دقيقة؛3jobs|/api/public/jobs/whatsapp-send|
lane a/b/c لا تقسّم الصفوف؛claim ذري. عينة requests:74sender+24outbox+1reminders كلها200؛لا إثبات تسليم.

### الـ38 العالقة
**89accepted+38unresolved؛لاpending/sending/failed/cancelled حاليًا.** accepted لهاIDs؛آخر قبول24نوفمبر05:01UTC. unresolved كلها19نوفمبر،محاولة واحدة،claimed،بلاprovider_id/accepted_at:21 interrupted confirmation،16 aborted timeout،1 timeout. نتائج غامضة مجمّدة؛ربما وصلت،لا انتظار أو فشل مؤكد. لا يمكن حسمها دون تاريخ البوابة/محادثة لم تُفحص. **تُنسخ unresolved بنفسIDs؛لا حذف/resend.** task_notifications فارغ. accepted لا يعاد إرسالها؛sender واحد وقاعدة واحدة أثناءcutover.

## القاعدة وإعادة التحقق
-66public tables وكلهاRLS؛137routines منها120SECURITY DEFINER؛65public triggers+Auth trigger واحد handle_new_user.
-219public policies+3storage=**222**؛ومع2cron=224. الرقم السابق يحتاج نطاقًا لا افتراض فقد سياسات.
-94FK/91CHECK/29UNIQUE/66PK/exclusion1؛7sequences/enum1؛لاviews.
-grants على66جدولًا لـanon/authenticated/service_role تشمل SELECT/INSERT/UPDATE/DELETE وغيرها؛EXECUTE:authenticated74/service_role137/PUBLIC4. احفظACL؛sandbox_exec دورأدوات لا يُنسخ تلقائيًا.
-extensions:plpgsql،pg_stat_statements،uuid-ossp،pgcrypto،supabase_vault،btree_gist،pg_cron،pg_net.
-10Auth users؛identities email/phone. GET settings:email/Google enabled،phone غيرenabled،signup غيرdisabled. ليست دلالة على signup بواجهة درب؛UI WhatsAppOTP ثمmagiclink verification والتحقق من موظف/سائق معتمد.
-publication أعمال supabase_realtime علىpublic.chat_messages؛publication realtime.messages الأخرى نظامية.
-آخرsnapshot **40,347GPS=40,336gps_daman+11driver_app**؛38provider records؛latest sync23:17UTC. كانت40,241 ثم40,308 أثناء القراءة؛العدد يتغير حيًا.10ai_reports وآخر تاريخ27نوفمبر لا يثبتAI wording؛يحفظ الكود النص العادي أولًا. PetroApp runs/staging صفر.
-backend المعاينة والمنشور واحد؛هويته متطابقة بالأدوات/العميل،ومعرّفه/رابطه الداخلي لا يُعرضان. pooler metadata تشيرeu-west-1؛منطقة المضيف الأساسي تحتاج تأكيدًا.

## أسرار ونسخ مدعوم
13secrets configured: DAMAN_GPS_API_KEY/FLEET_ID/PASSWORD/USERNAME،ORS_API_KEY،TRACCAR_URL/EMAIL/PASSWORD،WHATSAPP_SERVER_URL/KEY/INSTANCE،LOVABLE_API_KEY،LOVABLE_CRON_SECRET (الأسماء المختصرة داخل كل مجموعة تحمل بادئتها نفسها). كودDaman يقرأAPI_KEY/FLEET_ID فقط.
SUPABASE_URL/PUBLISHABLE_KEY/SERVICE_ROLE_KEY موجودةruntime؛المفتاح الخاص وكلمة مرورDB غير متاحين للمالك عبرCloud. الهدف يحتاج مفاتيحه الجديدة،لا استخراج القديم. build:VITE_SUPABASE_URL/PUBLISHABLE_KEY/PROJECT_ID. LOVABLE_CRON_SECRET_PREVIOUS absent؛PETROAPP_RAE_BRIDGE_URL/TOKEN absent. bridge يحتاجPETROAPP_BEARER_TOKEN/FINGERPRINT/PAYMENT_STATUS_MAP وPORT؛لا إدخال الآن.

Export: **More→Database→Manage→Settings→Export project data→Database→Export→Start export**؛تنزيل من البريد/Storage. يشملschema/data/Auth/password hashes؛لاstorage bytes/secrets/provider settings/Edge code. مرة/24ساعة/backend running؛لاdump يدوي. ملفاتStorage منفصلة. تحققbackup UTC؛لم يُفحص.
تصحيحات:Auth hashes ضمنexport؛AI علىVPS غيرمتأكد وليس ممنوعًا مثبتًا؛PetroApp fuel capture موجود،الحاجزhosting/secrets/payment_status/live test؛المهام تدعم الصور. migrations ليستbackup.

## runbook وبوابات السماح
1. **قبل كتابة:** اعتمادSHA ومراجعةdraft؛backup وتحديدbackend/AI/gateway/secrets. نسخ مشفرة خارجVPS وrestore مستقل يشملmigrations/history/RPC/triggers/policies/ACL/sequences/extensions؛cron معطل.
2. **الوصول:** SSH غيرمتاح هنا. تأكيد موارد إجمالية ومنافذ مرشحة فقط؛لاdocker ps/جردworkloads/قراءةCompose أوproxy أوn8n/مواقع أخرى. مجلد/env/network/volumes للدرب فقط وportslocalhost متاحة. أي إضافةDNS/proxy للدرب تحتاج موافقة منفصلة؛لاOS updates/restart عام.
3. **كود لاحق بموافقة:** Node/workerd+start،Dockerfile/livez،scheduler auth بديل دونتعديلgenerated،backend وAI إنلزم. bridge:PORT/livez بلاtoken؛لاprobes PetroApp. container verification قبلادعاءالجاهزية.
4. **Staging:** restore UUIDs/ACL/rules وobject paths؛Auth/providers/JWT/API/redirects/Realtime. حظر إرسالOTP/direct/jobs/triggers؛fixtures معزولة.
5. **Cutover:** لاzero-downtime/CDC مثبت. إجراءfreeze لكلAPI/RPC/auth/jobs/GPS/browser writers؛المصدرrunning للتصدير. TTL لايكفي للـPWA/URLقديم. snapshot+Storage→restore/count/hash→DNS/app→jobset واحد؛export24ساعة يحكم النافذة،Lovable يبقىللرجوع.
6. **Rollback:** قبلtarget writes:إيقافالهدف ثمrouting/jobs المصدر. بعدهاfreeze/reconcile بيانات/queue/objects؛لاDNS-only/backupقديم. اعتمادRPO/RTO قبلcutover.
7. **قبول:**48ساعة مراقبةauth/GPS/queue/duplicates/TLS/resources وrestoretest؛Lovable يبقىحتىقبولالمالك.

## اختبارات مطلوبة — لم تُنفذ هنا
- unit/lint/TS/build/container وbridge pytest/mypy؛لا إثباتVPS سابق.
- auth/OTP/10أدوار/RLS/RPC/ACL/owner؛SQL testDB فقط. tests/sql/business_rules.sql وshitaa_acceptance.sql إرشاد،لاsuite كاملة.
- request→order→trip→POD→invoice/payment؛booking overlaps/duplicateclientIDs/selfreview/corrections. لاE2E كاملةمثبتة.
- upload10MiB/signedlinks/media،دردشةجلستين،GPS/routefallback،تقرير08:00/AI fallback،cronbadsecret/claim/retry/unresolved وحفظالـ38.
- PWA/IndexedDB delivery-drafts/localStorage outbox:بياناتمتصفح ليستDBexport؛حفظorigin/IDs،لاclearstorage أعمى.

**العوائق:** SSH،gateway/session،EdgeFunctions،Auth/region/secrets/AI،freeze/RPO/RTO/ports/DNS/TLS؛لا نشر.

SMTP/SMS التفصيلي مجهول؛الواجهة WhatsAppOTP وليست SMS.
