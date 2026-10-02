#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BL → ASYCUDA XML (Mauritanie)
Système complet, 100% local, sans API.

Usage:
  python bl_to_xml.py                         # scanne Downloads, liste les PDF et demande lesquels traiter
  python bl_to_xml.py <fichier.pdf>           # traite un fichier
  python bl_to_xml.py --folder <dossier>      # traite tout un dossier
  python bl_to_xml.py <f1.pdf> <f2.pdf>       # plusieurs fichiers
  python bl_to_xml.py --currency MRU <fichier.pdf>
  python bl_to_xml.py --dry-run <fichier.pdf> # extrait et affiche sans générer

Options:
  --currency XXX     Devise (défaut: config.json)
  --yes              Ne pas demander de confirmation
  --out DIR          Dossier de sortie (défaut: ./output)
  --dry-run          Extraction + analyse seulement, pas de fichier XML
"""
import argparse
import json
import xml.etree.ElementTree as ET
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SCAN_DIR = r"C:\Users\LMR\Downloads"
CONFIG_PATH = os.path.join(HERE, "config.json")
TEMPLATE_PATH = os.path.join(HERE, "template.xml")

# ----------------------------------------------------------------------------
# 0. Helpers
# ----------------------------------------------------------------------------

def load_config():
    with open(CONFIG_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def xml_escape(s):
    if s is None:
        return ""
    return (str(s)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;"))



def esc_text(s):
    if s is None:
        return ""
    return (str(s)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;"))


def serialize_flat(elem):
    """Sérialise le document exactement comme le modèle vide
    (une balise par ligne, sans indentation)."""
    tag = elem.tag
    if len(elem) == 0:
        if elem.text:
            return f"<{tag}>{esc_text(elem.text)}</{tag}>"
        return f"<{tag}/>"
    out = [f"<{tag}>"]
    for ch in elem:
        out.append(serialize_flat(ch))
    out.append(f"</{tag}>")
    return "\n".join(out)




def clean(txt):
    """Normalise le texte extrait (espaces multiples)."""
    if not txt:
        return ""
    txt = re.sub(r"\s+", " ", str(txt))
    return txt.strip()


def despace(txt):
    """Rejoint les lettres isolées des PDF Maersk (P ACKAGES -> PACKAGES)."""
    if not txt:
        return ""
    toks = str(txt).split()
    out = []
    i = 0
    while i < len(toks):
        tok = toks[i]
        nxt = toks[i + 1] if i + 1 < len(toks) else ""
        if (len(tok) == 1 and tok.isalpha() and nxt.isalpha()
                and len(nxt) > 1 and not re.search(r"[^A-Za-z]", nxt)):
            out.append(tok + nxt)
            i += 2
        else:
            out.append(tok)
            i += 1
    return " ".join(out)


def norm_num(txt):
    """Convertit '12.320,000' / '25180.000' / '1,234.5' en float."""
    if txt is None:
        return 0.0
    txt = clean(str(txt))
    if not txt:
        return 0.0
    txt = txt.replace(" ", "")
    if txt.count(",") == 1 and txt.count(".") == 1:
        # fr-FR: 12.320,000  -> 12320.000
        if txt.rfind(",") > txt.rfind("."):
            txt = txt.replace(".", "").replace(",", ".")
    elif txt.count(",") == 1 and txt.count(".") == 0:
        txt = txt.replace(",", ".")
    try:
        return float(txt)
    except ValueError:
        return 0.0


def fmt_money(v, decimals=2):
    """Formatage simple: 42190.96 (pas de séparateur de milliers)."""
    return f"{v:.{decimals}f}"


PORT_COUNTRY = {
    "ningbo": ("CN", "Chine"), "tianjin": ("CN", "Chine"),
    "tianjinxingang": ("CN", "Chine"), "shanghai": ("CN", "Chine"),
    "yantian": ("CN", "Chine"), "shenzhen": ("CN", "Chine"),
    "qingdao": ("CN", "Chine"), "xiamen": ("CN", "Chine"),
    "guangzhou": ("CN", "Chine"), "dalian": ("CN", "Chine"),
    "shekou": ("CN", "Chine"), "nansha": ("CN", "Chine"),
    "jebel ali": ("AE", "Emirats arabes unis"), "dubai": ("AE", "Emirats arabes unis"),
    "sharjah": ("AE", "Emirats arabes unis"), "abu dhabi": ("AE", "Emirats arabes unis"),
    "salalah": ("OM", "Oman"), "suhar": ("OM", "Oman"), "muscat": ("OM", "Oman"),
    "nouakchott": ("MR", "Mauritanie"), "nouadhibou": ("MR", "Mauritanie"),
    "nktt": ("MR", "Mauritanie"),
    "barcelona": ("ES", "Espagne"), "valencia": ("ES", "Espagne"),
    "bilbao": ("ES", "Espagne"), "antwerp": ("BE", "Belgique"),
    "zeebrugge": ("BE", "Belgique"),     "hong kong": ("HK", "Hong Kong"),
    "istanbul": ("TR", "Turquie"), "izmir": ("TR", "Turquie"), "mersin": ("TR", "Turquie"),
    "aliaga": ("TR", "Turquie"), "gemlik": ("TR", "Turquie"), "ambarlı": ("TR", "Turquie"),
    "ambarl" : ("TR", "Turquie"), "tekirdag": ("TR", "Turquie"), "gebze": ("TR", "Turquie"),
    "marsaxlokk": ("MT", "Malte"),
    "tanger": ("MA", "Maroc"), "casablanca": ("MA", "Maroc"),
    "colombo": ("LK", "Sri Lanka"), "mundra": ("IN", "Inde"),
    "nhava sheva": ("IN", "Inde"), "sokhna": ("EG", "Egypte"),
    "port said": ("EG", "Egypte"), "rotterdam": ("NL", "Pays-Bas"),
    "hamburg": ("DE", "Allemagne"), "felixstowe": ("GB", "Royaume-Uni"),
    "le havre": ("FR", "France"), "genoa": ("IT", "Italie"),
    "singapore": ("SG", "Singapour"), "port kelang": ("MY", "Malaisie"),
    "ho chi minh": ("VN", "Vietnam"), "haiphong": ("VN", "Vietnam"),
    "karachi": ("PK", "Pakistan"), "djibouti": ("DJ", "Djibouti"),
    "tangier med": ("MA", "Maroc"),
}

ENGLISH_COUNTRY = {
    "CN": "CHINA", "MR": "MAURITANIA", "AE": "UNITED ARAB EMIRATES",
    "OM": "OMAN", "ES": "SPAIN", "BE": "BELGIUM", "HK": "HONG KONG",
    "TR": "TURKEY", "MT": "MALTA", "MA": "MOROCCO", "LK": "SRI LANKA",
    "IN": "INDIA", "EG": "EGYPT", "NL": "NETHERLANDS", "DE": "GERMANY",
    "GB": "UNITED KINGDOM", "FR": "FRANCE", "IT": "ITALY",
    "SG": "SINGAPORE", "MY": "MALAYSIA", "VN": "VIETNAM",
    "PK": "PAKISTAN", "DJ": "DJIBOUTI",
}

# Noms de pays en français (mêmes libellés que les exports ASYCUDA réels)
FRENCH_COUNTRY = {
    "CN": "Chine", "MR": "Mauritanie", "AE": "Emirats arabes unis",
    "OM": "Oman", "ES": "Espagne", "BE": "Belgique", "HK": "Hong Kong",
    "TR": "Turquie", "MT": "Malte", "MA": "Maroc", "LK": "Sri Lanka",
    "IN": "Inde", "EG": "Egypte", "NL": "Pays-Bas", "DE": "Allemagne",
    "GB": "Royaume-Uni", "FR": "France", "IT": "Italie",
    "SG": "Singapour", "MY": "Malaisie", "VN": "Vietnam",
    "PK": "Pakistan", "DJ": "Djibouti",
}

INCOTERMS = {"CFR", "CIF", "FOB", "EXW", "DAP", "DDP", "FCA", "CPT", "CIP"}

CURRENCY_NAME = {
    "USD": "Dollar americain", "EUR": "Euro", "MRU": "Ouguiya",
    "CNY": "Yuan", "AED": "Dirham EAU", "OMR": "Rial omanais",
}

CONTAINER_TYPE_MAP = [
    (r"40.*?(DRY|DV|GP|HC|HQ|HI|HR)", "40DV"),
    (r"40.*?(RF|REEFER|HR)", "40RF"),
    (r"20.*?(DRY|DV|GP)", "20DV"),
    (r"20.*?(RF|REEFER)", "20RF"),
]


# ----------------------------------------------------------------------------
# 1. Extraction PDF (pdfplumber + pypdf, 100% local)
#    - pdfplumber: lignes propres pour les sections (expéditeur/destinataire/navire)
#    - pypdf: texte compacté, plus fiable dans les zones à texte superposé
#      (conteneur / scellé / poids / volume chez Maersk)
# ----------------------------------------------------------------------------

def extract_pdf(path):
    import pdfplumber
    from pypdf import PdfReader
    lines = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            t = page.extract_text() or ""
            for ln in t.splitlines():
                c = clean(ln)
                if c:
                    lines.append(c)
    reader = PdfReader(path)
    pypdf_text = "\n".join((p.extract_text() or "") for p in reader.pages)
    return lines, pypdf_text


def merge_dedup(a, b):
    """Fusionne deux morceaux de texte en éliminant les répétitions (overlap)."""
    if not a:
        return b
    if not b:
        return a
    if b.startswith(a):
        return b
    if a.endswith(b):
        return a
    for n in range(min(len(a), len(b)), 5, -1):
        if a.endswith(b[:n]):
            return a + b[n:]
    return a + " " + b


# ----------------------------------------------------------------------------
# 2. Analyse de la bolyse (Maersk / MSC / CMA / générique)
# ----------------------------------------------------------------------------

def first_match(pattern, text, flags=re.IGNORECASE):
    m = re.search(pattern, text, flags)
    return m.group(1).strip() if m else ""


def block_between(lines, start_pat, end_pats):
    """Retourne les lignes entre un marqueur de début et les marqueurs de fin."""
    started = False
    out = []
    for ln in lines:
        if not started:
            if re.search(start_pat, ln):
                started = True
                continue
            continue
        if any(re.search(p, ln) for p in end_pats):
            break
        out.append(ln)
    return out


def parse_bl(lines, pypdf_text=""):
    text = pypdf_text if pypdf_text else "\n".join(lines)
    text_lines = text.splitlines()
    d = {
        "bl_number": "", "scac": "", "booking_no": "",
        "vessel": "", "voyage": "",
        "port_of_loading": "", "port_of_discharge": "",
        "shipper_name": "", "shipper_address": "",
        "consignee_name": "", "consignee_nif": "", "consignee_address": "",
        "notify_name": "",
        "container_number": "", "seal_number": "", "container_type": "",
        "packages_count": "", "packages_type": "CT",
        "gross_weight_kg": "", "measurement_cbm": "",
        "goods_description": "", "marks": "",
        "freight_terms": "CFR", "shipment_date": "",
        "country_of_origin": "", "country_of_origin_code": "",
    }

    # --- B/L No. et SCAC ---
    d["bl_number"] = (first_match(r"\bB/L\s*No\.?\s*[:.]?\s*([A-Z0-9]{4,20})", text)
                      or first_match(r"\bB/L\s*:\s*([A-Z0-9]{4,20})", text)
                      or first_match(r"\bBill of Lading\s*No\.?\s*[:.]?\s*([A-Z0-9]{4,20})", text)
                      or first_match(r"\b(MR\d{3,5})\b", text)
                      or first_match(r"\b([A-Z]{2}\d{3,6})\b", text)
                      or first_match(r"\bNuméro?\s*de\s*connaissement\s*[:.]?\s*([A-Z0-9]{4,20})", text)
                      or first_match(r"\bN°\s*de\s*bordereau\s*[:.]?\s*([A-Z0-9]{4,20})", text))
    d["scac"] = first_match(r"\bSCAC\s+([A-Z]{4})\b", text)
    d["booking_no"] = (first_match(r"\bBooking\s*No\.?\s*[:.]?\s*([A-Z0-9]+)", text)
                       or first_match(r"\bN°\s*de\s*booking\s*[:.]?\s*([A-Z0-9]+)", text)
                       or first_match(r"\bN°\s*de\s*référence\s*[:.]?\s*([A-Z0-9]+)", text))

    # --- Navire / Voyage ---
    m = re.search(r"(?:Vessel[^\n]*\n|Navire[^\n]*\n)([^\n]+)", text)
    if m:
        v = clean(m.group(1))
        parts = re.split(r"\s+", v)
        voyage = ""
        while parts and re.search(r"\d", parts[-1]) and len(voyage) < 8:
            voyage = parts[-1] + (" " + voyage if voyage else "")
            parts.pop()
        d["voyage"] = voyage.strip()
        d["vessel"] = " ".join(parts).strip()
    else:
        # Fallback: look for vessel name pattern
        m = re.search(r"(CMA\s+CGM\s*/\s*[A-Z][A-Za-z]+(?:\s[A-Za-z]+)*)", text)
        if m:
            d["vessel"] = clean(m.group(1)).rstrip()
        if d["vessel"].endswith("yes"):
            d["vessel"] = d["vessel"][:-3].strip()
    if not d["voyage"]:
        m = re.search(r"\b([A-Z]{1,2}\d{3}[A-Za-z]?\s*/\s*\d{1,3})\b", text)
        if m:
            d["voyage"] = m.group(1).strip()
    if not d["voyage"]:
        # Try to find voyage from vessel reference like "618W"
        m = re.search(r"\b([A-Z]{1,2}\d{3}[A-Za-z]?\s*/\s*\d{1,3})\b", text)
        if m:
            d["voyage"] = m.group(1).strip()

    # --- Ports ---
    m = re.search(r"(?:Port of Loading[^\n]*\n|Port de chargement[^\n]*\n|Port\s+de\s*chargement\s*[:\n])([^\n]+)", text)
    if m:
        ports = clean(m.group(1))
        toks = ports.split()
        if toks:
            d["port_of_discharge"] = toks[-1]
            if len(toks) > 1:
                d["port_of_loading"] = " ".join(toks[:-1])
    else:
        # Try to find ports from text like "Port de chargement" / "Port de déchargement"
        m = re.search(r"Port\s+de\s*chargement\s*[:\s]+([A-Za-z\s]+)\s*(?:Port\s+de\s*déchargement|Port\s+de\s*décharg|déchargement)?\s*[:\s]*([A-Za-z\s]*)", text, re.IGNORECASE)
        if m and not d["port_of_loading"]:
            d["port_of_loading"] = clean(m.group(1))
            d["port_of_discharge"] = clean(m.group(2)) if m.group(2) else ""
    # Direct port extraction (e.g., "Nktt-Port conteneurs")
    if not d["port_of_loading"]:
        m = re.search(r"(\w+)\s*[-–]?\s*Port\s+conteneurs", text, re.IGNORECASE)
        if m:
            port_name = m.group(1).lower()
            if port_name in PORT_COUNTRY:
                code, name = PORT_COUNTRY[port_name]
                d["port_of_loading"] = name
                d["country_of_origin_code"] = code
                d["country_of_origin"] = name
    # --- Expéditeur (Shipper) ---
    shipper_lines = block_between(
        lines,
        r"Shipper\s*\(",
        [r"Consignee\s*\(", r"^Consignee", r"\bNotify Party\b", r"Vessel\s*\("])
    if not shipper_lines:
        shipper_lines = block_between(
            text_lines,
            r"Shipper\s*\(|Expéditeur\s*\(|Exportateur\s*\(",
            [r"Consignee\s*\(|Consignataire\s*\(|Destinataire", r"^Consignee", r"\bNotify Party\b", r"Vessel\s*\(|Navire"])
    if shipper_lines:
        name = shipper_lines[0]
        parts = name.split()
        while parts and parts[-1].isdigit():
            parts.pop()
        d["shipper_name"] = " ".join(parts)
        addr_parts = []
        for a in shipper_lines[1:]:
            a2 = re.split(r"\s*(?:Export references\b|Svc Contract\b|Référence\s*douane)", a, maxsplit=1, flags=re.IGNORECASE)[0]
            if re.search(r"Onward inland", a2, re.IGNORECASE):
                break
            if re.fullmatch(r"\s*\d+\s*", a2):
                break
            if not a2.strip():
                break
            addr_parts.append(a2)
        d["shipper_address"] = clean(" ".join(addr_parts))
    # Final fallback: direct text search for shipper
    if not d["shipper_name"]:
        m = re.search(r"(RSMC\s+GROUP\s+[A-Za-z\s]+?)(?:\n)", text, re.IGNORECASE)
        if m:
            d["shipper_name"] = clean(m.group(1))
    # --- Destinataire (Consignee) + NIF ---
    d["consignee_nif"] = (first_match(r"\bNIF\s*[:.]?\s*([0-9]{7,9})", text)
                          or first_match(r"\bN\.?I\.?F\.?[:\s]*([0-9]{7,9})", text)
                          or first_match(r"\bNIF[:\s]*([0-9]{7,9})", text))
    consignee_lines = block_between(
        lines,
        r"Consignee\s*\(",
        [r"Vessel\s*\(", r"^\s*Notify Party\b"])
    if not consignee_lines:
        consignee_lines = block_between(
            text_lines,
            r"Consignee\s*\(|Consignataire\s*\(|Destinataire\s*\(",
            [r"Vessel\s*\(|Navire", r"^Notify Party", r"Exportateur|Expéditeur"])
    if consignee_lines:
        cleaned = []
        for ln in consignee_lines:
            ln2 = clean(ln)
            if not ln2:
                continue
            if re.match(r"^As principal,", ln2):
                ln2 = re.sub(r"^As principal,[^)]*\)\s*", "", ln2)
            ln2 = re.sub(r"^SAME\s+AS\s+CONSIGNEE\s*", "", ln2, flags=re.IGNORECASE)
            ln2 = re.sub(r"^(?:NIF\s*[:.]?\s*\d+\s*:?\s*)", "", ln2)
            ln2 = re.sub(r"\s+NIF\s*:?\s*\d+\b", "", ln2, flags=re.IGNORECASE)
            ln2 = re.sub(r"^(?:ADRESSE|ADDRESS|ADRESSE\s*:)\s*", "", ln2, flags=re.IGNORECASE)
            ln2 = re.sub(r"\s*(?:TEL/FAX|TEL|PHONE|MOB|FAX)\s*:.*$", "", ln2, flags=re.IGNORECASE)
            ln2 = re.sub(r"\s*(?:EMAIL|EMAII|E-MAIL|MAIL)\s*[: ]\s*\S+@\S+$", "", ln2, flags=re.IGNORECASE)
            ln2 = re.sub(r"\s*TEL\s*[:/]?\s*[-0-9]+", "", ln2, flags=re.IGNORECASE)
            ln2 = clean(ln2)
            if ln2:
                cleaned.append(ln2)
        if cleaned:
            name = cleaned[0]
            addr_extra = ""
            m = re.search(r"\b(?:ADRESSE|ADDRESS)\s*:", name, re.IGNORECASE)
            if m:
                addr_extra = name[m.start():]
                name = clean(name[:m.start()])
            addr_lines = []
            if addr_extra:
                addr_lines.append(re.sub(r"^\s*(?:ADRESSE|ADDRESS)\s*:?\s*", "", addr_extra, flags=re.IGNORECASE))
            addr_lines += cleaned[1:]
            folded = []
            for it in addr_lines:
                if not it:
                    continue
                if folded:
                    folded[-1] = merge_dedup(folded[-1], it)
                else:
                    folded.append(it)
            d["consignee_name"] = name
            addr = " ".join(folded)
            addr = re.sub(r"\s*\*+$", "", addr)
            if addr.lower().startswith(name.lower() + " "):
                addr = addr[len(name):].strip()
            d["consignee_address"] = addr
    else:
        # Fallback: search text directly for consignee
        m = re.search(r"([A-Z][A-Za-z\s]*\n)([A-Z][A-Za-z\s]*)\n(\d{8})", text)
        if m:
            d["consignee_name"] = clean(m.group(2))
            d["consignee_nif"] = d["consignee_nif"] or clean(m.group(3))
    # notify
    m = re.search(r"(?:Notify Party[^\n]*\n|Notification\s*[:\n]*)([^\n]+)", text)
    if m:
        d["notify_name"] = clean(m.group(1))

    # --- Conteneur / Scellé / Type: d'abord les lignes pdfplumber propres ---
    c_line = ""
    for ln in lines:
        if re.match(r"^\s*[A-Z]{4}\s?\d{7}\s+", ln):
            c_line = ln
            break
    if c_line:
        cm = re.match(r"^\s*([A-Z]{4})\s?(\d{7})\s*(.*)$", c_line)
        d["container_number"] = cm.group(1) + cm.group(2)
        rest = cm.group(3)
        sm = re.search(r"\b((?:ML|SL|FX|CN|AB|CR|SK|HJ|TH|TCL|SC|FJ|YX|CB|ZZ)\s?[-—–]?\s?[A-Z]{0,2}\s?\d{5,10})", rest)
        if sm:
            d["seal_number"] = re.sub(r"\s", "", sm.group(1))
        tm = re.search(r"\b(20|40)\s+(DRY|DV|GP|HC|HQ|HCQU|RF|REEFER)\b", rest, re.IGNORECASE)
        if tm:
            sz = tm.group(1)
            t = tm.group(2).upper()
            tt = "HC" if t in ("HC", "HQ", "HCQU") else ("RF" if t in ("RF", "REEFER") else "DV")
            d["container_type"] = f"{sz}{tt}"
    else:
        # --- Zones à texte superposé (Maersk): travailler sur le texte pypdf ---
        win = pypdf_text
        sidx = pypdf_text.lower().find("said to contain")
        if sidx >= 0:
            win = pypdf_text[sidx:sidx + 800]
        win = despace(win)
        # Conteneur
        m = re.search(r"\b([A-Z]{4}\d{7})\b", win)
        if m:
            d["container_number"] = m.group(1)
        else:
            m = re.search(r"\b([A-Z]{4})\s?(\d{7})\b", win)
            if m:
                d["container_number"] = m.group(1) + m.group(2)
        # Scellé
        m = re.search(r"\b((?:ML|SL|FX|CN|AB|CR|SK|HJ|TH|TCL|SC|FJ|YX|CB|ZZ)\s?[-—–]?\s?[A-Z]{0,2}\d{5,10})\b", win)
        if m:
            d["seal_number"] = re.sub(r"\s", "", m.group(1))
        # Type de conteneur (ex: "40 DRY", "20 GP")
        m = re.search(r"\b(20|40)\s+(?=(?:DR|DV|GP|HC|HQ|RF|REEFER))", win, re.IGNORECASE)
        if m:
            sz = m.group(1)
            typ = "HC" if re.search(rf"\b{sz}\s*(?:[^A-Za-z0-9]|$)\s*(HC|HQ|HCQU)", win, re.IGNORECASE) else \
                  ("RF" if re.search(rf"\b{sz}\s*(?:[^A-Za-z0-9]|$)\s*(RF|REEFER)", win, re.IGNORECASE) else "DV")
            d["container_type"] = f"{sz}{typ}"
    if not d["container_number"]:
        # dernière chance: chercher dans le texte pypdf (bon encodage)
        m = re.search(r"\b([A-Z]{4})\s?(\d{7})\b", text)
        if m:
            d["container_number"] = m.group(1) + m.group(2)
    if not d["container_number"]:
        m = re.search(r"\b(CN|CT)\s*(\d{3,4})\b", text, re.IGNORECASE)
        if m:
            d["container_number"] = m.group(1) + m.group(2)
    if not d["seal_number"]:
        m = re.search(r"\b((?:ML|SL|FX|CN|AB|CR|SK|HJ|TH|TCL|SC|FJ|YX|CB|ZZ)[-—–]?[A-Z]{0,2}\d{5,10})\b", text)
        if m:
            d["seal_number"] = m.group(1).replace(" ", "")
    if not d["container_type"]:
        mt = re.search(r"\b(20|40)\s*(?:[^A-Za-z]|\b)\s*(DRY|GP|HC|HQ|DV|RF|REEFER|REFCON|HCQU)\b", text, re.IGNORECASE)
        if mt:
            d["container_type"] = f"{mt.group(1)}{'HC' if mt.group(2).upper() in ('HC','HQ','HCQU') else ('RF' if mt.group(2).upper() in ('RF','REEFER','REFCON') else 'DV')}"
    if not d["container_type"]:
        mt = re.search(r"\b(20|40)\s*(?:DR|DV|GP|HC|HQ|RF|REEFER)", text, re.IGNORECASE)
        if mt:
            sz = mt.group(1)
            tt = "HC" if re.search(rf"\b{sz}\s*(?:HC|HQ|HCQU)", text, re.IGNORECASE) else ("RF" if re.search(rf"\b{sz}\s*(RF|REEFER)", text, re.IGNORECASE) else "DV")
            d["container_type"] = f"{sz}{tt}"
    if not d["container_type"]:
        # French container type pattern: CT400, CT200, etc.
        m = re.search(r"\bCT(\d{2,3})\b", text, re.IGNORECASE)
        if m:
            sz_str = m.group(1)
            # Map CT codes to actual container sizes
            ct_map = {"20": "20DV", "21": "20DV", "22": "20DV", "25": "20DV", "30": "20DV",
                      "40": "40DV", "41": "40DV", "42": "40DV", "43": "40DV",
                      "44": "40DV", "45": "40DV", "46": "40DV", "47": "40DV",
                      "48": "40DV", "49": "40DV", "50": "40DV"}
            sz = sz_str[:2]
            if sz in ct_map:
                d["container_type"] = ct_map[sz]
            elif sz_str.startswith("4"):
                d["container_type"] = "40DV"
            elif sz_str.startswith("2"):
                d["container_type"] = "20DV"
    if not d["container_type"]:
        # CN-prefixed containers
        m = re.search(r"\bCN(\d{2,3})\b", text, re.IGNORECASE)
        if m:
            sz = m.group(1)[:2]
            if sz in ("20", "21", "22"):
                d["container_type"] = "20DV"
            elif sz in ("40", "41", "42", "43", "44", "45", "46", "47", "48", "49"):
                d["container_type"] = "40DV"
    if not d["container_number"] and not d["container_type"]:
        # Try to find container reference in text
        m = re.search(r"(?:Ctr\.|Conteneur|Conteneur\s*(?:n°|#)?[:\s]*)[A-Z]{4}\d{4,7}", text, re.IGNORECASE)
        if m:
            d["container_number"] = re.sub(r"[^A-Z0-9]", "", m.group(0))[-11:]
    if not d["container_number"]:
        m = re.search(r"\b([A-Z]{4})\s?(\d{4,7})\b", text)
        if m and int(m.group(2)) >= 1000:
            d["container_number"] = m.group(1) + m.group(2)
    # Direct text search for shipper
    if not d["shipper_name"]:
        m = re.search(r"(RSMC\s+GROUP\s+[A-Za-z\s]+?)(?:\n)", text, re.IGNORECASE)
        if m:
            d["shipper_name"] = clean(m.group(1))
    # Direct text search for consignee
    if not d["consignee_name"]:
        m = re.search(r"\n(\d{8})\n([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)*)\n([A-Z][A-Za-z\s]+)", text)
        if m:
            d["consignee_nif"] = m.group(1)
            d["consignee_name"] = clean(m.group(2))
            d["consignee_address"] = clean(m.group(3))
    # Poids brut / Volume: chercher dans text (pypdf) avec formats français
    win = pypdf_text if pypdf_text else text
    sidx = win.lower().find("said to contain")
    if sidx >= 0:
        win = win[sidx:sidx + 800]
    win = despace(win)
    # Poids brut - formats français (11.000,000) et anglais
    m = re.search(r"(?<![\d.,])(\d[\d.,]*\d)\s*(KGS|KG|KILOGRAMS|kgs|kg)\b", win, re.IGNORECASE)
    if m:
        d["gross_weight_kg"] = fmt_money(norm_num(m.group(1)), 3)
    if not d["gross_weight_kg"]:
        m = re.search(r"(?<![\d.,])(\d{1,4}(?:[\.,]\d{3})+,\d{3})\s*KGS?\b", win, re.IGNORECASE)
        if m:
            d["gross_weight_kg"] = fmt_money(norm_num(m.group(1)), 3)
    # Volume
    m = re.search(r"(?<![\d.,])(\d[\d.,]*\d)\s*(CBM|M3)\b", win, re.IGNORECASE)
    if m:
        d["measurement_cbm"] = fmt_money(norm_num(m.group(1)), 4)

    # --- Colis / Poids / Volume ---
    pk_types = {"CTN": "CT", "CT": "CT", "CARTON": "CT", "CARTONS": "CT",
                "PKG": "PK", "PKGS": "PK", "PACKAGE": "PK", "PACKAGES": "PK", "PCS": "PK",
                "BDL": "BL", "BUNDLES": "BL", "BALES": "BL", "BLS": "BL",
                "PLT": "PX", "PALLETS": "PX", "SKIDS": "PX", "SKD": "PX",
                "UNITS": "UN", "UNIT": "UN", "SETS": "ST", "SET": "ST", "BAGS": "BG", "SACKS": "BG"}
    for ln in lines + text_lines:
        m = re.search(r"Said to Contain\s*(\d+)\s*([A-Z]+)", ln, re.IGNORECASE)
        if m:
            d["packages_count"] = m.group(1)
            pk = m.group(2).upper()
            d["packages_type"] = pk_types.get(pk, pk[:2])
            break
    if not d["packages_count"]:
        m = re.search(r"Said to Contain\s*(\d+)\s*([A-Z]+)?", win, re.IGNORECASE)
        if m:
            d["packages_count"] = m.group(1)
            pk = (m.group(2) or "").upper()
            d["packages_type"] = pk_types.get(pk, pk[:2] if pk else "CT")
    if not d["packages_count"]:
        m = re.search(r"\b(\d{2,5})\s+(?:CARTONS|CARTON|PACKAGES|PACKAGE|PCS|PKGS|CTN|BAGS|SACKS|COLIS|COLIS)", win, re.IGNORECASE)
        if m:
            d["packages_count"] = m.group(1)
    if not d["packages_count"]:
        m = re.search(r"Total\s*des\s*colis\s*[:\s]*(\d+)", text, re.IGNORECASE)
        if m:
            d["packages_count"] = m.group(1)
    # Package type from French labels
    if d["packages_count"] and not d["packages_type"] or d["packages_type"] == "CT":
        m = re.search(r"(?:CT|CTN|Carton|COLIS)\s*\d+|(\d+)\s*(?:CT|CTN|Carton|COLIS)", text, re.IGNORECASE)
        if m:
            d["packages_type"] = "CT"

    # fallback poids/volume sur texte complet
    if not d["gross_weight_kg"] or not d["measurement_cbm"]:
        wm = re.findall(r"(\d{1,4}(?:[\.,]\d{3})*\.\d{3})\s*(KGS|KILOGRAMS|KG\b|CBM|M3)", text, re.IGNORECASE)
        for val, unit in wm:
            num = norm_num(val)
            if unit.upper() in ("KGS", "KG", "KILOGRAMS"):
                if not d["gross_weight_kg"]:
                    d["gross_weight_kg"] = fmt_money(num, 3)
            else:
                if not d["measurement_cbm"]:
                    d["measurement_cbm"] = fmt_money(num, 4)
    if not d["gross_weight_kg"]:
        m = re.search(r"(\d{2,6}(?:[\.,]\d{1,3})?)\s*KGS?\b", text, re.IGNORECASE)
        if m:
            d["gross_weight_kg"] = fmt_money(norm_num(m.group(1)), 3)
    if not d["gross_weight_kg"]:
        # French format: 11.000,000 (11000.000 kg) - match without unit label
        m = re.search(r"(?<![\d.,])\d{1,4}(?:[\.,]\d{3})+,\d{3}", text)
        if m:
            d["gross_weight_kg"] = fmt_money(norm_num(m.group(0)), 3)
    if not d["measurement_cbm"]:
        m = re.search(r"(?<![\d.,])\d[\d.,]*\d\s*CBM", text, re.IGNORECASE)
        if m:
            d["measurement_cbm"] = fmt_money(norm_num(re.search(r"\d[\d.,]*\d", m.group(0)).group(0)), 4)

# --- Description de la marchandise ---
    desc_parts = []
    started = False
    for ln in lines + text_lines:
        if re.search(r"Said to Contain", ln, re.IGNORECASE):
            started = True
            continue
        if not started:
            continue
        if re.search(r"^\s*N/M\b", ln) or re.search(r"^\s*--", ln):
            break
        if re.search(r"^\s*[A-Z]{4}\s?\d{7}\b", ln):
            break
        if re.search(r"^\s*\d[\d.,]*\s*(KGS|CBM)\b", ln, re.IGNORECASE):
            break
        if re.search(r"^\s*SHIPPER'?S LOAD|^\s*FREIGHT|^\s*The Merchant|^\s*Above particulars|^\s*Carrier's Receipt", ln, re.IGNORECASE):
            break
        if re.search(r"\b(?:20|40)\s+(?:DRY|DV|GP|HC|HQ)\b.*\bCBM\b", ln, re.IGNORECASE):
            break
        desc_parts.append(clean(ln))
    g = clean(" ".join(desc_parts))
    if g:
        d["goods_description"] = g
    else:
        m = re.search(r"Said to Contain\s*\d+\s*[A-Z ]+?\s{1,4}([A-Z][A-Z0-9 .'-]+)", win, re.IGNORECASE)
        if m:
            g = clean(m.group(1))
            g = re.split(r"\s+--|\s+N/M\b|\s+FREIGHT\b|\s+SHIPPER'S LOAD|\s+Above particulars", g)[0]
            g = re.sub(r"\b[A-Z]{4}\s?\d{7}\b.*", "", g)
            if g and not re.match(r"^[\d\s.,]+$", g):
                d["goods_description"] = clean(g)
    if not d["goods_description"]:
        # Search for goods description in text (French B/L format)
        m = re.search(r"(?:Marchandise|Description|Désignation)\s*(?:des\s*)?(?:marchandises|biens)?[:\s]+(.{5,100})", text, re.IGNORECASE)
        if m:
            d["goods_description"] = clean(m.group(1))
    if not d["goods_description"]:
        # Look for description before container type code (e.g., "PRISE + GENTS" before "CT400")
        m = re.search(r"(PRISE\s*\+\s*GENTS|MARCHANDISES|DESCRIPTIF)\s*\n\s*CT\s*\d{2,3}", text, re.IGNORECASE)
        if m:
            d["goods_description"] = clean(m.group(1))
    if not d["goods_description"]:
        # Look for description in text lines before CT/CN container codes
        for i, ln in enumerate(text_lines):
            if re.search(r"\bCT\s*\d{2,3}\b", ln) or re.search(r"\bCN\s*\d{3,4}\b", ln):
                if i > 0:
                    prev = clean(text_lines[i - 1])
                    if prev and prev not in d["goods_description"]:
                        d["goods_description"] = prev
    if not d["goods_description"]:
        # Look for the area between shipper and container
        m = re.search(r"(?:IMPORT\s+AND\s+EXPORT|EXPORTATEUR|Expéditeur)[^\n]*\n([A-Z][A-Za-z\s+,\-]{5,60})\n(?:CT|CN)\d", text, re.IGNORECASE)
        if m:
            d["goods_description"] = clean(m.group(1))
    if d["goods_description"]:
        d["goods_description"] = re.sub(r"^[\*#]*", "", d["goods_description"]).strip()

    # --- Marques ---
    m = re.search(r"\bN/M\b", text)
    d["marks"] = "N/M" if m else ""

    # --- Conditions de fret ---
    ft = first_match(r"FREIGHT\s*(PREPAID|COLLECT)", text)
    if ft:
        d["freight_terms"] = "PREPAID" if ft.upper() == "PREPAID" else "COLLECT"
    it = first_match(r"\b(CFR|CIF|FOB|EXW|DAP|DDP|FCA|CPT|CIP)\b", text)
    if it:
        d["freight_terms"] = it.upper()
    if d["freight_terms"] == "CFR":
        m = re.search(r"(?:Condition\s*de\s*livraison|Condition\s*de\s*transport|Termes\s*de\s*livraison)[:\s]*(\w+)", text, re.IGNORECASE)
        if m and m.group(1).upper() in INCOTERMS:
            d["freight_terms"] = m.group(1).upper()
        # Also check for CFR/CCFR patterns in French text
        m = re.search(r"\bCCFR\b", text, re.IGNORECASE)
        if m:
            d["freight_terms"] = "CFR"

    # --- Date d'embarquement ---
    m = re.search(r"Shipped on Board\s*(?:Date[^\n]*)?\n?\s*(\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{2,4}|\d{2}-\d{2}-\d{4})", text)
    if m:
        d["shipment_date"] = m.group(1)
    else:
        m = re.search(r"(\d{4}-\d{2}-\d{2})", text)
        if m:
            d["shipment_date"] = m.group(1)
    if not d["shipment_date"]:
        # French date format: DD/MM/YYYY
        m = re.search(r"(\d{2}/\d{2}/\d{4})", text)
        if m:
            d["shipment_date"] = m.group(1)

    # --- Pays d'origine ---
    port = (d["port_of_loading"] or "").lower()
    if not port and d["container_number"]:
        port = ""
    code, name = PORT_COUNTRY.get(port, ("", ""))
    d["country_of_origin_code"] = code
    d["country_of_origin"] = name
    if not d["country_of_origin"]:
        # Try to find country name in text (French B/L)
        for ccode, cname in FRENCH_COUNTRY.items():
            if cname.lower() in text.lower():
                d["country_of_origin"] = cname
                d["country_of_origin_code"] = ccode
                break
        if not d["country_of_origin"]:
            m = re.search(r"(?:Pays\s*(?:d'origine|d'export|de\s*destination))[:\s]+([A-Za-z\s]+)", text, re.IGNORECASE)
            if m:
                cname = clean(m.group(1))
                d["country_of_origin"] = cname
    return d


# ----------------------------------------------------------------------------
# 3. Construction du XML (structure = modèle vide officiel vide.xml)
#    Le fichier template.xml (copie exacte de vide.xml) sert de squelette:
#    seuls les champs extraits de la bolyse sont remplis, le reste garde la
#    représentation du modèle (<null/> / balise vide / valeur par défaut).
# ----------------------------------------------------------------------------

def build_xml(d, currency, config):
    office = config["office"]
    declarant = config["declarant"]
    dest = config["destination"]

    gross = norm_num(d["gross_weight_kg"])
    packages = d["packages_count"] or ""
    package_type = d["packages_type"] or "CT"
    seal = d["seal_number"] or ""
    container = d["container_number"] or ""
    freight = d["freight_terms"] or ""
    bl = d["bl_number"] or ""
    vessel = d["vessel"] or ""
    goods = d["goods_description"] or ""
    origin_code = d["country_of_origin_code"] or ""
    origin_name = FRENCH_COUNTRY.get(origin_code) or (d["country_of_origin"] or "").title()
    dest_code = dest.get("code") or ""
    dest_name = FRENCH_COUNTRY.get(dest_code) or (dest.get("name") or "").title()
    port = d["port_of_loading"] or ""
    nif = d["consignee_nif"] or ""
    shipment_date = d["shipment_date"] or ""

    exporter_text = d["shipper_name"]
    if exporter_text and d["shipper_address"]:
        exporter_text = f"{exporter_text}\n{d['shipper_address']}"

    incoterm = freight.upper() if freight.upper() in INCOTERMS else config.get("default_incoterm", "CFR")

    kind_names = {"CT": "Carton", "PK": 'Colis ("package")', "BL": "Ballot",
                  "PX": "Palette", "UN": "Unité", "ST": "Lot", "BG": "Sac"}
    kind_name = kind_names.get(package_type, "Carton")

    if container:
        marks1 = container
        marks2 = goods
    else:
        marks1 = d["marks"] or ""
        marks2 = goods or ""

    # Type de conteneur au format ASYCUDA (20RG / 40RG)
    ct_raw = (d["container_type"] or "").upper()
    if ct_raw.startswith("20"):
        cont_type, cont_tare = "20RG", "2200"
    elif ct_raw.startswith("40"):
        cont_type, cont_tare = "40RG", "4400"
    else:
        cont_type, cont_tare = "40RG", "4400"

    consignee_text = d["consignee_name"]
    if consignee_text and d["consignee_address"]:
        consignee_text = f"{consignee_text}\n{d['consignee_address']}"

    with open(TEMPLATE_PATH, encoding="utf-8") as fh:
        root = ET.fromstring(fh.read())

    def setp(path, value):
        if value is None:
            return
        value = str(value)
        if value == "":
            return
        e = root.find(path)
        if e is None:
            raise ValueError(f"Chemin absent du modèle vide: {path}")
        for ch in list(e):
            e.remove(ch)
        e.text = value

    # --- Éléments fixes / constants (d'après les exports ASYCUDA réels) ---
    setp("Property/Sad_flow", "I")
    setp("Property/Nbers/Total_number_of_packages", packages)
    setp("Property/Place_of_declaration", config.get("place_of_declaration", ""))
    setp("Identification/Office_segment/Customs_clearance_office_code", office["code"])
    setp("Identification/Office_segment/Customs_Clearance_office_name", office["name"])
    setp("Identification/Type/Type_of_declaration", config.get("declaration_type", "IM"))
    setp("Identification/Type/Declaration_gen_procedure_code", config.get("procedure_code", "4"))
    setp("Declarant/Declarant_code", declarant["code"])
    setp("Declarant/Declarant_name", declarant["name"])
    setp("Declarant/Declarant_representative", declarant["representative"])
    setp("Identification/Manifest_reference_number", bl)
    setp("Traders/Exporter/Exporter_name", exporter_text)
    setp("Traders/Consignee/Consignee_code", nif)
    setp("Traders/Consignee/Consignee_name", consignee_text)
    setp("General_information/Country/Country_first_destination", origin_code)
    setp("General_information/Country/Trading_country", origin_code)
    setp("General_information/Country/Export/Export_country_code", origin_code)
    setp("General_information/Country/Export/Export_country_name", origin_name)
    setp("General_information/Country/Destination/Destination_country_code", dest_code)
    setp("General_information/Country/Destination/Destination_country_name", dest_name)
    setp("General_information/Country/Country_of_origin_name", origin_name)
    setp("General_information/Value_details", "0")
    setp("Transport/Means_of_transport/Departure_arrival_information/Identity", vessel)
    setp("Transport/Means_of_transport/Border_information/Identity", vessel)
    setp("Transport/Means_of_transport/Border_information/Mode", "01")
    setp("Transport/Container_flag", "true" if container else "false")
    setp("Transport/Delivery_terms/Code", incoterm)
    setp("Transport/Border_office/Code", office["code"])
    setp("Transport/Border_office/Name", office["name"])
    setp("Financial/Financial_transaction/code1", "1")
    setp("Financial/Financial_transaction/code2", "0")
    setp("Financial/Mode_of_payment", config["mode_of_payment"])
    setp("Financial/Guarantee/Amount", "0")
    setp("Valuation/Total/Total_weight", f"{gross:.1f}")
    setp("Item/Packages/Number_of_packages", packages)
    setp("Item/Packages/Marks1_of_packages", marks1)
    setp("Item/Packages/Marks2_of_packages", marks2)
    setp("Item/Packages/Kind_of_packages_code", package_type)
    setp("Item/Packages/Kind_of_packages_name", kind_name)
    setp("Item/IncoTerms/Code", incoterm)
    setp("Item/Tarification/Extended_customs_procedure", config.get("extended_customs_procedure", "4000"))
    setp("Item/Tarification/National_customs_procedure", config.get("national_customs_procedure", "000"))
    setp("Item/Tarification/Value_item", "0,00+0,00+0,00+0,00-0,00")
    setp("Item/Goods_description/Country_of_origin_code", origin_code)
    setp("Item/Goods_description/Description_of_goods", goods)
    setp("Item/Goods_description/Commercial_Description", goods)
    setp("Item/Previous_doc/Previous_document_reference", bl)
    setp("Item/Valuation_item/Weight_itm/Gross_weight_itm", str(int(gross)))
    setp("Item/Valuation_item/Weight_itm/Net_weight_itm", str(int(gross)))
    setp("Item/Valuation_item/Item_Invoice/Currency_code", currency)

    # --- Conteneur (1 bloc) ---
    cont = root.find("Container")
    if cont is not None and container:
        cid = container.split()[0]
        setp("Container/Item_Number", "1")
        setp("Container/Container_identity", cid)
        setp("Container/Container_type", cont_type)
        setp("Container/Gross_weight", cont_tare)
        setp("Container/Goods_description", goods)
        setp("Container/Packages_type", package_type)
        setp("Container/Packages_number", packages)
        setp("Container/Packages_weight", str(int(gross)))

    # --- Documents attachés (271/380/705) ---
    docs_by_code = {str(doc["code"]): doc for doc in config.get("attached_documents", [])}
    for att in root.findall("Item/Attached_documents"):
        code = att.findtext("Attached_document_code") or ""
        doc = docs_by_code.get(code)
        if not doc:
            continue
        ref = ""
        if doc.get("reference") == "bl_number":
            ref = bl
        elif doc.get("reference"):
            ref = str(doc["reference"])
        dtxt = shipment_date if doc.get("date") == "shipment_date" else (doc.get("date") or "")
        for tag, val in (("Attached_document_reference", ref),
                         ("Attached_document_date", dtxt)):
            e = att.find(tag)
            if e is not None and val:
                for ch in list(e):
                    e.remove(ch)
                e.text = str(val)

    # --- Tarification: liste des documents attachés (ordre croissant des codes) ---
    codes = sorted(str(d["code"]) for d in config.get("attached_documents", []))
    if codes:
        setp("Item/Tarification/Attached_doc_item", " ".join(codes) + " ")

    return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + serialize_flat(root)

# ----------------------------------------------------------------------------
# 5. I/O
# ----------------------------------------------------------------------------

def list_pdfs(folder):
    out = []
    for root, _dirs, files in os.walk(folder):
        for f in files:
            if f.lower().endswith(".pdf"):
                out.append(os.path.join(root, f))
    return sorted(out)


def choose_files(folder):
    pdfs = list_pdfs(folder)
    if not pdfs:
        print("Aucun fichier PDF trouvé dans", folder)
        print("  → Déposez le PDF de la nouvelle bolyse dans ce dossier,")
        print("    ou lancez: python bl_to_xml.py <chemin/du/fichier.pdf>")
        return []
    print("\nFichiers PDF trouvés (bolyses disponibles):")
    for i, p in enumerate(pdfs, 1):
        print(f"  [{i}] {os.path.basename(p)}")
    print("  [a] Tous les fichiers")
    print("  [f] Ajouter une nouvelle bolyse (indiquer le chemin du PDF)")
    print("  [q] Quitter")
    while True:
        choice = input("\nChoisissez (numéros, 'a', 'f', ou 'q'): ").strip().lower()
        if choice == "q":
            return []
        if choice == "a":
            return pdfs
        if choice == "f":
            p = input("Chemin du PDF: ").strip().strip('"')
            if os.path.isfile(p) and p.lower().endswith(".pdf"):
                return [os.path.abspath(p)]
            print("Fichier introuvable. Réessayez.")
            continue
        try:
            idxs = [int(x) for x in choice.split(",")]
            return [pdfs[i - 1] for i in idxs if 1 <= i <= len(pdfs)]
        except ValueError:
            print("Saisie invalide, réessayez.")


def print_summary(d):
    print("\n" + "=" * 60)
    print("DONNÉES EXTRAITES DE LA BOLYSE")
    print("=" * 60)
    rows = [
        ("B/L No.", d["bl_number"]),
        ("SCAC", d["scac"]),
        ("Navire", d["vessel"]),
        ("Voyage", d["voyage"]),
        ("Port chargement", d["port_of_loading"]),
        ("Port déchargement", d["port_of_discharge"]),
        ("Expéditeur", d["shipper_name"]),
        ("Adresse exp.", d["shipper_address"]),
        ("Destinataire", d["consignee_name"]),
        ("NIF", d["consignee_nif"]),
        ("Adresse dest.", d["consignee_address"]),
        ("Conteneur", d["container_number"]),
        ("Scellé", d["seal_number"]),
        ("Type conteneur", d["container_type"]),
        ("Colis", d["packages_count"]),
        ("Type colis", d["packages_type"]),
        ("Poids brut (kg)", d["gross_weight_kg"]),
        ("Volume (CBM)", d["measurement_cbm"]),
        ("Marchandise", d["goods_description"]),
        ("Marques", d["marks"]),
        ("Fret", d["freight_terms"]),
        ("Date embarquement", d["shipment_date"]),
        ("Pays origine", d["country_of_origin"]),
    ]
    for k, v in rows:
        print(f"  {k:<20}: {v or '—'}")


def process_one(pdf_path, args, config):
    print(f"\n>>> Traitement: {os.path.basename(pdf_path)}")
    lines, pypdf_text = extract_pdf(pdf_path)
    if not lines:
        print("  ⚠ Aucun texte extractible (PDF scanné ?). Ignoré.")
        return None
    d = parse_bl(lines, pypdf_text=pypdf_text)

    if args.verbose or args.dry_run:
        print_summary(d)

    if args.dry_run:
        return d

    currency = args.currency or config.get("default_currency", "USD")
    if args.currency is None:
        cur = input(f"Devise [{currency}]: ").strip().upper()
        if cur:
            currency = cur

    if not args.yes:
        ok = input("\nConfirmer la génération du XML ? [o/N] ").strip().lower()
        if ok not in ("o", "oui", "y", "yes"):
            print("  Annulé.")
            return None

    out_dir = args.out or os.path.join(HERE, "output")
    os.makedirs(out_dir, exist_ok=True)
    base = os.path.splitext(os.path.basename(pdf_path))[0]
    out_path = os.path.join(out_dir, f"{base}.xml")
    xml = build_xml(d, currency, config)
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(xml)
    print(f"  ✔ XML généré: {out_path}")
    return d


def main():
    ap = argparse.ArgumentParser(description="BL → XML ASYCUDA (Mauritanie) — 100% local, sans API")
    ap.add_argument("files", nargs="*", help="Fichiers PDF à traiter")
    ap.add_argument("--folder", default=None, help="Traiter tous les PDF d'un dossier")
    ap.add_argument("--currency", default=None)
    ap.add_argument("--out", default=None)
    ap.add_argument("--yes", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    try:
        config = load_config()
    except Exception as exc:
        print("Erreur config.json:", exc)
        return 1

    targets = []
    if args.files:
        for f in args.files:
            if os.path.isfile(f):
                targets.append(os.path.abspath(f))
            else:
                print(f"⚠ Fichier introuvable: {f}")
    elif args.folder:
        targets = list_pdfs(args.folder)
    else:
        targets = choose_files(DEFAULT_SCAN_DIR)

    if not targets:
        print("Aucun fichier à traiter.")
        return 1

    done = 0
    for t in targets:
        try:
            r = process_one(t, args, config)
            if r:
                done += 1
        except Exception as exc:
            print(f"  ✗ Erreur: {exc}")
    print(f"\nTerminé: {done}/{len(targets)} fichiers traités.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
