# BL → XML ASYCUDA (Mauritanie) — Notes du projet

Créé et amélioré avec opencode. Outil 100 % local, sans API : il lit les connaissements
(bill of lading) Maersk en PDF et génère la déclaration XML ASYCUDA.

## Emplacement
- Script principal : `bl_to_xml.py`
- Configuration (taux, bureau, déclarant...) : `config.json`
- XML générés : `output\`
- Ce fichier : `NOTES.md`

## Utilisation
```powershell
cd C:\Users\LMR\Downloads\BLtoXML
python bl_to_xml.py                              # scanne Downloads + menu de choix
python bl_to_xml.py <fichier.pdf>                # traite un fichier précis
python bl_to_xml.py --folder <dossier>
python bl_to_xml.py --yes <fichier.pdf>          # génère sans confirmation
python bl_to_xml.py --dry-run <fichier.pdf>      # extraction seule (test)
```

### Ajouter une nouvelle bolyse
1. Déposer le PDF dans `C:\Users\LMR\Downloads`, puis `python bl_to_xml.py` et choisir son numéro dans la liste, OU
2. Choisir `f` dans le menu pour saisir le chemin du PDF, OU
3. Passer le chemin directement : `python bl_to_xml.py "C:\...\nom.pdf"`

## Ce qui a été accompli (extraction Maersk)
- **Double extraction** : pdfplumber (lignes propres, sections) + pypdf (texte compacté,
  fiable dans les zones à texte superposé). `extract_pdf()` retourne `(lines, pypdf_text)`.
- **Conteneur / scellé / type** : d'abord la ligne conteneur pdfplumber
  (`MRKU5841117 ML-CN3838289 40 DRY ...`), repli sur fenêtre pypdf "Said to Contain",
  puis texte complet. Types : 20/40 + DV/HC/RF.
- **Poids brut / volume (CBM)** : fenêtre pypdf autour de "Said to Contain"
  (`(?<![\d.,])(\d[\d.,]*\d)\s*(KGS|KG|KILOGRAMS)\b`), repli sur le texte complet.
- **Colis + type** : ligne pdfplumber "Said to Contain 750 CARTONS" (insensible à la casse),
  mapping type (CARTONS→CT, PACKAGES/PCS/PKGS→PK, UNITS→UN, PALLETS→PX, BAGS→BG...).
- **Marchandise** : lignes pdfplumber après "Said to Contain", arrêt sur N/M, `--`,
  ligne conteneur, poids, SHIPPER'S LOAD, FREIGHT, The Merchant(s), Above particulars,
  ligne conteneur dupliquée (contient 20/40 DRY... CBM).
- **Expéditeur** : nom sans le n° de booking en fin de ligne ; adresse arrêtée à
  "Export references" / "Svc Contract" / n° de contrat seul / "Onward inland routing".
- **Destinataire** : séparation nom/adresse, nettoyage NIF / ADRESSE / TEL / PHONE / EMAIL,
  dédoublonnage des colonnes dupliquées via `merge_dedup` (overlap).
- **`despace()`** : recolle les lettres éclatées des PDF Maersk
  (`P ACKAGES` → `PACKAGES`, `SOLAR P ANEL L OCK` → `SOLAR PANEL LOCK`).
- **NIF consignataire**, navire/voyage, ports, date embarquement, incoterms : OK.

## Réglages
- `default_currency` dans `config.json` = **MRU** (Ouguiya) — modifié le dernier jour.
- Taxes : DD 20 %, RS 1 %, PSC 1 %, PC 0,5 % (base CIF), IMF 2 % (CIF+DD),
  TVA 16 % (base cumulée) — voir `config.json`.

## Limites connues
- PDF **masonnés** (scannés) : aucun texte → ignorés.
- **Delivery Order** : extraction partielle (ce n'est pas un connaissement).
- "OTR FREIGHT LLC 076.pdf", "PDF4605622442572064255.pdf", "Packing list 3524.pdf"
  testés : non reconnus comme bolyse Maersk (scannés / autre format).
- Console Windows : encodage corrigé via `sys.stdout.reconfigure(utf-8, errors="replace")`
  pour éviter le plantage sur les caractères ✔ / ⚠.

## Validation
- 28 bolyse `*_CertifiedTrueCopy.pdf` testées : 0 champ vide restant (conteneur,
  scellé, poids, volume, marchandise, expéditeur/destinataire, NIF...).
- Test bout-en-bout OK : extraction → calcul taxes → `output\<BL>.xml`.
