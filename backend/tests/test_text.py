"""Ad normalleştirme (title_case_tr / person_name_tr) birim testleri — DB gerekmez."""
import pytest

from app.core.text import person_name_tr, title_case_tr, tr_lower, tr_upper


@pytest.mark.parametrize("src,expected", [("i", "İ"), ("ı", "I"), ("ışık", "IŞIK"), ("istanbul", "İSTANBUL")])
def test_tr_upper_turkish_i(src, expected):
    assert tr_upper(src) == expected


@pytest.mark.parametrize("src,expected", [("I", "ı"), ("İ", "i"), ("IŞIK", "ışık"), ("İSTANBUL", "istanbul")])
def test_tr_lower_turkish_i(src, expected):
    assert tr_lower(src) == expected


@pytest.mark.parametrize("src,expected", [
    ("saç kesimi", "Saç Kesimi"),
    ("SAÇ KESİMİ", "Saç Kesimi"),
    ("  saç    kesimi  ", "Saç Kesimi"),
    ("ütü ve ısıtma", "Ütü Ve Isıtma"),
    ("ipek bakım", "İpek Bakım"),
    ("ışıklı bakım", "Işıklı Bakım"),
    ("saç+sakal", "Saç+Sakal"),
    ("saç-sakal / cilt", "Saç-Sakal / Cilt"),
    ("VIP Bakım", "VIP Bakım"),            # karışık yazım: kısa kısaltma korunur
    ("saç KESİMİ", "Saç Kesimi"),          # 4+ harfli tamamen büyük sözcük küçülür
    ("", ""),
])
def test_title_case_tr_services(src, expected):
    assert title_case_tr(src) == expected


@pytest.mark.parametrize("src,expected", [
    ("ali yılmaz", "Ali Yılmaz"),
    ("mehmet ALİ  öztürk", "Mehmet Ali Öztürk"),
    ("ismail", "İsmail"),
    ("İSMAİL", "İsmail"),
    ("ıŞIL", "Işıl"),
    ("IŞIK", "Işık"),
    ("ışık", "Işık"),
    ("irfan", "İrfan"),
    ("IRMAK", "Irmak"),        # büyük I küçülünce ı olur
    ("MCDONALD", "Mcdonald"),
    ("McDonald", "McDonald"),  # karışık yazıma dokunulmaz
    ("ali'nin", "Ali'nin"),    # kesme işaretinden sonra büyütme yok
    ("ELİF NUR", "Elif Nur"),
])
def test_person_name_tr(src, expected):
    assert person_name_tr(src) == expected


def test_person_name_never_uses_ascii_i_upper_bug():
    # Python'ın str.upper()'ı "i" -> "I" yapar (hatalı); bizim fonksiyon "İ" üretmeli.
    assert person_name_tr("izmir").startswith("İ")
    assert person_name_tr("IZMIR") == "Izmır"  # büyük I -> ı (Türkçe kural)
