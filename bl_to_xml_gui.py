#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Interface graphique (tkinter) : PDF -> XML ASYCUDA (Mauritanie)."""
import os
import sys
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bl_to_xml as core

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DEFAULT = os.path.join(HERE, "output")

CURRENCIES = ["MRU", "USD", "EUR", "CNY", "AED", "OMR"]
FREIGHT_OPTIONS = ["CFR", "CIF", "FOB", "EXW", "DAP", "DDP", "PREPAID", "COLLECT"]
PACKAGE_OPTIONS = ["CT", "PK", "BL", "PX", "UN", "ST", "BG"]

FIELD_LABELS = [
    ("bl_number", "B/L No."),
    ("vessel", "Navire"),
    ("voyage", "Voyage"),
    ("port_of_loading", "Port de chargement"),
    ("port_of_discharge", "Port de déchargement"),
    ("shipper_name", "Expéditeur"),
    ("shipper_address", "Adresse expéditeur"),
    ("consignee_name", "Destinataire"),
    ("consignee_nif", "NIF"),
    ("consignee_address", "Adresse destinataire"),
    ("container_number", "Conteneur"),
    ("seal_number", "Scellé"),
    ("container_type", "Type conteneur"),
    ("packages_count", "Nombre de colis"),
    ("packages_type", "Type de colis"),
    ("gross_weight_kg", "Poids brut (kg)"),
    ("measurement_cbm", "Volume (CBM)"),
    ("goods_description", "Description de la marchandise"),
    ("marks", "Marques"),
    ("freight_terms", "Conditions fret"),
    ("shipment_date", "Date d'embarquement"),
    ("country_of_origin", "Pays d'origine"),
]

MULTILINE = {"goods_description"}


class ScrollableFrame(ttk.Frame):
    def __init__(self, parent):
        super().__init__(parent)
        self.canvas = tk.Canvas(self, highlightthickness=0)
        self.scroll = ttk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        self.inner = ttk.Frame(self.canvas)
        self.inner.bind(
            "<Configure>",
            lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all")),
        )
        self.win = self.canvas.create_window((0, 0), window=self.inner, anchor="nw")
        self.canvas.configure(yscrollcommand=self.scroll.set)
        self.canvas.pack(side="left", fill="both", expand=True)
        self.scroll.pack(side="right", fill="y")
        self.canvas.bind(
            "<Configure>",
            lambda e: self.canvas.itemconfigure(self.win, width=e.width),
        )
        self.canvas.bind_all(
            "<MouseWheel>",
            lambda e: self.canvas.yview_scroll(int(-1 * (e.delta / 120)), "units"),
        )


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("BL → XML ASYCUDA (Mauritanie)")
        self.geometry("920x760")
        self.minsize(760, 560)
        try:
            self.config = core.load_config()
        except Exception:
            self.config = {}
        self.currency = tk.StringVar(value=self.config.get("default_currency", "MRU"))
        self.pdf_path = tk.StringVar()
        self.out_dir = tk.StringVar(value=OUT_DEFAULT)
        self.status = tk.StringVar(value="Sélectionnez un fichier PDF de bolyse.")
        self.entries = {}
        self.last_out = ""
        self._build_ui()

    def _build_ui(self):
        top = ttk.Frame(self, padding=(10, 8))
        top.pack(fill="x")
        ttk.Label(top, text="Fichier PDF:").pack(side="left")
        ttk.Entry(top, textvariable=self.pdf_path).pack(
            side="left", fill="x", expand=True, padx=6
        )
        ttk.Button(top, text="Parcourir…", command=self.on_browse).pack(side="left")
        ttk.Button(top, text="Extraire", command=self.on_browse).pack(side="left", padx=4)

        body = ScrollableFrame(self)
        body.pack(fill="both", expand=True, padx=10, pady=6)

        grid = body.inner
        grid.columnconfigure(1, weight=1)
        row = 0
        for key, label in FIELD_LABELS:
            ttk.Label(grid, text=f"{label}:").grid(
                row=row, column=0, sticky="ne", padx=(0, 8), pady=3
            )
            if key in MULTILINE:
                w = tk.Text(grid, height=3, width=60, wrap="word")
                w.grid(row=row, column=1, sticky="ew", pady=3)
            elif key == "packages_type":
                w = ttk.Combobox(grid, values=PACKAGE_OPTIONS, width=30)
                w.grid(row=row, column=1, sticky="ew", pady=3)
            elif key == "freight_terms":
                w = ttk.Combobox(grid, values=FREIGHT_OPTIONS, width=30)
                w.grid(row=row, column=1, sticky="ew", pady=3)
            else:
                w = ttk.Entry(grid, width=60)
                w.grid(row=row, column=1, sticky="ew", pady=3)
            self.entries[key] = w
            row += 1

        if "country_of_origin" in self.entries:
            self.entries["country_of_origin"].configure(state="readonly")
        self.entries["port_of_loading"].bind("<KeyRelease>", self._update_origin)

        bottom = ttk.Frame(self, padding=(10, 8))
        bottom.pack(fill="x")
        ttk.Label(bottom, text="Devise:").pack(side="left")
        ttk.Combobox(
            bottom, textvariable=self.currency, values=CURRENCIES, width=8
        ).pack(side="left", padx=(4, 12))
        ttk.Label(bottom, text="Dossier de sortie:").pack(side="left")
        ttk.Entry(bottom, textvariable=self.out_dir).pack(
            side="left", fill="x", expand=True, padx=6
        )
        ttk.Button(bottom, text="…", width=3, command=self.on_pick_out).pack(side="left")
        ttk.Button(bottom, text="Ouvrir le dossier", command=self.on_open_folder).pack(
            side="left", padx=6
        )

        actions = ttk.Frame(self, padding=(10, 4, 10, 10))
        actions.pack(fill="x")
        ttk.Button(
            actions, text="Générer le XML", command=self.on_generate, width=24
        ).pack(side="left")
        ttk.Label(actions, textvariable=self.status).pack(
            side="left", padx=12, anchor="w"
        )

    def _update_origin(self, _event=None):
        port = self.entries["port_of_loading"].get().strip().lower()
        code, name = core.PORT_COUNTRY.get(port, ("", ""))
        self.entries["country_of_origin"].configure(state="normal")
        self.entries["country_of_origin"].delete(0, "end")
        if code:
            self.entries["country_of_origin"].insert(
                0, f"{name} ({code})"
            )
        self.entries["country_of_origin"].configure(state="readonly")

    def on_browse(self):
        path = filedialog.askopenfilename(
            title="Choisir une bolyse (PDF)",
            filetypes=[("Fichiers PDF", "*.pdf"), ("Tous les fichiers", "*.*")],
        )
        if not path:
            return
        self.pdf_path.set(path)
        self.status.set("Extraction en cours…")
        self.update_idletasks()
        try:
            lines, pypdf_text = core.extract_pdf(path)
            if not lines:
                messagebox.showerror(
                    "Erreur", "Aucun texte extractible (PDF scanné ?)."
                )
                self.status.set("Aucun texte extractible.")
                return
            d = core.parse_bl(lines, pypdf_text=pypdf_text)
        except Exception as exc:
            messagebox.showerror("Erreur", f"Échec de l'extraction:\n{exc}")
            self.status.set("Erreur d'extraction.")
            return
        self._populate(d)
        self.status.set(
            f"Extraite: B/L {d.get('bl_number') or '—'} · {d.get('vessel') or '—'}"
        )

    def _populate(self, d):
        for key, w in self.entries.items():
            value = d.get(key, "")
            if key in MULTILINE:
                w.delete("1.0", "end")
                w.insert("1.0", value)
            else:
                w.configure(state="normal")
                w.delete(0, "end")
                w.insert(0, value)
                w.configure(state="readonly") if key == "country_of_origin" else None
        self._update_origin()

    def _getval(self, w):
        if isinstance(w, tk.Text):
            return w.get("1.0", "end-1c").strip()
        return w.get().strip()

    def on_generate(self):
        pdf = self.pdf_path.get()
        if not pdf:
            messagebox.showwarning("Aucun PDF", "Veuillez d'abord sélectionner un PDF.")
            return
        try:
            lines, pypdf_text = core.extract_pdf(pdf)
            d = core.parse_bl(lines, pypdf_text=pypdf_text)
        except Exception as exc:
            messagebox.showerror("Erreur", f"Échec de l'extraction:\n{exc}")
            return
        for key, w in self.entries.items():
            d[key] = self._getval(w)
        port = d["port_of_loading"].strip().lower()
        code, name = core.PORT_COUNTRY.get(port, ("", ""))
        d["country_of_origin_code"] = code
        d["country_of_origin"] = name

        currency = self.currency.get().strip().upper() or "MRU"
        try:
            xml = core.build_xml(d, currency, self.config)
        except Exception as exc:
            messagebox.showerror("Erreur", f"Échec de la génération:\n{exc}")
            return

        out_dir = self.out_dir.get().strip() or OUT_DEFAULT
        os.makedirs(out_dir, exist_ok=True)
        fname = (d["bl_number"] or os.path.splitext(os.path.basename(pdf))[0]).replace("/", "_")
        out_path = os.path.join(out_dir, f"{fname}.xml")
        with open(out_path, "w", encoding="utf-8") as fh:
            fh.write(xml)
        self.last_out = out_path
        self.status.set(f"XML généré: {out_path}")
        messagebox.showinfo(
            "Succès", f"Fichier XML généré:\n{out_path}\n\nPrêt à télécharger / transférer."
        )

    def on_pick_out(self):
        folder = filedialog.askdirectory(title="Choisir le dossier de sortie")
        if folder:
            self.out_dir.set(folder)

    def on_open_folder(self):
        folder = self.out_dir.get().strip()
        if not os.path.isdir(folder):
            folder = OUT_DEFAULT
        try:
            os.startfile(os.path.dirname(self.last_out) if self.last_out else folder)
        except Exception:
            pass


def main():
    app = App()
    app.mainloop()


if __name__ == "__main__":
    main()
