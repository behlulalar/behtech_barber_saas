"""Türkçe metin yardımcıları."""
import re

# Python'ın upper()/lower()'ı Türkçe i/ı kurallarını bilmez: "i".upper() == "I" (olması gereken "İ"),
# "I".lower() == "i" (olması gereken "ı"). Bu yüzden bu iki harf elle eşleniyor.
_UPPER = {"i": "İ", "ı": "I"}
_LOWER = {"I": "ı", "İ": "i"}

# Sözcük başı: öncesinde harf/rakam ya da kesme işareti olmayan sözcük ("Ali'nin" → "nin" büyümez).
_WORD = re.compile(r"(?<![\w'’])\w+")


def tr_upper(text: str) -> str:
    return "".join(_UPPER.get(c) or c.upper() for c in text)


def tr_lower(text: str) -> str:
    return "".join(_LOWER.get(c) or c.lower() for c in text)


def title_case_tr(value: str) -> str:
    """Her sözcüğün ilk harfini büyütür: "saç kesimi" → "Saç Kesimi".

    - Fazla boşluklar tek boşluğa indirilir, uçlar kırpılır.
    - İsim tamamen küçük ya da tamamen BÜYÜK harfle yazıldıysa sözcüklerin geri kalanı küçültülür
      ("SAÇ KESİMİ" → "Saç Kesimi").
    - Karışık yazıldıysa kullanıcının kararına saygı duyulur: "VIP Bakım" olduğu gibi kalır;
      yalnızca 4+ harfli TAMAMEN büyük sözcükler küçültülür ("saç KESİMİ" → "Saç Kesimi").
    - "+", "-", "/", "(" gibi ayraçlardan sonra gelen sözcük de büyür ("saç+sakal" → "Saç+Sakal").
    """
    value = re.sub(r"\s+", " ", value).strip()
    letters = [c for c in value if c.isalpha()]
    single_case = bool(letters) and (
        all(tr_lower(c) == c for c in letters) or all(tr_upper(c) == c for c in letters)
    )

    def fix(match: re.Match) -> str:
        word = match.group(0)
        lower_rest = single_case or (word.isupper() and len(word) >= 4)
        rest = tr_lower(word[1:]) if lower_rest else word[1:]
        return tr_upper(word[0]) + rest

    return _WORD.sub(fix, value)
