-- Driver licence uploaded as a document is the source of truth for the trip licence check.
CREATE OR REPLACE FUNCTION public.sync_driver_license() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE did uuid := coalesce(NEW.entity_id, OLD.entity_id);
BEGIN
  IF coalesce(NEW.entity_type, OLD.entity_type)='driver' AND coalesce(NEW.doc_type, OLD.doc_type) LIKE '%رخص%' THEN
    UPDATE drivers d SET
      license_expiry = coalesce((SELECT max(expiry_date) FROM documents x WHERE x.entity_type='driver' AND x.entity_id=did AND x.doc_type LIKE '%رخص%' AND x.review_status<>'rejected'), d.license_expiry),
      license_no = coalesce(d.license_no, (SELECT number FROM documents x WHERE x.entity_type='driver' AND x.entity_id=did AND x.doc_type LIKE '%رخص%' AND x.number IS NOT NULL ORDER BY expiry_date DESC NULLS LAST LIMIT 1))
    WHERE d.id=did;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.sync_driver_license() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER documents_sync_license AFTER INSERT OR UPDATE OR DELETE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.sync_driver_license();

UPDATE public.drivers d SET license_expiry = s.exp
FROM (SELECT entity_id, max(expiry_date) exp FROM public.documents WHERE entity_type='driver' AND doc_type LIKE '%رخص%' AND review_status<>'rejected' GROUP BY entity_id) s
WHERE s.entity_id=d.id AND s.exp IS NOT NULL AND (d.license_expiry IS NULL OR d.license_expiry < s.exp);

-- Daily critical alerts: expiring documents/licences, due maintenance, unresolved critical defects, low stock.
CREATE OR REPLACE FUNCTION public.generate_critical_alerts() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int := 0; r record; horizon int; nid uuid; k text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_staff(auth.uid()) THEN RAISE EXCEPTION 'ليست لديك صلاحية'; END IF;
  SELECT coalesce((SELECT max(x) FROM unnest(doc_alert_days) x), 30) INTO horizon FROM company_settings LIMIT 1;
  horizon := coalesce(horizon, 30);
  FOR r IN
    SELECT 'doc:'||x.id AS key, CASE WHEN x.expiry_date < current_date THEN 'critical' WHEN x.expiry_date <= current_date+7 THEN 'critical' ELSE 'warning' END sev, 'documents' cat,
      CASE WHEN x.expiry_date < current_date THEN 'منتهي: ' ELSE 'قارب على الانتهاء: ' END || x.doc_type || ' — ' || coalesce(d.full_name, a.code, 'الشركة') AS title,
      format('ينتهي في %s (باقي %s يوم)', x.expiry_date, x.expiry_date-current_date) body, x.entity_type et, x.entity_id eid, d.phone dphone, x.expiry_date-current_date AS left_days
    FROM documents x LEFT JOIN drivers d ON x.entity_type='driver' AND d.id=x.entity_id LEFT JOIN assets a ON x.entity_type='asset' AND a.id=x.entity_id
    WHERE x.expiry_date IS NOT NULL AND x.expiry_date <= current_date+horizon AND x.review_status<>'rejected'
    UNION ALL
    SELECT 'mplan:'||p.id, 'warning', 'maintenance', 'صيانة دورية مستحقة: '||p.title||' — '||a.code,
      format('آخر تنفيذ %s، كل %s يوم', p.last_done_at, p.interval_days), 'asset', p.asset_id, NULL, (p.last_done_at+p.interval_days)-current_date
    FROM maintenance_plans p JOIN assets a ON a.id=p.asset_id
    WHERE p.interval_days IS NOT NULL AND p.last_done_at IS NOT NULL AND p.last_done_at+p.interval_days <= current_date+7
    UNION ALL
    SELECT 'insp:'||i.id, 'critical', 'maintenance', 'عيب حرج يحتاج إصلاح — '||a.code, coalesce(i.notes,'فحص به عيب حرج لم يُعالج'), 'asset', i.asset_id, NULL, 0
    FROM inspections i JOIN assets a ON a.id=i.asset_id WHERE i.has_critical AND NOT i.resolved
    UNION ALL
    SELECT 'stock:'||pt.id, 'warning', 'parts', 'مخزون منخفض: '||pt.name, format('المتوفر %s %s والحد الأدنى %s', pt.qty_on_hand, pt.unit, pt.reorder_level), NULL, NULL, NULL, 0
    FROM parts pt WHERE pt.qty_on_hand <= pt.reorder_level AND pt.reorder_level > 0
  LOOP
    -- one alert per item per stage (30/15/7/expired) so reminders escalate without daily spam
    k := r.key||':'||CASE WHEN r.left_days < 0 THEN 'expired' WHEN r.left_days <= 7 THEN '7' WHEN r.left_days <= 15 THEN '15' ELSE '30' END;
    INSERT INTO notifications(severity, category, title, body, entity_type, entity_id, dedupe_key)
    VALUES (r.sev, r.cat, r.title, r.body, r.et, r.eid, k) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id INTO nid;
    IF nid IS NOT NULL THEN
      n := n+1;
      PERFORM wa_admins(format(E'⚠️ %s\n%s', r.title, r.body), 'critical_alert', nid);
      IF r.dphone IS NOT NULL THEN PERFORM wa_enqueue(r.dphone, format(E'⚠️ تنبيه: %s\n%s\nجدّدها وارفع الصورة الجديدة.', r.title, r.body), 'critical_alert', nid); END IF;
      nid := NULL;
    END IF;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.generate_critical_alerts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_critical_alerts() TO authenticated, service_role;