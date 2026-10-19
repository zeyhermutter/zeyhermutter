-- Provisionszahlungen brutto (19.10.2026). Entscheidung Sebastian: "Es soll
-- brutto sein." Nur BETA.
--
-- Provisionsbetrag (vereinbart/tatsaechlich) bleibt netto. Der Zahlungseingang
-- wird ab jetzt brutto erfasst, so wie er auf dem Konto ankommt, und gegen
-- "Provision zzgl. Umsatzsteuer" geprueft (vat_rate, Standard 19 %).
--
-- Provisionen mit schon erfasster Zahlung behalten ihre bisherige Lesart
-- (payment_basis = 'NET'): ihr Zahlbetrag wurde netto eingetragen. Alle
-- anderen gelten als brutto.
--
-- Auswertungen (Dashboard, Akquise) rechnen Zahlungen auf netto zurueck,
-- damit Umsaetze weiter netto erscheinen.

alter table public.commissions
  add column if not exists vat_rate numeric(5,2) not null default 19.00,
  add column if not exists payment_basis text not null default 'NET';
alter table public.commissions alter column payment_basis set default 'GROSS';
alter table public.commissions
  add constraint commissions_vat_rate_check check (vat_rate >= 0 and vat_rate <= 100),
  add constraint commissions_payment_basis_check check (payment_basis in ('NET', 'GROSS'));

comment on column public.commissions.vat_rate is 'Umsatzsteuersatz in Prozent fuer den Rechnungsbetrag (Standard 19).';
comment on column public.commissions.payment_basis is 'GROSS: paid_amount ist brutto (ab 19.10.2026). NET: paid_amount wurde netto erfasst (Provisionen mit Zahlung vor der Umstellung).';

-- Bestehende Provisionen ohne Zahlung gelten ab jetzt ebenfalls brutto. Nur
-- diese eine Spalte; Pruef-, Metadaten- und Protokoll-Trigger bleiben dafuer
-- kurz aus (eine Migration hat keinen angemeldeten Benutzer).
alter table public.commissions disable trigger user;
update public.commissions set payment_basis = 'GROSS' where coalesce(paid_amount, 0) = 0;
alter table public.commissions enable trigger user;

create or replace function app_private.provision_brutto_faktor(p_basis text, p_rate numeric)
returns numeric
language sql
immutable
set search_path = pg_temp
as $$
  select case when p_basis = 'GROSS' then 1 + coalesce(p_rate, 0) / 100 else 1 end;
$$;

grant execute on function app_private.provision_brutto_faktor(text, numeric) to authenticated;

-- Vorhandene Funktionen an genau bezeichneten Stellen ergaenzen; passt eine
-- Stelle nicht genau einmal, bricht die Migration ab.
create or replace function pg_temp.ersetze_genau_einmal(p_text text, p_alt text, p_neu text, p_wo text)
returns text
language plpgsql
as $$
begin
  if (length(p_text) - length(replace(p_text, p_alt, ''))) / length(p_alt) <> 1 then
    raise exception '%: Stelle nicht genau einmal gefunden: %', p_wo, p_alt;
  end if;
  return replace(p_text, p_alt, p_neu);
end;
$$;

do $patch$
declare
  d text;
begin
  d := pg_get_functiondef('app_private.validate_commission()'::regprocedure);
  if position('v_zahlziel' in d) = 0 then
    d := pg_temp.ersetze_genau_einmal(d, '  v_target numeric;', '  v_target numeric;
  v_zahlziel numeric;', 'validate_commission');
    d := pg_temp.ersetze_genau_einmal(d, '  v_target := coalesce(new.actual_amount,v_expected);', '  v_target := coalesce(new.actual_amount,v_expected);
  -- Zahlungen brutto (19.10.2026): Ziel ist die Provision zzgl. Umsatzsteuer.
  v_zahlziel := case when new.payment_basis = ''GROSS'' then round(v_target * (1 + new.vat_rate / 100), 2) else v_target end;', 'validate_commission');
    d := pg_temp.ersetze_genau_einmal(d, 'coalesce(v_target,0)<=new.paid_amount', 'coalesce(v_zahlziel,0)<=new.paid_amount', 'validate_commission');
    d := pg_temp.ersetze_genau_einmal(d, 'if coalesce(v_target,0)<=0 or new.paid_amount < v_target then', 'if coalesce(v_zahlziel,0)<=0 or new.paid_amount < v_zahlziel then', 'validate_commission');
    execute d;
  end if;

  d := pg_get_functiondef('public.crm_dashboard_summary(text, date, date)'::regprocedure);
  if position('provision_brutto_faktor' in d) = 0 then
    d := pg_temp.ersetze_genau_einmal(d, 'coalesce(commission.paid_amount, 0), 0)', 'coalesce(commission.paid_amount, 0) / app_private.provision_brutto_faktor(commission.payment_basis, commission.vat_rate), 0)', 'crm_dashboard_summary');
    d := pg_temp.ersetze_genau_einmal(d, 'coalesce(sum(commission.paid_amount), 0)', 'coalesce(sum(commission.paid_amount / app_private.provision_brutto_faktor(commission.payment_basis, commission.vat_rate)), 0)', 'crm_dashboard_summary');
    execute d;
  end if;

  d := pg_get_functiondef('public.acquisition_campaign_performance(date, date)'::regprocedure);
  if position('provision_brutto_faktor' in d) = 0 then
    d := pg_temp.ersetze_genau_einmal(d, 'coalesce(sum(cm.paid_amount),0)', 'coalesce(sum(cm.paid_amount / app_private.provision_brutto_faktor(cm.payment_basis, cm.vat_rate)),0)', 'acquisition_campaign_performance');
    execute d;
  end if;
end
$patch$;
