"""
Mutaciones del SQL del modelo de contenido (migraciones 0007–0009) y del exportador, contra las suites de integración
que ejercen sus garantías. Uso:  python3 scripts/mutation/db.py [ID …]   (p. ej. F1 T2 G1; sin IDs, todas)

Las mutaciones se aplican sobre las definiciones VIGENTES (la 0008 reemplaza funciones de la 0007: mutar la 0007 no
afectaría a nada y «sobrevivir» no diría nada). Etiquetas: F = congelación/identidad, T = traducciones y evidencia,
G = privilegios de columna, P = políticas RLS y vista, A = auditoría, D = semántica de días, E = exportador,
C = fuentes de solo inserción, Y = idioma de las fuentes (migración 0010 y exportador),
Z = serialización por destino y campo (migración 0011), R = políticas RLS evaluadas una vez por consulta (migración 0012),
X = agrupado de evidencia y traducciones del exportador.
"""
import sys
from lib import main, run_vitest

TESTS = [
    "tests/integration/content-model.test.ts",
    "tests/integration/content-hardening.test.ts",
    "tests/integration/content-parity.test.ts",
    "tests/integration/content-export.test.ts",
    "tests/integration/content-guards.test.ts",
    "tests/integration/rls.test.ts",
    "tests/integration/audit.test.ts",
    "tests/integration/translations.test.ts",
    "tests/integration/content-language.test.ts",
    "tests/integration/content-concurrency.test.ts",
    "tests/integration/rls-initplan.test.ts",
]
M07='db/migrations/0007_content_model.sql'
M08='db/migrations/0008_content_hardening.sql'
M10='db/migrations/0010_source_language.sql'
M11='db/migrations/0011_serialize_assertions.sql'
M12='db/migrations/0012_rls_initplan.sql'
LOCK="perform pg_advisory_xact_lock(hashtextextended(new.destination_id::text || ':' || new.field_key, 0));"
EXP='scripts/content/export-lib.ts'
LCHK="language ~ '^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$'"
CC="""  content_changed :=
       new.source_locale is distinct from old.source_locale
    or new.original_text is distinct from old.original_text
    or new.quantity_value is distinct from old.quantity_value
    or new.quantity_unit is distinct from old.quantity_unit
    or new.valid_from is distinct from old.valid_from
    or new.valid_until is distinct from old.valid_until;"""
def cc(drop):
    lines=CC.split('\n')
    head,body=lines[0],lines[1:]
    keep=[l for l in body if drop not in l]
    assert len(keep)==len(body)-1,drop
    # primer elemento sin «or»; último con «;»
    keep=[l.replace('    or ','       ',1) if i==0 and l.startswith('    or ') else l for i,l in enumerate(keep)]
    if not keep[-1].endswith(';'): keep[-1]=keep[-1]+';'
    # asegurar que el penúltimo ya no lleve «;»
    keep=[l[:-1] if (i<len(keep)-1 and l.endswith(';')) else l for i,l in enumerate(keep)]
    return head+'\n'+'\n'.join(keep)

MUTS=[
 ('F1 descongelar quantity_value',M08,CC,cc('quantity_value')),
 ('F2 descongelar quantity_unit',M08,CC,cc('quantity_unit')),
 ('F3 descongelar valid_from',M08,CC,cc('valid_from')),
 ('F4 descongelar valid_until',M08,CC,cc('valid_until')),
 ('F5 descongelar source_locale',M08,CC,cc('source_locale')),
 ('F6 descongelar original_text',M08,CC,cc('original_text')),
 ('F7 confianza editable tras verificar',M08,
  """    or (new.confidence is distinct from old.confidence
        and not (old.status = 'in_review' and new.status = 'verified'))) then""",""") then"""),
 ('F8 reemplazo: disputada no cuenta (guarda)',M08,"old.status not in ('verified', 'disputed') then raise","old.status not in ('verified') then raise") if False else
 ('F8 reemplazo: disputada no cuenta (guarda)',M08,"or old.status not in ('verified', 'disputed') then","or old.status not in ('verified') then"),
 ('F9 reemplazo: disputada no se marca como reemplazada',M08,"superseded_at is null and status in ('verified', 'disputed');","superseded_at is null and status in ('verified');"),
 ('F10 created_by mutable',M08,"or new.created_by <> old.created_by or new.created_at <> old.created_at then","or new.created_at <> old.created_at then"),
 ('F11 created_at mutable',M08,"or new.created_by <> old.created_by or new.created_at <> old.created_at then","or new.created_by <> old.created_by then"),
 ('F12 verified_by/at mutables',M08,"elsif new.verified_by is distinct from old.verified_by or new.verified_at is distinct from old.verified_at then","elsif false then"),
 ('F13 destination_id mutable',M08,"if new.destination_id <> old.destination_id or new.field_key","if new.field_key"),
 ('F14 version mutable',M08,"or new.version <> old.version\n     or new.created_by","\n     or new.created_by") if False else
 ('F14 field_key mutable',M08,"or new.field_key <> old.field_key or new.version <> old.version","or new.version <> old.version"),
 ('F15 status_note editable congelado',M08,"if new.status_note is distinct from old.status_note and new.status = old.status then","if false then"),
 ('T1 evidence_cannot_move',M08,"if tg_op = 'UPDATE' and new.assertion_id <> old.assertion_id then\n    raise exception 'evidence_cannot_move'","if false then\n    raise exception 'evidence_cannot_move'"),
 ('T2 provenance de traducción mutable',M08,"or new.provenance <> old.provenance\n       or new.translated_by","\n       or new.translated_by"),
 ('T3 locale de traducción mutable',M08,"or new.locale <> old.locale or new.provenance","or new.provenance"),
 ('T4 assertion_id de traducción mutable',M08,"if new.assertion_id <> old.assertion_id or new.locale <> old.locale or new.provenance","if new.locale <> old.locale or new.provenance"),
 ('G1 anon lee reviewed_by (traducciones)',M07,"grant select (assertion_id, locale, text, provenance, status) on public.assertion_translations to anon;","grant select (assertion_id, locale, text, provenance, status, reviewed_by) on public.assertion_translations to anon;"),
 ('G2 anon lee translated_by/at (traducciones)',M07,"grant select (assertion_id, locale, text, provenance, status) on public.assertion_translations to anon;","grant select (assertion_id, locale, text, provenance, status, translated_by, translated_at) on public.assertion_translations to anon;"),
 ('G3 anon lee created_by (afirmaciones)',M07,"quantity_unit, confidence, verified_at, valid_from, valid_until, superseded_at)\n  on public.field_assertions to anon;","quantity_unit, confidence, verified_at, valid_from, valid_until, superseded_at, created_by)\n  on public.field_assertions to anon;"),
 ('G4 anon lee verified_by (afirmaciones)',M07,"quantity_unit, confidence, verified_at, valid_from, valid_until, superseded_at)\n  on public.field_assertions to anon;","quantity_unit, confidence, verified_at, valid_from, valid_until, superseded_at, verified_by)\n  on public.field_assertions to anon;"),
 ('G5 anon lee status_note (afirmaciones)',M07,"quantity_unit, confidence, verified_at, valid_from, valid_until, superseded_at)\n  on public.field_assertions to anon;","quantity_unit, confidence, verified_at, valid_from, valid_until, superseded_at, status_note)\n  on public.field_assertions to anon;"),
 ('G6 anon lee created_by (fuentes)',M07,"license_name, license_url)\n  on public.source_records to anon;","license_name, license_url, created_by)\n  on public.source_records to anon;"),
 ('G7 authenticated actualiza fuentes',M07,"grant insert, delete on public.source_records to authenticated;","grant insert, update, delete on public.source_records to authenticated;"),
 ('G8 anon lee created_at (evidencia)',M07,"grant select (id, assertion_id, source_record_id, stance, locator, excerpt) on public.assertion_evidence to anon;","grant select (id, assertion_id, source_record_id, stance, locator, excerpt, created_at) on public.assertion_evidence to anon;"),
 ('C1 fuentes: el disparador de solo inserción no hace nada','db/migrations/0009_source_records_append_only.sql',"raise exception 'source_records_are_append_only' using errcode = 'check_violation';","return new;"),
 ('P1 traducción pública sin atarla a afirmación pública',M07,"    and provenance = 'human_translation'\n    and exists (select 1 from public.field_assertions a where a.id = assertion_translations.assertion_id)\n  );","    and provenance = 'human_translation'\n  );"),
 ('P2 evidencia pública siempre',M07,"using (exists (select 1 from public.field_assertions a where a.id = assertion_evidence.assertion_id));","using (true);"),
 ('P3 fuentes públicas siempre',M07,"using (exists (select 1 from public.assertion_evidence e where e.source_record_id = source_records.id));","using (true);"),
 ('P4 público: valid_until es exclusivo',M07,"and (valid_until is null or valid_until >= app.panama_today())","and (valid_until is null or valid_until > app.panama_today())"),
 ('P5 público: ve reemplazadas',M07,"    and superseded_at is null\n    and (valid_until is null","    and (valid_until is null"),
 ('P6 vista: incluye reemplazadas',M07,"   where d.status = 'published'\n     and fa.superseded_at is null\n","   where d.status = 'published'\n"),
 ('P7 vista: vencida el último día',M07,"fa.valid_until < app.panama_today()))","fa.valid_until <= app.panama_today()))"),
 ('P9 vista: destinos no publicados',M07,"   where d.status = 'published'\n","   where true\n"),
 ('A1 sin auditoría de content_fields',M07,"array[\n    'content_fields', 'source_records',","array[\n    'source_records',"),
 ('A2 sin auditoría de source_records',M07,"'content_fields', 'source_records', 'field_assertions'","'content_fields', 'field_assertions'"),
 ('A3 sin auditoría de field_assertions',M07,"'source_records', 'field_assertions', 'assertion_evidence'","'source_records', 'assertion_evidence'"),
 ('A4 sin auditoría de assertion_evidence',M07,"'field_assertions', 'assertion_evidence', 'assertion_translations'\n  ]","'field_assertions', 'assertion_translations'\n  ]"),
 ('A5 sin auditoría de assertion_translations',M07,"'assertion_evidence', 'assertion_translations'\n  ]","'assertion_evidence'\n  ]"),
 ('D1 panama_today con UTC',M07,"select (now() at time zone 'America/Panama')::date","select (now() at time zone 'UTC')::date"),
 ('D2 día de verificación en Panamá (no UTC)',M08,"else (a.verified_at at time zone 'UTC')::date end;","else (a.verified_at at time zone 'America/Panama')::date end;"),
 ('D3 día de consulta en Panamá (no UTC)',M08,"age := v_day - (e.retrieved_at at time zone 'UTC')::date;","age := v_day - (e.retrieved_at at time zone 'America/Panama')::date;"),
 ('D4 edad con intervalos de 24 h',M08,"age := v_day - (e.retrieved_at at time zone 'UTC')::date;","age := floor(extract(epoch from (a.verified_at - e.retrieved_at)) / 86400)::int;"),
 ('D5 vigencia contada en Panamá',M08,"span := a.valid_until - v_day;","span := a.valid_until - (a.verified_at at time zone 'America/Panama')::date;"),
 ('D6 fuente consultada «mañana» pasa',M08,"          if age < 0 then\n            after_verification := true;","          if age < -1 then\n            after_verification := true;"),
 ('D7 antigüedad: límite exclusivo',M08,"elsif age <= f.evidence_max_age_days and","elsif age < f.evidence_max_age_days and"),
 ('D8 vigencia máxima: límite exclusivo',M08,"elsif f.max_validity_days is not null and span > f.max_validity_days then","elsif f.max_validity_days is not null and span >= f.max_validity_days then"),
 ('D9 valid_from el mismo día: se rechaza',M08,"a.valid_from > v_day then","a.valid_from >= v_day then"),
 ('E1 exportador no es de solo lectura','scripts/content/export-lib.ts',"begin isolation level repeatable read read only","begin isolation level repeatable read"),
 ('Y1 el exportador no lee el idioma de la fuente',EXP,"s.license_name, s.license_url, s.language","s.license_name, s.license_url, null::text as language"),
 ('Y2 el exportador publica siempre «idioma desconocido»',EXP,"language: e.language,","language: null,"),
 ('Y3 sin restricción de idioma en la BD',M10,"  add column language text\n    constraint source_records_language_check\n    check (language is null or "+LCHK+");","  add column language text;"),
 ('Y4 el idioma desconocido (null) se rechaza en la BD',M10,"check (language is null or "+LCHK,"check ("+LCHK,"equivalente","en PostgreSQL una restricción CHECK se cumple cuando la expresión da NULL: `language ~ patrón` con language nulo da NULL, así que `language is null or` es redundante (se conserva por claridad)"),
 ('Y5 anon no puede leer el idioma',M10,"grant select (language) on public.source_records to anon;","-- (sin grant)"),
 ('Y6 BD: región en minúsculas',M10,"(-([A-Z]{2}|[0-9]{3}))?$');","(-([A-Za-z]{2}|[0-9]{3}))?$');"),
 ('Y7 BD: escritura en minúsculas',M10,"(-[A-Z][a-z]{3})?(-([A-Z]{2}","(-[A-Za-z]{4})?(-([A-Z]{2}"),
 ('Y8 BD: sin ancla de inicio',M10,"language ~ '^[a-z]{2,3}","language ~ '[a-z]{2,3}"),
 ('Y9 BD: sin ancla de fin',M10,"(-([A-Z]{2}|[0-9]{3}))?$');","(-([A-Z]{2}|[0-9]{3}))?');"),
 ('Y10 BD: idioma de hasta 8 letras',M10,"language ~ '^[a-z]{2,3}(-","language ~ '^[a-z]{2,8}(-"),
 ('Z1 sin bloqueo: la serialización no hace nada',M11,"    "+LOCK,"    perform 1;"),
 ('Z2 las verificaciones no se serializan',M11,"    lock_needed := new.status is distinct from old.status;","    lock_needed := false;"),
 ('Z3 la creación de borradores no se serializa',M11,"    lock_needed := true;","    lock_needed := false;"),
 ('Z4 el bloqueo no distingue el campo (solo el destino)',M11,"hashtextextended(new.destination_id::text || ':' || new.field_key, 0)","hashtextextended(new.destination_id::text, 0)"),
 ('Z5 el bloqueo no distingue el destino (solo el campo)',M11,"hashtextextended(new.destination_id::text || ':' || new.field_key, 0)","hashtextextended(new.field_key, 0)"),
 ('Z6 el disparador deja de ir el primero',M11,"create trigger field_assertions_00_serialize before insert or update","create trigger field_assertions_zz_serialize before insert or update"),
 ('Z7 el disparador no corre al actualizar',M11,"field_assertions_00_serialize before insert or update on public.field_assertions","field_assertions_00_serialize before insert on public.field_assertions"),
 ('Z8 se bloquea en cada actualización (también al editar texto)',M11,"    lock_needed := new.status is distinct from old.status;","    lock_needed := true;"),
 ('R1 el patrón no cubre app.current_user_id()',M12,"(is_[a-z]+|current_user_id)","(is_[a-z]+)"),
 ('R2 el patrón solo cubre app.is_staff()',M12,"(is_[a-z]+|current_user_id)","(is_staff|current_user_id)"),
 ('R3 no se reescribe el USING de las políticas',M12,"if wrapped_using is distinct from p.qual then","if false then"),
 ('R4 no se reescribe el WITH CHECK de las políticas',M12,"if wrapped_check is distinct from p.with_check then","if false then"),
 ('R5 se reenvuelve lo que ya estaba envuelto (sin la guarda de SELECT)',M12,"'(?<!SELECT )app","'app"),
 ('R6 una pasada que no reescribe nada se da por buena',M12,"  if changed = 0 then","  if false then"),
 ('R7 el envoltorio no es una subconsulta (solo paréntesis)',M12,"'(select app.\\1())', 'g');\n    wrapped_check","'(app.\\1())', 'g');\n    wrapped_check"),
 ('X1 el agrupado descarta todo menos la última fila de cada afirmación',EXP,"if (group) group.push(row);","if (group) group[0] = row;"),
 ('X2 el agrupado invierte el orden de cada afirmación',EXP,"if (group) group.push(row);","if (group) group.unshift(row);"),
]


# D1 solo se detecta entre las 00:00 y las 05:00 UTC (PostgreSQL no permite falsear `now()`): se avisa, no falla.
MUTATIONS = [m + ("reloj",) if m[0].startswith("D1 ") else m for m in MUTS if m]

if __name__ == "__main__":
    sys.exit(main(MUTATIONS, lambda: run_vitest("integration", TESTS), sys.argv[1:], min_base=200))
