-- The Shell: developer/boss/manager/employee permissions, first-login PIN rotation,
-- and editable shared checklist templates.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_pin boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('developer','boss','manager','employee'));

CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station text NOT NULL CHECK (station IN ('FOH','Kitchen Up','Kitchen Down')),
  checklist text NOT NULL,
  item_text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_templates TO authenticated;
DROP POLICY IF EXISTS checklist_read_staff ON public.checklist_templates;
CREATE POLICY checklist_read_staff ON public.checklist_templates FOR SELECT TO authenticated
USING (public.current_app_role() IN ('employee','manager','boss','developer'));
DROP POLICY IF EXISTS checklist_manage_leadership ON public.checklist_templates;
CREATE POLICY checklist_manage_leadership ON public.checklist_templates FOR ALL TO authenticated
USING (public.current_app_role() IN ('manager','boss','developer'))
WITH CHECK (public.current_app_role() IN ('manager','boss','developer') AND updated_by = auth.uid());

-- Only a first-login user may clear their own must_change_pin flag through this RPC.
CREATE OR REPLACE FUNCTION public.complete_first_pin_change(new_pin text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF new_pin IS NULL OR new_pin !~ '^[0-9]{4,8}$' THEN RAISE EXCEPTION 'PIN must be 4–8 digits'; END IF;
 UPDATE public.profiles SET pin_hash = extensions.crypt(new_pin, extensions.gen_salt('bf', 10)), must_change_pin = false
 WHERE id = auth.uid() AND active = true;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active profile not found'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.complete_first_pin_change(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_first_pin_change(text) TO authenticated;

-- Existing self-service PIN changes are permitted only after first login is completed.
CREATE OR REPLACE FUNCTION public.set_my_pin(new_pin text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF new_pin IS NULL OR new_pin !~ '^[0-9]{4,8}$' THEN RAISE EXCEPTION 'PIN must contain 4 to 8 digits'; END IF;
 UPDATE public.profiles SET pin_hash = extensions.crypt(new_pin, extensions.gen_salt('bf', 10))
 WHERE id = auth.uid() AND active = true AND must_change_pin = false;
 IF NOT FOUND THEN RAISE EXCEPTION 'Use the first-login PIN change or contact leadership'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.set_my_pin(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_pin(text) TO authenticated;
CREATE OR REPLACE FUNCTION public.hash_staff_pin(plain_pin text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF plain_pin IS NULL OR plain_pin !~ '^[0-9]{4,8}$' THEN RAISE EXCEPTION 'PIN must be 4–8 digits'; END IF;
 RETURN extensions.crypt(plain_pin, extensions.gen_salt('bf',10));
END; $$;
REVOKE ALL ON FUNCTION public.hash_staff_pin(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hash_staff_pin(text) TO service_role;

DROP FUNCTION IF EXISTS public.verify_staff_pin(text,text);
CREATE FUNCTION public.verify_staff_pin(login_user_id text, supplied_pin text)
RETURNS TABLE(staff_id uuid, staff_email text, force_pin_change boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
 SELECT p.id,u.email::text,p.must_change_pin FROM public.profiles p JOIN auth.users u ON u.id=p.id
 WHERE p.active=true AND lower(p.user_id)=lower(trim(login_user_id)) AND p.pin_hash IS NOT NULL
 AND supplied_pin ~ '^[0-9]{4,8}$' AND p.pin_hash=extensions.crypt(supplied_pin,p.pin_hash) LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.verify_staff_pin(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_staff_pin(text,text) TO service_role;
