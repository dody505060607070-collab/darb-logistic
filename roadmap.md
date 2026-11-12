# DARB roadmap

## شركة شتاء — طلب 2026-11-12
- [x] قراءة السجلات الثلاثة كاملة؛ تحتوي متطلبات وليست رسالة خطأ بناء فعلية. مراجعة النظام القائم دون تعديل البيانات.
- [x] إعداد خطة تحويل الهوية والحفاظ على النظام القائم بعد مراجعة فجوات الأقسام السبعة عشر؛ جدول التغطية التفصيلي ضمن التنفيذ.
- [ ] الهوية الجديدة ولوحات الأدوار والمندوب والورشة والصيانة الميدانية وصلاحيات الخادم.
- [ ] التفويضات والعهد ومحاضر التسليم والاستلام المعتمدة والفحص والصور والتوقيع والتاريخ.
- [ ] الرحلات والمحطات وإثبات التسليم والتخصيص غير المتعارض حتى تجاوز الوقت المخطط.
- [x] أساس دورة البلاغ والموافقة والتوجيه والتكلفة الإضافية والإصلاح والفحص والإغلاق: اختبارات قاعدة البيانات نجحت؛ دورة الشاشة الكاملة لم تنجح لكون المراجع مقدم البلاغ؛ الصور والقطع والمواعيد التفصيلية لم تكتمل.
- [x] أساس دفتر عهدة الصيانة وحركاته المعتمدة وتصحيحاته ومنع الخصم المكرر: اختبار 5000−1800=3200 نجح؛ الفلاتر والمراجعة الكاملة بحساب موظف لم تُختبر.
- [ ] تجهيز موصلات PetroApp وضمان المهندس والمطابقة والمزامنة ومنع التكرار والقراءات القديمة؛ التفعيل الخارجي ينتظر التوثيق والوصول الرسمي.
- [ ] محرك الموافقات متعدد المستويات والإشعارات الداخلية وتنبيهات الوثائق.
- [ ] مسودات الموبايل والمرفقات والمزامنة الآمنة ودعم PWA دون ادعاء تطبيقات متاجر.
- [ ] التقارير والفلاتر والتصدير ومصادر المؤشرات والقيم غير المتاحة.
- [ ] اختبارات الدورات الكاملة والصلاحيات والتزامن والمحاسبة والتوقيت والموبايل وتجربة الاستعادة.
- [ ] تسليم جدول التغطية وقائمة الشاشات والصلاحيات والاختبارات والمتبقي وإعدادات التشغيل وبيانات المزودين المطلوبة.
- [ ] الصورة المرجعية لشركة شتاء — المرفقات الحالية تضم صورة Traccar وصور دَرب القديمة، ولا تتضمن صورة محددة لهوية شتاء؛ الالتزام بالألوان المكتوبة حتى وصول المرجع الصحيح.

### تقدم مثبت في الدفعة الحالية
- آخر نتيجة بناء: سليم؛ 49 اختبار وحدات ناجحًا و8 اختبارات قاعدة بيانات ناجحة مع إلغاء بياناتها تلقائيًا.
- هوية شتاء والصلاحيات الجديدة وواجهة الورشة/الميداني والعهدة المالية أُضيفت؛ فحص شاشة الصيانة على 390 و1280 بكسل بلا أخطاء تشغيل أو تجاوز أفقي للصفحة.
- حفظ صور مسودة التسليم في المتصفح، إعادة القراءة بعد فتح الصفحة وعزل قوائم الحسابات اختُبرت؛ الإرسال الحقيقي للمسودة ورصيد الموظف والدورة الكاملة للسائق لم تُختبر.
- PWA مجهز للنشر فقط؛ لا تسجيل ذاكرة مؤقتة في المعاينة ولا تطبيقات متاجر؛ التثبيت والعمل دون إنترنت على الموقع المنشور لم يُختبرا ولم يحدث نشر.
- بلاغ الاختبار المرتبط بتاريخ الصيانة بقي معلّمًا «اختبار قبول معزول — غير تشغيلي»؛ منع المرجع حذف السجل، ولم يُحذف تاريخه. يجب عزله عن المؤشرات قبل التشغيل.
- التغطية التفصيلية والحالة الحالية وبيانات التشغيل في docs/shitaa-coverage.md؛ لا تعني التغطية اكتمال التنفيذ.

## Edit and delete controls 2026-11-08 06:57 UTC
- [x] Add explicit employee edit and confirmed owner-only account deletion, with server-side self-deletion protection; confirmation/cancel tested without deleting real staff.
- [x] Add explicit edit controls to branches, customers, locations, contracts, carriers, documents, authorizations, incidents and maintenance plans; allowlisted owner delete in existing entity editors. Created/deleted a temporary branch and verified absence after reload. Immutable audit and financial workflows retain their controls.
- [ ] Actual employee account deletion readback — blocked: no disposable employee account identified; real staff accounts were not deleted for testing.

## Designated administrators 2026-11-08 06:55 UTC
- [x] Reserve both requested phones for owner after verified WhatsApp sign-in; normalize existing account and confirm its owner role. Database acceptance checks confirm both reservations and service-only enforcement.
- [ ] Actual delivered-code sign-in for both designated phones — blocked: requires the phone holders to receive and enter their WhatsApp codes; no messages sent during this request.

## Current request 2026-11-08
- [x] Replace settings users list with employee directory and individual editable details/permissions pages; phone-only visible identity.
- [x] Add verification checklist: employee edit persisted after reload; 20 owner pages opened without runtime errors, mobile has no horizontal overflow; Traccar reachable with zero devices, ORS route and WhatsApp connection verified.
- [ ] Live Traccar device ingestion/readback — blocked: no devices exist in the configured provider account.
- [ ] Exhaustive acceptance of every operation under actual staff roles — blocked: no identified staff-role test accounts/session supplied; owner page smoke checks are not full business-flow verification.

## Current request 2026-11-04 11:01 UTC
- [ ] WhatsApp-only login and removal of SMS/email/Google — blocked: unsupported Cloud Auth method; do not remove final working sign-in.
- [x] Show company WhatsApp linked number and owner-only confirmed disconnect/relink; authenticated readback and confirmation cancellation tested. Actual logout/relink intentionally not executed to avoid disrupting the live company number.
- [ ] Map verified phone identity to pre-authorized staff role / identify عبد الرحمن محمد administrator — blocked: unsupported WhatsApp auth and missing identified administrator account.

## Current request 2026-11-04 10:52 UTC
- [x] Phone-first SMS sign-in UI with country selection and email fallback; native OTP verification and international validation tested.
- [x] Preserve existing role permissions and restricted pending screen for unknown numbers; auth-created profiles retain phone numbers.
- [x] CRM home extension retaining dashboards: customer directory, sales stages, editable opportunities, follow-ups, contact log, weighted forecasts; calculation tests pass.
- [ ] SMS activation and real delivered-code login — blocked: user must configure Phone auth service in More → Users → Auth settings → Phone.
- [ ] Authenticated CRM create/edit/readback verification — blocked: no session for requesting user and multiple auth accounts; user must sign in or identify the test account.

## Done
- [x] Packages 1–5 core: login, roles/invites, dashboard, ops room, order wizard, trips, tracking, fleet, drivers, custody & inspection, documents & authorizations, maintenance/tires/stock, fuel/expenses/advances, finance/invoices/payments, customers/contracts/carriers, incidents, reports, settings/audit, driver mobile app with offline outbox and POD.

- [x] Phone GPS from driver app, role home pages + page guards, page/number animations, mobile pass on login

## Open
- [ ] Full ZIP line-by-line audit, new images, skeletons, signed-in mobile check per role — continue next turn

## Open (blocked on user)
- [ ] GPS provider integration — needs provider name, API docs, key
- [ ] E-invoicing (ZATCA) / accounting provider — needs provider account
- [ ] SMS/WhatsApp alerts — needs provider, templates, recipients
- [ ] Truck routing/ETA provider — needs provider with truck restrictions
- [ ] CSV import with column mapping — waiting for user's real data files
- [ ] Replace sample reference data with real fleet, drivers, customers, contracts
- [ ] Signed-in end-to-end check — needs the owner account to be created first

## Improvements batch (2026-11-03)
- [x] Global search Ctrl+K + Alt+1..9 page shortcuts
- [x] Sidebar counters (pending expenses, open incidents, open work orders)
- [x] Excel (CSV) + PDF print on every table
- [x] Morning summary hero with 3D truck on dashboard
- [x] Installable app (manifest + icon)
- [ ] Reports charts (revenue, fuel, cost/km)
- [ ] Drag & drop assignment in operations room
- [ ] Letterhead print for POD / invoice
- [ ] Branch-scoped data per user
- [ ] Offline-capable driver app (service worker)

## Batch 2026-11-04
- [x] Tasks page (assign, urgent 12h / normal 24h reminders, submit, Super Admin confirm)
- [x] Activity page (sign-in/out, actions per person per day)
- [x] AI morning report daily 08:00 Riyadh + "generate now"
- [x] Role preview moved to small sidebar picker with "شكل فقط" banner
- [ ] WhatsApp sending of tasks/reminders — blocked: WhatsApp gateway (Hostinger) details
- [x] Role home pages for dispatcher, accountant, maintenance, fleet supervisor (driver keeps its own app)

## Batch 2026-11-04 (b)
- [x] Fix chat: opening a private chat crashes the page
- [x] Click-through check of every page and main button, per role
- [x] Driver app preview for Super Admin with sample look (no real data)
- [x] WhatsApp server link panel: status, QR, test message (secrets WHATSAPP_SERVER_URL/INSTANCE/KEY)
- [ ] Auto-send tasks/reminders from the WhatsApp number — blocked: user must add server details and scan QR first

## Free integrations (requested 2026-11-04)
- [x] Integrations tab shows live WhatsApp status and free provider options with links
- [x] Remove SMS wording from phone login (WhatsApp channel)
- [ ] Truck routing via OpenRouteService — blocked: user must create free API key
- [ ] GPS devices via Traccar — blocked: user must provide Traccar server URL/token
- [ ] ZATCA sandbox, accounting (Odoo/Zoho) (Naql removed by user) — blocked: user choice + official accounts

- [ ] Remove email sign-in from login (blocked: WhatsApp/phone login code must be working first, otherwise everyone is locked out)
- [ ] Verify OpenRouteService + Traccar connections after keys are saved
