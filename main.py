from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder="Components", static_url_path="")
CORS(app)

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "Apresentação.xlsx"
DATA_SHEET = "Bloqueado por Mês"
DATA_SHEET_CORTE = "Corte"
DATA_SHEET_CORTE_2 = "Corte-motivos"
DATA_SHEET_INVENTARIO = "Inventario"
DATA_SHEET_INVENTARIO_2 = "Inventario - Valores"


def LoadData(file_path, sheet_name):
    try:
        data = pd.read_excel(file_path, sheet_name=sheet_name)
        return data
    except Exception as e:
        print(f"An error occurred while loading the data: {e}")
        return None
    
def converter_valor(valor):
    try:
        if isinstance(valor, str):
            valor = valor.replace("R$", "").replace(".", "").replace(",", ".").strip()
            return float(valor)
        return float(valor)
    except ValueError:
        return 0.0
    
def convert_percentage(valor):
    try:
        if isinstance(valor, str):
            valor = valor.replace("%", "").replace(",", ".").strip()
            valor_float = float(valor)
        else:
            valor_float = float(valor)

        if valor_float > 1:
            return valor_float / 100

        return valor_float
    except ValueError:
        return 0.0

def ProcessData(data):
    try:
        data = data.copy()
        colunas_formatadas = ["R$ Bloq. no ESTOQUE", "Acumulativo", "%"]
        for coluna in colunas_formatadas:
            if coluna == "%":
                data[coluna] = data[coluna].apply(convert_percentage)
            else:
                data[coluna] = data[coluna].apply(converter_valor)
        return data
    except Exception as e:
        print(f"An error occurred while processing the data: {e}")
        return None


def _normalize_column_name(name: str) -> str:
    replacements = {
        "�": "ê",
        "á": "a",
        "ã": "a",
        "â": "a",
        "é": "e",
        "ê": "e",
        "í": "i",
        "ó": "o",
        "ô": "o",
        "ú": "u",
        "ç": "c",
    }
    normalized = name.strip().lower()
    for src, dst in replacements.items():
        normalized = normalized.replace(src, dst)
    return normalized


def _find_column(dataframe, target_keyword):
    target_keyword = target_keyword.lower()
    for column in dataframe.columns:
        normalized = _normalize_column_name(column)
        if target_keyword in normalized:
            return column
    raise KeyError(f"Column containing '{target_keyword}' not found in dataframe")


@lru_cache(maxsize=None)
def _load_sheet(sheet_name: str):
    dataframe = LoadData(str(DATA_FILE), sheet_name)
    if dataframe is None:
        return None
    return dataframe


def load_processed_dataframe():
    dataframe = _load_sheet(DATA_SHEET)
    if dataframe is None:
        return None
    return ProcessData(dataframe)


def load_corte_dataframe():
    dataframe = _load_sheet(DATA_SHEET_CORTE)
    if dataframe is None:
        return None
    dataframe = dataframe.copy()

    try:
        if "Rótulos de Linha" in dataframe.columns:
            dataframe["Rótulos de Linha"] = dataframe["Rótulos de Linha"].astype(str)

        if "Soma de Valor Total" in dataframe.columns:
            dataframe["Soma de Valor Total"] = dataframe["Soma de Valor Total"].apply(converter_valor)

        if "FATURAMENTO" in dataframe.columns:
            dataframe["FATURAMENTO"] = dataframe["FATURAMENTO"].apply(converter_valor)

        if "%" in dataframe.columns:
            dataframe["%"] = dataframe["%"].apply(convert_percentage)

        if "META" in dataframe.columns:
            dataframe["META"] = dataframe["META"].apply(convert_percentage)
    except Exception as error:
        print(f"An error occurred while processing the Corte data: {error}")

    return dataframe


def load_corte_motivos_dataframe():
    dataframe = _load_sheet(DATA_SHEET_CORTE_2)
    if dataframe is None:
        return None
    dataframe = dataframe.copy()

    try:
        if "Motivos" in dataframe.columns:
            dataframe["Motivos"] = dataframe["Motivos"].astype(str)

        if "Soma de Valor Total" in dataframe.columns:
            dataframe["Soma de Valor Total"] = dataframe["Soma de Valor Total"].apply(converter_valor)
    except Exception as error:
        print(f"An error occurred while processing the Corte Motivos data: {error}")

    return dataframe


def load_inventario_dataframe():
    dataframe = _load_sheet(DATA_SHEET_INVENTARIO)
    if dataframe is None:
        return None
    dataframe = dataframe.copy()

    try:
        if "Realizado" in dataframe.columns:
            dataframe["Realizado"] = dataframe["Realizado"].apply(convert_percentage)

        if "Meta" in dataframe.columns:
            dataframe["Meta"] = dataframe["Meta"].apply(convert_percentage)
    except Exception as error:
        print(f"An error occurred while processing the Inventario data: {error}")

    return dataframe


def load_inventario_valores_dataframe():
    dataframe = _load_sheet(DATA_SHEET_INVENTARIO_2)
    if dataframe is None:
        return None
    dataframe = dataframe.copy()

    try:
        valor_columns = {
            "Estoque Contado Acumulado": converter_valor,
            "11 Ajuste Inv. Falta": converter_valor,
            "5 Ajuste Inv. Sobra": converter_valor,
            "Valor Absoluto": converter_valor,
            "Valor Modular": converter_valor,
        }

        for column_name, converter in valor_columns.items():
            if column_name in dataframe.columns:
                dataframe[column_name] = dataframe[column_name].apply(converter)

        if "% Ajuste" in dataframe.columns:
            dataframe["% Ajuste"] = dataframe["% Ajuste"].apply(convert_percentage)
    except Exception as error:
        print(f"An error occurred while processing the Inventario Valores data: {error}")
    return dataframe


def _coerce_value(value: Any):
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if pd.isna(value):
        return None
    if isinstance(value, (float, int, str, bool)):
        return value
    return str(value)


def _serialize_dataframe(dataframe: pd.DataFrame):
    return {
        "columns": list(dataframe.columns),
        "rows": [
            {column: _coerce_value(row[column]) for column in dataframe.columns}
            for _, row in dataframe.iterrows()
        ],
    }


@app.route("/api/bloqueado", methods=["GET"])
def get_bloqueado_mensal():
    dataframe = load_processed_dataframe()
    if dataframe is None or dataframe.empty:
        return jsonify({"error": "Dados indisponiveis"}), 500

    mes_column = _find_column(dataframe, "mes")
    dia_column = _find_column(dataframe, "dia")

    labels = [f"{dia} {mes}" for dia, mes in zip(dataframe[dia_column], dataframe[mes_column])]
    valores = [float(valor) for valor in dataframe["R$ Bloq. no ESTOQUE"].fillna(0)]
    percentuais = [float(valor) * 100 for valor in dataframe["%"].fillna(0)]
    acumulativos = [float(valor) for valor in dataframe["Acumulativo"].fillna(0)]

    largest_positive_index = max(range(len(percentuais)), key=lambda i: percentuais[i], default=None)
    largest_negative_index = min(range(len(percentuais)), key=lambda i: percentuais[i], default=None)

    largest_positive = None
    if largest_positive_index is not None and percentuais[largest_positive_index] > 0:
        largest_positive = {
            "label": labels[largest_positive_index],
            "percent": percentuais[largest_positive_index],
        }

    largest_negative = None
    if largest_negative_index is not None and percentuais[largest_negative_index] < 0:
        largest_negative = {
            "label": labels[largest_negative_index],
            "percent": percentuais[largest_negative_index],
        }

    tendencia = {
        "direction": "Estável",
        "delta": 0.0,
        "status": "neutral",
        "start_label": labels[0] if labels else "",
        "end_label": labels[-1] if labels else "",
    }

    if len(valores) >= 2:
        delta = float(valores[-1] - valores[0])
        referencia = abs(valores[0]) if valores[0] != 0 else abs(valores[-1])
        tolerancia = max(referencia * 0.005, 1.0)

        if delta > tolerancia:
            tendencia.update({"direction": "Alta", "status": "bad"})
        elif delta < -tolerancia:
            tendencia.update({"direction": "Queda", "status": "good"})

        tendencia["delta"] = delta

    acumulativo_total = float(sum(acumulativos))

    payload = {
        "labels": labels,
        "bars": valores,
        "line": percentuais,
        "acumulativos": acumulativos,
        "metrics": {
            "largest_positive": largest_positive,
            "largest_negative": largest_negative,
            "trend": tendencia,
            "acumulativo_sum": acumulativo_total,
        },
    }

    return jsonify(payload)


@app.route("/api/corte", methods=["GET"])
def get_corte():
    dataframe = load_corte_dataframe()
    if dataframe is None or dataframe.empty:
        return jsonify({"error": "Dados indisponiveis"}), 500

    payload = _serialize_dataframe(dataframe)
    return jsonify(payload)


@app.route("/api/corte/motivos", methods=["GET"])
def get_corte_motivos():
    dataframe = load_corte_motivos_dataframe()
    if dataframe is None or dataframe.empty:
        return jsonify({"error": "Dados indisponiveis"}), 500

    payload = _serialize_dataframe(dataframe)
    return jsonify(payload)


@app.route("/api/inventario", methods=["GET"])
def get_inventario():
    dataframe = load_inventario_dataframe()
    if dataframe is None or dataframe.empty:
        return jsonify({"error": "Dados indisponiveis"}), 500

    payload = _serialize_dataframe(dataframe)
    valores_dataframe = load_inventario_valores_dataframe()
    if valores_dataframe is not None and not valores_dataframe.empty:
        payload["valores"] = _serialize_dataframe(valores_dataframe)
    return jsonify(payload)


@app.route("/")
def serve_root():
    return app.send_static_file("index.html")


@app.route("/favicon.ico")
def serve_favicon():
    return ("", 204)


@app.route("/backgroud.webp")
def serve_background():
    return send_from_directory(BASE_DIR, "backgroud.webp")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)