CREATE OR REPLACE FUNCTION public.log_key_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_label text;
  v_building uuid;
  v_event text;
  v_payload jsonb := '{}'::jsonb;
  v_tag_id uuid;
  v_key_id uuid;
  v_loan_id uuid;
BEGIN
  SELECT CONCAT_WS(' ', p.first_name, p.last_name) INTO v_actor_label
    FROM public.profiles p WHERE p.user_id = v_actor LIMIT 1;

  IF TG_TABLE_NAME = 'key_tags' THEN
    v_building := COALESCE(NEW.building_id, OLD.building_id);
    IF TG_OP = 'INSERT' THEN
      v_event := 'tag_created'; v_tag_id := NEW.id;
    ELSIF TG_OP = 'UPDATE' THEN
      IF COALESCE(NEW.photo_path,'') <> COALESCE(OLD.photo_path,'') THEN v_event := 'photo_uploaded';
      ELSE v_event := 'tag_updated'; END IF;
      v_tag_id := NEW.id;
    ELSE
      v_event := 'tag_deleted'; v_tag_id := NULL; -- avoid FK violation on cascade delete
    END IF;
    INSERT INTO public.key_events(building_id, tag_id, event_type, actor_user_id, actor_label, payload)
    VALUES (v_building, v_tag_id, v_event, v_actor, v_actor_label,
            jsonb_build_object('tag_number', COALESCE(NEW.tag_number, OLD.tag_number)));

  ELSIF TG_TABLE_NAME = 'keys' THEN
    SELECT building_id INTO v_building FROM public.key_tags WHERE id = COALESCE(NEW.tag_id, OLD.tag_id);
    IF TG_OP = 'INSERT' THEN
      v_event := 'key_added'; v_tag_id := NEW.tag_id; v_key_id := NEW.id;
    ELSIF TG_OP = 'DELETE' THEN
      v_event := 'key_removed';
      -- if parent tag still exists keep ref, otherwise NULL
      IF v_building IS NULL THEN v_tag_id := NULL; ELSE v_tag_id := OLD.tag_id; END IF;
      v_key_id := NULL;
    ELSE
      v_event := 'key_updated'; v_tag_id := NEW.tag_id; v_key_id := NEW.id;
    END IF;
    INSERT INTO public.key_events(building_id, tag_id, key_id, event_type, actor_user_id, actor_label, payload)
    VALUES (v_building, v_tag_id, v_key_id, v_event, v_actor, v_actor_label,
            jsonb_build_object('key_number', COALESCE(NEW.key_number, OLD.key_number)));

  ELSIF TG_TABLE_NAME = 'key_loans' THEN
    v_building := COALESCE(NEW.building_id, OLD.building_id);
    -- check if parent tag still exists; if not (cascade), null out FK refs
    IF EXISTS (SELECT 1 FROM public.key_tags WHERE id = COALESCE(NEW.tag_id, OLD.tag_id)) THEN
      v_tag_id := COALESCE(NEW.tag_id, OLD.tag_id);
    ELSE
      v_tag_id := NULL;
    END IF;
    IF TG_OP = 'INSERT' THEN
      v_event := 'loan_issued'; v_loan_id := NEW.id;
      v_payload := jsonb_build_object(
        'borrower', COALESCE(NEW.borrower_name,''),
        'due_at', NEW.due_at,
        'requires_signature', NEW.requires_signature
      );
    ELSIF TG_OP = 'UPDATE' AND OLD.status = 'open' AND NEW.status = 'returned' THEN
      v_event := 'loan_returned'; v_loan_id := NEW.id;
      v_payload := jsonb_build_object('returned_at', NEW.returned_at);
    ELSIF TG_OP = 'UPDATE' AND OLD.status = 'open' AND NEW.status = 'lost' THEN
      v_event := 'loan_lost'; v_loan_id := NEW.id;
    ELSIF TG_OP = 'DELETE' THEN
      v_event := 'loan_deleted'; v_loan_id := NULL;
    ELSE
      v_event := 'loan_updated'; v_loan_id := NEW.id;
    END IF;
    INSERT INTO public.key_events(building_id, tag_id, loan_id, event_type, actor_user_id, actor_label, payload)
    VALUES (v_building, v_tag_id, v_loan_id, v_event, v_actor, v_actor_label, v_payload);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;