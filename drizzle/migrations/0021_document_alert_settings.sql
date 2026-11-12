ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS doc_alert_days integer[] NOT NULL DEFAULT '{30,15,7}',
  ADD COLUMN IF NOT EXISTS doc_required_driver text[] NOT NULL DEFAULT '{إقامة,رخصة قيادة,بطاقة سائق}',
  ADD COLUMN IF NOT EXISTS doc_required_asset text[] NOT NULL DEFAULT '{استمارة,تأمين,فحص دوري,تصريح تشغيل}';

UPDATE public.company_settings
  SET doc_alert_days = ARRAY(SELECT DISTINCT unnest(ARRAY[doc_expiry_warning_days, 15, 7]) AS d ORDER BY d DESC)
  WHERE doc_expiry_warning_days BETWEEN 1 AND 365 AND doc_expiry_warning_days <> 30;

ALTER TABLE public.company_settings
  ADD CONSTRAINT company_settings_doc_alert_days_check
  CHECK (cardinality(doc_alert_days) BETWEEN 1 AND 5 AND 0 < ALL(doc_alert_days) AND 366 > ALL(doc_alert_days));

COMMENT ON COLUMN public.company_settings.doc_expiry_warning_days IS 'DEPRECATED: replaced by doc_alert_days';