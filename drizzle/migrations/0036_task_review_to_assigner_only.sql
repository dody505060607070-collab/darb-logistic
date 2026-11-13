CREATE OR REPLACE FUNCTION public.enqueue_task_event(p_task public.tasks,p_event text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_event='submitted' THEN
 INSERT INTO public.task_notifications(task_id,recipient_id,event,payload) VALUES(p_task.id,p_task.assigned_by,p_event,to_jsonb(p_task));
 ELSE
 INSERT INTO public.task_notifications(task_id,recipient_id,event,payload) VALUES(p_task.id,p_task.assignee_id,p_event,to_jsonb(p_task));
 END IF;
END $$;