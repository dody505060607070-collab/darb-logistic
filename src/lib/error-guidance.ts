export function errorGuidance(error: unknown) {
  const raw = error instanceof Error ? error.message : typeof error === 'object' && error ? String((error as { message?: string }).message ?? '') : String(error ?? '');
  const code = typeof error === 'object' && error ? (error as { code?: string }).code : undefined;
  if (/custody_one_open_per_asset/.test(raw)) return { problem: 'توجد عهدة مفتوحة لهذا الأصل.', solution: 'أكمل الإرجاع أو النقل المعتمد قبل فتح عهدة أخرى.' };
  if (/tire_one_active_mount|tire_position_one_active/.test(raw)) return { problem: 'الإطار أو موضع التركيب مستخدم بالفعل.', solution: 'سجل فك الإطار الحالي أولًا ثم أعد التركيب في الموضع الصحيح.' };
  if (/qty_on_hand/.test(raw)) return { problem: 'رصيد المخزون غير كافٍ.', solution: 'سجل استلام مخزون حقيقي أو صحح الكمية المطلوبة؛ لا يمكن صرف رصيد سالب.' };
  if (/license|licence|رخص|الرخصة/i.test(raw)) return { problem: 'تعذر التكليف بسبب بيانات رخصة السائق.', solution: 'راجع مستند الرخصة المعتمد وتاريخ انتهائه في ملف السائق، ثم أعد المحاولة.' };
  if (code === '23503' || /foreign key|مرتبط بعمليات/i.test(raw)) return { problem: 'السجل مرتبط بعمليات أخرى ولا يمكن حذفه.', solution: 'احتفظ بالسجل؛ استخدم الإيقاف أو الإلغاء المسموح بدل حذف التاريخ.' };
  if (code === '23505' || /duplicate key|مكرر/i.test(raw)) return { problem: 'القيمة مستخدمة في سجل موجود.', solution: 'ابحث عن السجل الحالي وعدّله، أو أدخل رقمًا غير مستخدم.' };
  if (/row-level security|permission denied|Forbidden|صلاحية|غير مصرح/i.test(raw)) return { problem: 'صلاحيات حسابك لا تسمح بهذه العملية.', solution: 'اطلب من الإدارة مراجعة دورك وإسناد العمل لك، ولا تستخدم حساب موظف آخر.' };
  if (/expired|رمز.*(انتهى|خاطئ)|انتهت.*جلس|Unauthorized|401/i.test(raw)) return { problem: 'تعذر التحقق من رمز الدخول أو الجلسة.', solution: 'اطلب رمزًا جديدًا وأدخل آخر رمز وصلك، أو سجل الدخول مجددًا.' };
  if (/approved|غير.*مضاف|غير.*مسجل|غير.*مصرح|معتمد.*دخول/i.test(raw)) return { problem: raw, solution: 'راجع رقم الجوال ورمز الدولة واطلب من الإدارة التأكد من إضافة حسابك وتعيين وظيفتك.' };
  if (/overlap|bookings|تعارض|محجوز/i.test(raw)) return { problem: 'المورد محجوز خلال الموعد المحدد.', solution: 'اختر سائقًا أو مركبة متاحة، أو غيّر موعد الرحلة لتجنب التعارض.' };
  if (/fetch|network|اتصال|502|503/i.test(raw)) return { problem: 'تعذر الاتصال بالخدمة.', solution: 'تحقق من الاتصال ثم أعد تحميل البيانات. إذا كنت تحفظ عملية، تحقق من وجودها قبل تكرارها.' };
  return { problem: /postgres|supabase|select |insert |update |constraint|apikey|token_hash/i.test(raw) ? 'تعذر إتمام العملية.' : raw || 'حدث خطأ غير متوقع.', solution: 'راجع الحقول المطلوبة وحالة الطلب. إذا استمرت المشكلة، أرسل اسم الصفحة ووقت المحاولة للإدارة.' };
}