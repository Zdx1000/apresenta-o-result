import os
import sys
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS


def _is_frozen() -> bool:
    return getattr(sys, "frozen", False)


def _get_resource_dir() -> Path:
    if _is_frozen():
        bundle_dir = getattr(sys, "_MEIPASS", None)
        if bundle_dir:
            return Path(bundle_dir)
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def _get_data_dir() -> Path:
    if _is_frozen():
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def _get_data_file() -> Path:
    override = os.environ.get("PAINEL_DADOS_PATH")
    if override:
        candidate = Path(override).expanduser()
        if candidate.exists():
            return candidate
    return _get_data_dir() / "Apresentação.xlsx"


BASE_DIR = _get_resource_dir()
DATA_FILE = _get_data_file()
app = Flask(__name__, static_folder=str(BASE_DIR / "Components"), static_url_path="")
CORS(app)
DATA_SHEET = "Bloqueado por Mês"
DATA_SHEET_BLOQ10 = "Bloqueado-top10"
DATA_SHEET_CORTE = "Corte"
DATA_SHEET_CORTE_2 = "Corte-motivos"
DATA_SHEET_CORTE_SETORES = "Corte-setores"
DATA_SHEET_CORTE_TOP10 = "Corte-top10"
DATA_SHEET_INVENTARIO = "Inventario"
DATA_SHEET_INVENTARIO_2 = "Inventario - Valores"
DATA_SHEET_INVENTARIO_CANCELADO = "Inventario - Cancelados"
DATA_SHEET_INVENTARIO_MOTIVO_CANCELADO = "Inventario - Cancelados Motivo"
DATA_SHEET_FUNNEL = "Funnel"
DATA_SHEET_SENHA_167 = "Senha 167"
DATA_SHEET_SENHA_171 = "Senha 171"
DATA_SHEET_AVARIA_SETORES = "Avaria - Setores"
DATA_SHEET_AVARIA_ITENS = "Avaria - Itens"
DATA_SHEET_AVARIA_MOTIVOS = "Avaria - Motivos"
DATA_SHEET_AVARIA_DIRECIONADOS = "Avaria - Direcionados"
DATA_SHEET_AVARIA_TURNOS = "Avaria - Turnos"

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


def convert_integer(valor):
    try:
        if isinstance(valor, str):
            cleaned = valor.replace(".", "").replace(",", ".").strip()
            if cleaned == "":
                return 0
            return int(float(cleaned))
        return int(valor)
    except (ValueError, TypeError):
        return 0


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


def load_corte_setores_dataframe():
    dataframe = _load_sheet(DATA_SHEET_CORTE_SETORES)
    if dataframe is None:
        return None
    dataframe = dataframe.copy()

    try:
        if "Setor" in dataframe.columns:
            dataframe["Setor"] = dataframe["Setor"].astype(str)

        if "Soma de Valor Total" in dataframe.columns:
            dataframe["Soma de Valor Total"] = dataframe["Soma de Valor Total"].apply(converter_valor)
    except Exception as error:
        print(f"An error occurred while processing the Corte Setores data: {error}")

    return dataframe


def load_corte_top10_dataframe():
    dataframe = _load_sheet(DATA_SHEET_CORTE_TOP10)
    if dataframe is None:
        return None
    dataframe = dataframe.copy()

    try:
        if "Itens" in dataframe.columns:
            dataframe["Itens"] = dataframe["Itens"].astype(str)

        if "Descrição" in dataframe.columns:
            dataframe["Descrição"] = dataframe["Descrição"].astype(str)

        if "Soma de Valor Total Corte/Pedido" in dataframe.columns:
            dataframe["Soma de Valor Total Corte/Pedido"] = dataframe["Soma de Valor Total Corte/Pedido"].apply(converter_valor)

        if "Soma de Qtde" in dataframe.columns:
            dataframe["Soma de Qtde"] = dataframe["Soma de Qtde"].apply(converter_valor)
    except Exception as error:
        print(f"An error occurred while processing the Corte Top10 data: {error}")

    return dataframe


def load_bloqueado_top10_dataframe():
    dataframe = _load_sheet(DATA_SHEET_BLOQ10)
    if dataframe is None:
        return None
    dataframe = dataframe.copy()

    try:
        if "Item" in dataframe.columns:
            dataframe["Item"] = dataframe["Item"].astype(str)

        if "Descrição" in dataframe.columns:
            dataframe["Descrição"] = dataframe["Descrição"].astype(str)

        if "Qtd. Bloq. Estoque" in dataframe.columns:
            dataframe["Qtd. Bloq. Estoque"] = dataframe["Qtd. Bloq. Estoque"].apply(converter_valor)

        if "Valor Bloquado" in dataframe.columns:
            dataframe["Valor Bloquado"] = dataframe["Valor Bloquado"].apply(converter_valor)

        if "Motivo do Bloqueio" in dataframe.columns:
            dataframe["Motivo do Bloqueio"] = dataframe["Motivo do Bloqueio"].astype(str)
    except Exception as error:
        print(f"An error occurred while processing the Bloqueado Top10 data: {error}")

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


def load_inventario_cancelado_dataframe():
    dataframe = _load_sheet(DATA_SHEET_INVENTARIO_CANCELADO)
    if dataframe is None:
        return None
    dataframe = dataframe.copy()

    try:
        if "Motivo de Cancelamento" in dataframe.columns:
            dataframe["Motivo de Cancelamento"] = dataframe["Motivo de Cancelamento"].astype(str)

        if "Quantidade cancelado" in dataframe.columns:
            dataframe["Quantidade cancelado"] = dataframe["Quantidade cancelado"].apply(convert_integer)

        if "Valor cancelado" in dataframe.columns:
            dataframe["Valor cancelado"] = dataframe["Valor cancelado"].apply(converter_valor)
    except Exception as error:
        print(f"An error occurred while processing the Inventario Cancelado data: {error}")

    return dataframe


def load_inventario_motivo_cancelado_dataframe():
    dataframe = _load_sheet(DATA_SHEET_INVENTARIO_MOTIVO_CANCELADO)
    if dataframe is None:
        return None
    dataframe = dataframe.copy()

    try:
        if "Motivos" in dataframe.columns:
            dataframe["Motivos"] = dataframe["Motivos"].astype(str)

        if "Observação" in dataframe.columns:
            dataframe["Observação"] = dataframe["Observação"].astype(str)
    except Exception as error:
        print(f"An error occurred while processing the Inventario Motivo Cancelado data: {error}")

    return dataframe


def load_avaria_setores_dataframe():
    dataframe = _load_sheet(DATA_SHEET_AVARIA_SETORES)
    if dataframe is None:
        return None
    dataframe = dataframe.copy()

    try:
        if "Setores" in dataframe.columns:
            dataframe["Setores"] = dataframe["Setores"].astype(str)

        if "Valor Avariado" in dataframe.columns:
            dataframe["Valor Avariado"] = dataframe["Valor Avariado"].apply(converter_valor)

        if "Quantidade" in dataframe.columns:
            dataframe["Quantidade"] = dataframe["Quantidade"].apply(convert_integer)

    except Exception as error:
        print(f"An error occurred while processing the Avaria Setores data: {error}")

    return dataframe


def load_avaria_itens_dataframe():
    dataframe = _load_sheet(DATA_SHEET_AVARIA_ITENS)
    if dataframe is None:
        return None
    dataframe = dataframe.copy()

    try:
        if "ITEM" in dataframe.columns:
            dataframe["ITEM"] = dataframe["ITEM"].astype(str)

        if "DESCRIÇÃO DO ITEM" in dataframe.columns:
            dataframe["DESCRIÇÃO DO ITEM"] = dataframe["DESCRIÇÃO DO ITEM"].astype(str)

        if "Valor" in dataframe.columns:
            dataframe["Valor"] = dataframe["Valor"].apply(converter_valor)

        if "Quantidade" in dataframe.columns:
            dataframe["Quantidade"] = dataframe["Quantidade"].apply(convert_integer)
    except Exception as error:
        print(f"An error occurred while processing the Avaria Itens data: {error}")

    return dataframe


def load_avaria_motivos_dataframe():
    dataframe = _load_sheet(DATA_SHEET_AVARIA_MOTIVOS)
    if dataframe is None:
        return None
    dataframe = dataframe.copy()

    try:
        if "Motivos" in dataframe.columns:
            dataframe["Motivos"] = dataframe["Motivos"].astype(str)

        if "Valor Avariado" in dataframe.columns:
            dataframe["Valor Avariado"] = dataframe["Valor Avariado"].apply(converter_valor)

        if "Contagem de UNID." in dataframe.columns:
            dataframe["Contagem de UNID."] = dataframe["Contagem de UNID."].apply(convert_integer)
    except Exception as error:
        print(f"An error occurred while processing the Avaria Motivos data: {error}")

    return dataframe


def load_avaria_direcionados_dataframe():
    dataframe = _load_sheet(DATA_SHEET_AVARIA_DIRECIONADOS)
    if dataframe is None:
        return None
    dataframe = dataframe.copy()

    try:
        if "Direcionados" in dataframe.columns:
            dataframe["Direcionados"] = dataframe["Direcionados"].astype(str)

        if "Avariado" in dataframe.columns:
            dataframe["Avariado"] = dataframe["Avariado"].apply(converter_valor)

        if "Recuperado" in dataframe.columns:
            dataframe["Recuperado"] = dataframe["Recuperado"].apply(converter_valor)
    except Exception as error:
        print(f"An error occurred while processing the Avaria Direcionados data: {error}")

    return dataframe


def load_avaria_turnos_dataframe():
    dataframe = _load_sheet(DATA_SHEET_AVARIA_TURNOS)
    if dataframe is None:
        return None
    dataframe = dataframe.copy()

    try:
        if "Setores" in dataframe.columns:
            dataframe["Setores"] = dataframe["Setores"].astype(str)

        if "Valor Avariado" in dataframe.columns:
            dataframe["Valor Avariado"] = dataframe["Valor Avariado"].apply(converter_valor)

        if "Quantidade" in dataframe.columns:
            dataframe["Quantidade"] = dataframe["Quantidade"].apply(convert_integer)
    except Exception as error:
        print(f"An error occurred while processing the Avaria Turnos data: {error}")

    return dataframe


@app.route("/api/avaria/setores", methods=["GET"])
def get_avaria_setores():
    dataframe = load_avaria_setores_dataframe()
    if dataframe is None or dataframe.empty:
        return jsonify({"error": "Dados indisponiveis"}), 500

    payload = _serialize_dataframe(dataframe)
    return jsonify(payload)


@app.route("/api/avaria/top10", methods=["GET"])
def get_avaria_top10():
    dataframe = load_avaria_itens_dataframe()
    if dataframe is None or dataframe.empty:
        return jsonify({"error": "Dados indisponiveis"}), 500

    payload = _serialize_dataframe(dataframe)
    return jsonify(payload)


def load_funnel_dataframe():
    dataframe = _load_sheet(DATA_SHEET_FUNNEL)
    if dataframe is None:
        return None
    dataframe = dataframe.copy()

    try:
        if "Motivos Bloqueio" in dataframe.columns:
            dataframe["Motivos Bloqueio"] = dataframe["Motivos Bloqueio"].astype(str)

        if "Soma de Valor (BRL)" in dataframe.columns:
            dataframe["Soma de Valor (BRL)"] = dataframe["Soma de Valor (BRL)"].apply(converter_valor)
    except Exception as error:
        print(f"An error occurred while processing the Funnel data: {error}")

    return dataframe


def load_senha_167_dataframe():
    dataframe = _load_sheet(DATA_SHEET_SENHA_167)
    if dataframe is None:
        return None
    return dataframe.copy()


def load_senha_171_dataframe():
    dataframe = _load_sheet(DATA_SHEET_SENHA_171)
    if dataframe is None:
        return None
    return dataframe.copy()


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


@app.route("/api/corte/setores", methods=["GET"])
def get_corte_setores():
    dataframe = load_corte_setores_dataframe()
    if dataframe is None or dataframe.empty:
        return jsonify({"error": "Dados indisponiveis"}), 500

    payload = _serialize_dataframe(dataframe)
    return jsonify(payload)


@app.route("/api/corte/top10", methods=["GET"])
def get_corte_top10():
    dataframe = load_corte_top10_dataframe()
    if dataframe is None or dataframe.empty:
        return jsonify({"error": "Dados indisponiveis"}), 500

    payload = _serialize_dataframe(dataframe)
    return jsonify(payload)


@app.route("/api/bloqueado/top10", methods=["GET"])
def get_bloqueado_top10():
    dataframe = load_bloqueado_top10_dataframe()
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
    cancelado_dataframe = load_inventario_cancelado_dataframe()
    if cancelado_dataframe is not None and not cancelado_dataframe.empty:
        payload["cancelados"] = _serialize_dataframe(cancelado_dataframe)
    motivo_cancelado_dataframe = load_inventario_motivo_cancelado_dataframe()
    if motivo_cancelado_dataframe is not None and not motivo_cancelado_dataframe.empty:
        payload["cancelados_motivos"] = _serialize_dataframe(motivo_cancelado_dataframe)
    return jsonify(payload)


@app.route("/api/funnel", methods=["GET"])
def get_funnel():
    dataframe = load_funnel_dataframe()
    if dataframe is None or dataframe.empty:
        return jsonify({"error": "Dados indisponiveis"}), 500

    motivo_column = _find_column(dataframe, "motivos bloqueio")
    valor_column = _find_column(dataframe, "soma de valor")
    try:
        observacao_column = _find_column(dataframe, "observacao")
    except KeyError:
        observacao_column = None

    safe_values = dataframe[valor_column].fillna(0).astype(float)
    total = float(safe_values.sum())

    grouped = (
        dataframe[[motivo_column, valor_column]]
        .groupby(motivo_column, dropna=False, as_index=False)
        .sum(numeric_only=True)
    )

    grouped[valor_column] = grouped[valor_column].fillna(0).astype(float)
    grouped.sort_values(by=valor_column, ascending=False, inplace=True)

    observation_lookup = {}
    if observacao_column:
        for _, row in dataframe[[motivo_column, observacao_column]].iterrows():
            motive_value = row[motivo_column]
            observation_value = row[observacao_column]
            motive_key = None if pd.isna(motive_value) else motive_value

            if motive_key in observation_lookup:
                continue

            if pd.isna(observation_value):
                continue

            text = str(observation_value).strip()
            if not text:
                continue

            observation_lookup[motive_key] = text

    entries = []
    for _, row in grouped.iterrows():
        motivo = row[motivo_column]
        valor = float(row[valor_column])
        percentage = (valor / total) if total else 0.0
        motive_key = None if pd.isna(motivo) else motivo
        label = "Sem motivo"
        if motivo is not None and not pd.isna(motivo):
            label = str(motivo)
        entries.append(
            {
                "label": label,
                "value": valor,
                "share": percentage,
                "observation": observation_lookup.get(motive_key),
            }
        )

    payload = {
        "total": total,
        "entries": entries,
    }

    return jsonify(payload)


@app.route("/api/senha/167", methods=["GET"])
def get_senha_167():
    dataframe = load_senha_167_dataframe()
    if dataframe is None or dataframe.empty:
        return jsonify({"error": "Dados indisponiveis"}), 500

    payload = _serialize_dataframe(dataframe)
    return jsonify(payload)


@app.route("/api/senha/171", methods=["GET"])
def get_senha_171():
    dataframe = load_senha_171_dataframe()
    if dataframe is None or dataframe.empty:
        return jsonify({"error": "Dados indisponiveis"}), 500

    payload = _serialize_dataframe(dataframe)
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