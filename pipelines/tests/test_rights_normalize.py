import json

import pytest

from pipelines.ingest import normalize as nm
from pipelines.ingest import rights
from pipelines.ingest.rights import Policy, RightsDenied

UUID = "4b25d4ee-10ae-4655-b914-467265749097"


class TestDerechos:
    def test_el_documento_compartido_se_lee_y_no_tiene_sujetos_repetidos(self):
        policies = rights.load_policies()
        assert {p.subject for p in policies} >= {"overture", "aws-terrain", "noto-sans-glyphs"}

    def test_provisional_permite_fuera_de_produccion_y_bloquea_produccion(self):
        policies = [Policy("x", "provisional", ("transform",))]
        rights.require(policies, "x", ["transform"], "development")
        rights.require(policies, "x", ["transform"], "staging")
        with pytest.raises(RightsDenied, match="provisional"):
            rights.require(policies, "x", ["transform"], "production")

    def test_verified_permite_en_produccion_pero_solo_sus_acciones(self):
        policies = [Policy("x", "verified", ("display",))]
        rights.require(policies, "x", ["display"], "production")
        with pytest.raises(RightsDenied, match="no está permitida"):
            rights.require(policies, "x", ["redistribute"], "production")

    def test_sin_politica_o_entorno_desconocido_deniega(self):
        with pytest.raises(RightsDenied, match="deny-by-default"):
            rights.require([], "y", ["display"], "development")
        with pytest.raises(RightsDenied, match="entorno desconocido"):
            rights.require([Policy("x", "verified", ("display",))], "x", ["display"], "prod")

    def test_los_datasets_declaran_acciones_que_su_politica_permite(self):
        datasets = json.loads((rights.ROOT / "pipelines/ingest/datasets.json").read_text(encoding="utf-8"))
        policies = rights.load_policies()
        for name, cfg in datasets.items():
            rights.require(policies, cfg["rightsSubject"], cfg["actions"], "development")
        # y hoy, con todo `provisional`, NINGUNA importación se admite para producción
        for name, cfg in datasets.items():
            with pytest.raises(RightsDenied):
                rights.require(policies, cfg["rightsSubject"], cfg["actions"], "production")

    def test_documento_invalido_se_rechaza(self, tmp_path):
        bad = tmp_path / "p.json"
        bad.write_text(json.dumps({"schema": 1, "policies": [{"subject": "a", "status": "quizá", "allowed": ["display"]}]}))
        with pytest.raises(ValueError):
            rights.load_policies(bad)
        bad.write_text(json.dumps({"schema": 2, "policies": []}))
        with pytest.raises(ValueError):
            rights.load_policies(bad)


class TestNormalizacion:
    def test_tipo_de_area_segun_origen(self):
        assert nm.kind_for("base", "land_use", "protected", "national_park") == "protected_area"
        assert nm.kind_for("divisions", "division_area", "locality", None) == "locality"
        assert nm.kind_for("base", "land", "land", "island") == "island"
        assert nm.kind_for("base", "land", "land", "land") is None
        assert nm.kind_for("base", "water", "water", None) is None  # sin sobrescritura explícita, va a cuarentena

    def test_propiedades_validas(self):
        assert nm.validate_properties({"overture_id": UUID, "kind": "locality", "name_local": "El Valle", "names": {"es": "El Valle"}, "wikidata": "Q1324715"}) == []

    @pytest.mark.parametrize(
        "props, code",
        [
            ({"overture_id": "no-es-uuid", "kind": "locality"}, "properties.bad_id"),
            ({"overture_id": UUID, "kind": "planeta"}, "properties.bad_kind"),
            ({"overture_id": UUID, "kind": "locality", "name_local": "a\x07b"}, "properties.bad_name"),
            ({"overture_id": UUID, "kind": "locality", "name_local": "x" * 301}, "properties.bad_name"),
            ({"overture_id": UUID, "kind": "locality", "names": {"zz": "x"}}, "properties.bad_names"),
            ({"overture_id": UUID, "kind": "locality", "names": "texto"}, "properties.bad_names"),
            ({"overture_id": UUID, "kind": "locality", "wikidata": "Q0"}, "properties.bad_wikidata"),
        ],
    )
    def test_propiedades_invalidas(self, props, code):
        assert code in [i.code for i in nm.validate_properties(props)]

    def test_sin_propiedades(self):
        assert [i.code for i in nm.validate_properties(None)] == ["properties.missing"]

    def test_los_nombres_por_idioma_solo_son_los_de_la_fuente_y_distintos_del_local(self):
        row = {"names": {"primary": "Boquete", "common": [("en", "Boquete District"), ("es", "Boquete"), ("zh", "博克特"), ("fr", "\x01")]}}
        local, by_locale = nm.names_from_row(row)
        assert local == "Boquete"
        assert by_locale == {"en": "Boquete District"}  # `es` igual al local, `zh` no soportado, `fr` con control: fuera

    def test_sin_nombres_no_se_inventa_ninguno(self):
        assert nm.names_from_row({"names": None}) == (None, {})
