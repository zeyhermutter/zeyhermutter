create or replace function app_private.seed_property_checklist()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform set_config('app.seed_property_checklist','1',true);
  insert into public.property_marketing_checklist_items(property_id,item_key,title,category,required,created_by,updated_by) values
  (new.id,'OWNER_DATA','Eigentümerdaten vollständig','OWNER',true,new.created_by,new.created_by),
  (new.id,'BROKERAGE_AGREEMENT','Maklervertrag vorhanden','CONTRACT',true,new.created_by,new.created_by),
  (new.id,'PROPERTY_DATA','Objektstammdaten vollständig','PROPERTY',true,new.created_by,new.created_by),
  (new.id,'ADDRESS','Objektadresse geprüft','PROPERTY',true,new.created_by,new.created_by),
  (new.id,'ENERGY','Energiedaten geprüft','ENERGY',true,new.created_by,new.created_by),
  (new.id,'FLOOR_PLANS','Grundrisse geprüft','DOCUMENTS',false,new.created_by,new.created_by),
  (new.id,'PHOTOS','Objektfotos vorbereitet','MEDIA',true,new.created_by,new.created_by),
  (new.id,'PRICE_APPROVAL','Preis/Freigabe dokumentiert','MARKETING',true,new.created_by,new.created_by),
  (new.id,'DESCRIPTION','Vermarktungstext geprüft','MARKETING',true,new.created_by,new.created_by),
  (new.id,'PUBLICATION_APPROVAL','Veröffentlichungsfreigabe','MARKETING',true,new.created_by,new.created_by)
  on conflict do nothing;
  perform set_config('app.seed_property_checklist','0',true);
  return new;
end;
$$;

create or replace function app_private.audit_property_child()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_row jsonb;
  v_property_id uuid;
  v_property_number text;
  v_changes jsonb;
begin
  if tg_argv[0]='CHECKLIST' and tg_op='INSERT' and current_setting('app.seed_property_checklist',true)='1' then
    return new;
  end if;
  v_row := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_property_id := (v_row->>'property_id')::uuid;
  select display_name into v_actor_name from public.profiles where user_id=v_actor;
  select property_number into v_property_number from public.properties where id=v_property_id;
  if tg_op='INSERT' then
    v_changes := jsonb_build_object(tg_argv[0],jsonb_build_object('old',null,'new',v_row-array['created_at','updated_at','created_by','updated_by','version']));
  elsif tg_op='DELETE' then
    v_changes := jsonb_build_object(tg_argv[0],jsonb_build_object('old',v_row-array['created_at','updated_at','created_by','updated_by','version'],'new',null));
  else
    v_changes := jsonb_build_object(tg_argv[0],jsonb_build_object('old',to_jsonb(old)-array['created_at','updated_at','created_by','updated_by','version'],'new',to_jsonb(new)-array['created_at','updated_at','created_by','updated_by','version']));
  end if;
  insert into public.audit_events(actor_type,actor_user_id,actor_display_name_snapshot,entity_type,entity_id,entity_reference,action,field_changes,source,metadata)
  values(case when v_actor is null then 'SYSTEM' else 'USER' end,v_actor,coalesce(v_actor_name,'System'),'PROPERTY',v_property_id,v_property_number,'UPDATE',v_changes,case when v_actor is null then 'SYSTEM' else 'USER' end,jsonb_build_object('change_type',tg_argv[0],'operation',tg_op));
  return coalesce(new,old);
end;
$$;

create or replace function app_private.assign_document_version_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next integer;
begin
  select current_version + 1 into v_next from public.documents where id=new.document_id for update;
  if v_next is null then raise exception 'document not found'; end if;
  new.version_number := v_next;
  update public.documents set current_version=v_next where id=new.document_id;
  return new;
end;
$$;
revoke all on function app_private.assign_document_version_number() from public;

drop trigger if exists document_versions_assign_number on public.document_versions;
create trigger document_versions_assign_number
before insert on public.document_versions
for each row execute function app_private.assign_document_version_number();