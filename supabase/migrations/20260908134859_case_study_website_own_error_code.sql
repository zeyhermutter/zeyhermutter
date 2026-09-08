-- Das Veroeffentlichen auf der Webseite meldete bisher denselben Fehlercode wie
-- die Marketingfreigabe: CASE_STUDY_APPROVE_REQUIRED. Die Oberflaeche uebersetzt
-- den mit "Die Marketingfreigabe darf nur die Geschaeftsfuehrung entscheiden" --
-- eine Meldung, die beim Veroeffentlichen schlicht das falsche Thema nennt.
-- Zwei verschiedene Vorgaenge brauchen zwei verschiedene Codes.

create or replace function app_private.validate_sale_case_study()
returns trigger
language plpgsql
set search_path to 'app_private', 'public', 'pg_temp'
as $function$
declare
  v_closing public.sale_closings%rowtype;
  v_open integer;
begin
  select * into v_closing from public.sale_closings where id = new.sale_closing_id;
  if v_closing.id is null then
    raise exception 'CASE_STUDY_CLOSING_NOT_FOUND' using errcode = 'P0002';
  end if;
  -- Vor der Beurkundung gibt es keinen Fall, ueber den sich berichten liesse.
  if v_closing.notarized_date is null then
    raise exception 'CASE_STUDY_CLOSING_NOT_NOTARIZED' using errcode = '22023';
  end if;

  -- Die Freigabe muss von jemandem kommen, der am Fall beteiligt war.
  if new.release_contact_id is not null
     and new.release_contact_id <> v_closing.buyer_contact_id
     and not exists (select 1 from public.property_owners po
                      where po.property_id = v_closing.property_id
                        and po.contact_id = new.release_contact_id) then
    raise exception 'CASE_STUDY_RELEASE_CONTACT_UNRELATED' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE'
     and old.release_status is distinct from new.release_status
     and new.release_status in ('GRANTED','DECLINED','WITHDRAWN')
     and not app_private.has_permission('case_study.approve') then
    raise exception 'CASE_STUDY_APPROVE_REQUIRED' using errcode = '42501';
  end if;

  -- Oeffentlich verwendbar nur mit freigegebenen Bildern.
  if new.status = 'PUBLISHABLE' then
    select count(*) into v_open
      from public.sale_case_study_media csm
      join public.property_media pm on pm.id = csm.property_media_id
     where csm.case_study_id = new.id and not pm.public_approved;
    if v_open > 0 then
      raise exception 'CASE_STUDY_MEDIA_NOT_RELEASED' using errcode = '22023';
    end if;
  end if;

  -- Widerruf: verlaesst der Status PUBLISHABLE, verschwindet der Eintrag von
  -- der Seite. Das geschieht ohne Nachfrage, denn sonst bliebe eine
  -- zurueckgezogene Fallstudie stehen, bis jemand daran denkt.
  if tg_op = 'UPDATE'
     and old.status = 'PUBLISHABLE' and new.status <> 'PUBLISHABLE'
     and old.website_published and new.website_published then
    new.website_published := false;
  end if;

  -- Der umgekehrte Fall ist kein Aufraeumen, sondern ein Irrtum: jemand will
  -- etwas veroeffentlichen, das dafuer nicht freigegeben ist. Das wird gesagt.
  if new.website_published and new.status <> 'PUBLISHABLE' then
    raise exception 'CASE_STUDY_WEBSITE_REQUIRES_PUBLISHABLE' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' or old.website_published is distinct from new.website_published then
    if new.website_published and not app_private.has_permission('case_study.approve') then
      raise exception 'CASE_STUDY_WEBSITE_APPROVE_REQUIRED' using errcode = '42501';
    end if;
    if new.website_published then
      new.website_published_at := coalesce(new.website_published_at, now());
      new.website_published_by := coalesce(new.website_published_by, auth.uid());
    else
      new.website_published_at := null;
      new.website_published_by := null;
    end if;
  end if;

  return new;
end;
$function$;

