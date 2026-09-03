-- Die Standardrechte des Projekts vergeben EXECUTE auf neue Funktionen auch an die
-- nicht angemeldete Rolle. Beide Geldwaeschefunktionen pruefen zwar selbst auf eine
-- Berechtigung, sollen aber gar nicht erst ueber die oeffentliche API erreichbar sein.
revoke execute on function public.log_gwg_case_access(uuid) from anon;
revoke execute on function public.gwg_closing_identification_status(uuid) from anon;
