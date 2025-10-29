const API_ENDPOINT_BLOQUEADO = "/api/bloqueado";
const API_ENDPOINT_CORTE = "/api/corte";
const API_ENDPOINT_CORTE_MOTIVOS = "/api/corte/motivos";
const API_ENDPOINT_INVENTARIO = "/api/inventario";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
});

const percentageFormatter = new Intl.NumberFormat("pt-BR", {
    style: "percent",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
});

const decimalFormatter = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
});

let bloqueadoChartInstance = null;
let corteChartInstance = null;
let inventarioChartInstance = null;
let metricsDOM = null;
let corteMetricsDOM = null;
let motivosTableBody = null;
let corteDatasetCache = null;
let corteMotivosSummary = [];
let inventarioDatasetCache = null;
let inventarioValoresDOM = null;
let inventarioMetricsDOM = null;
let bloqueadoDatasetCache = null;
let bloqueadoTop10List = null;
let bloqueadoTop10Insights = null;

const MOTIVO_KEY_CANDIDATES = ["Motivos", "Motivo", "Descrição", "Descricao", "Categoria"];
const VALOR_KEY_CANDIDATES = ["Soma de Valor Total", "Valor Total", "Total", "Valor", "Soma"];
const INVENTARIO_LABEL_CANDIDATES = ["Semana", "Período", "Periodo", "Ciclo", "Mês", "Mes", "Data", "Inventario"];
const INVENTARIO_REALIZADO_CANDIDATES = ["Realizado", "Realizacao", "Resultado"];
const INVENTARIO_META_CANDIDATES = ["Meta", "Objetivo", "Target"];

const INVENTARIO_VALORES_ANO_CANDIDATES = ["Ano"];
const INVENTARIO_VALORES_UNIDADE_CANDIDATES = ["Unidade", "Filial", "Centro", "Loja"];
const INVENTARIO_VALORES_ESTOQUE_CANDIDATES = ["Estoque Contado Acumulado", "Estoque Contado", "Estoque Acumulado"];
const INVENTARIO_VALORES_AJUSTE_FALTA_CANDIDATES = ["11 Ajuste Inv. Falta", "Ajuste Falta"];
const INVENTARIO_VALORES_AJUSTE_SOBRA_CANDIDATES = ["5 Ajuste Inv. Sobra", "Ajuste Sobra"];
const INVENTARIO_VALORES_ABSOLUTO_CANDIDATES = ["Valor Absoluto"];
const INVENTARIO_VALORES_MODULAR_CANDIDATES = ["Valor Modular"];
const INVENTARIO_VALORES_PERCENT_CANDIDATES = ["% Ajuste", "Percentual Ajuste"];

const BLOQUEADO_TOP10_ITEM_CANDIDATES = ["Item"];
const BLOQUEADO_TOP10_DESCRIPTION_CANDIDATES = ["Descrição", "Descricao", "Item Descricao"];
const BLOQUEADO_TOP10_QUANTITY_CANDIDATES = ["Qtd. Bloq. Estoque", "Quantidade", "Qtd"];
const BLOQUEADO_TOP10_VALUE_CANDIDATES = ["Valor Bloquado", "Valor Bloqueado", "Valor"];
const BLOQUEADO_TOP10_REASON_CANDIDATES = ["Motivo do Bloqueio", "Motivo", "Justificativa"];

const normalizeKeyName = (key) => {
    if (typeof key !== "string") {
        return "";
    }
    return key
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
};

const extractValueFromRow = (row, candidates) => {
    if (!row) {
        return null;
    }

    const normalizedCandidates = candidates
        .map((candidate) => normalizeKeyName(candidate))
        .filter(Boolean);

    for (const [key, value] of Object.entries(row)) {
        const normalizedKey = normalizeKeyName(key);
        if (
            normalizedCandidates.some(
                (candidate) =>
                    normalizedKey === candidate ||
                    normalizedKey.includes(candidate) ||
                    candidate.includes(normalizedKey)
            )
        ) {
            return value;
        }
    }

    return null;
};

const findColumnByCandidates = (columns, candidates) => {
    if (!Array.isArray(columns) || !Array.isArray(candidates)) {
        return null;
    }

    const normalizedCandidates = candidates
        .map((candidate) => normalizeKeyName(candidate))
        .filter(Boolean);

    return (
        columns.find((column) => {
            const normalizedColumn = normalizeKeyName(column);
            return normalizedCandidates.some((candidate) => normalizedColumn.includes(candidate));
        }) ?? null
    );
};

const parseNumericValue = (value) => {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string") {
        const cleaned = value.replace(/[^0-9,\-.]/g, "").trim();
        if (!cleaned) {
            return null;
        }
        const hasComma = cleaned.includes(",");
        const hasDot = cleaned.includes(".");
        let normalized = cleaned;
        if (hasComma && hasDot) {
            normalized = cleaned.replace(/\./g, "").replace(",", ".");
        } else if (hasComma) {
            normalized = cleaned.replace(",", ".");
        }
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const normalizeMotivosRows = (rows) => {
    const safeRows = Array.isArray(rows) ? rows : [];
    const summary = safeRows.map((row) => {
        const motivoValue = extractValueFromRow(row, MOTIVO_KEY_CANDIDATES);
        const totalValue = extractValueFromRow(row, VALOR_KEY_CANDIDATES);
        const numericTotal = parseNumericValue(totalValue);

        return {
            motivo: motivoValue !== null && motivoValue !== undefined ? String(motivoValue) : "",
            value: numericTotal,
            rawValue: totalValue,
        };
    });

    summary.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return summary;
};

document.addEventListener("DOMContentLoaded", () => {
    const bloqueadoStatusElement = document.querySelector('[data-status="bloqueado"]');
    const bloqueadoTop10StatusElement = document.querySelector('[data-status="bloqueado-top10"]');
    const corteStatusElement = document.querySelector('[data-status="corte"]');
    const corteMotivosStatusElement = document.querySelector('[data-status="corte-motivos"]');
    const inventarioStatusElement = document.querySelector('[data-status="inventario"]');
    motivosTableBody = document.querySelector("[data-motivos-body]");
    bloqueadoTop10List = document.querySelector("[data-bloqueado-top10-list]");
    bloqueadoTop10Insights = collectBloqueadoTop10Insights();
    metricsDOM = collectMetricElements();
    corteMetricsDOM = collectCorteMetricElements();
    inventarioMetricsDOM = collectInventarioMetricElements();
    inventarioValoresDOM = collectInventarioValoresElements();
    clearMetrics();
    clearCorteMetrics();
    clearInventarioMetrics();
    resetInventarioValoresCard();
    const panelAnimator = initPanelScrollAnimation();
    initSlideNavigation(panelAnimator);
    initBloqueadoTopToggle();
    initCorteSetoresToggle();
    initInventarioCanceladosToggle();

    loadBloqueadoDataset(bloqueadoStatusElement);
    loadBloqueadoTop10Dataset(bloqueadoTop10StatusElement);
    loadCorteDataset(corteStatusElement);
    loadCorteMotivosDataset(corteMotivosStatusElement);
    loadInventarioDataset(inventarioStatusElement);
});

function loadBloqueadoDataset(statusElement) {
    fetch(API_ENDPOINT_BLOQUEADO)
        .then((response) => {
            if (!response.ok) {
                throw new Error("Falha ao carregar os dados");
            }
            return response.json();
        })
        .then((payload) => {
            if (!payload || !Array.isArray(payload.labels)) {
                throw new Error("Formato de dados invalido");
            }
            bloqueadoDatasetCache = payload;
            renderMetrics(payload.metrics);
            renderBloqueadoChart(payload);
            if (statusElement) {
                statusElement.textContent = "";
                statusElement.classList.add("status-message--hidden");
            }
        })
        .catch((error) => {
            console.error(error);
            bloqueadoDatasetCache = null;
            clearMetrics();
            if (statusElement) {
                statusElement.textContent = "Nao foi possivel carregar os dados.";
                statusElement.classList.remove("status-message--hidden");
            }
        });
}

function loadBloqueadoTop10Dataset(statusElement) {
    fetch("/api/bloqueado/top10")
        .then((response) => {
            if (!response.ok) {
                throw new Error("Falha ao carregar os dados do bloqueado top 10");
            }
            return response.json();
        })
        .then((payload) => {
            const entries = normalizeBloqueadoTop10Rows(payload);
            renderBloqueadoTop10List(entries);

            if (statusElement) {
                if (entries.length) {
                    statusElement.textContent = "";
                    statusElement.classList.add("status-message--hidden");
                } else {
                    statusElement.textContent = "Sem dados disponiveis no momento.";
                    statusElement.classList.remove("status-message--hidden");
                }
            }
        })
        .catch((error) => {
            console.error(error);
            renderBloqueadoTop10List([]);
            if (statusElement) {
                statusElement.textContent = "Nao foi possivel carregar os dados.";
                statusElement.classList.remove("status-message--hidden");
            }
        });
}

function normalizeBloqueadoTop10Rows(payload) {
    const columns = Array.isArray(payload?.columns) ? payload.columns : [];
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];

    if (!columns.length || !rows.length) {
        return [];
    }

    const columnRefs = {
        item: findColumnByCandidates(columns, BLOQUEADO_TOP10_ITEM_CANDIDATES),
        description: findColumnByCandidates(columns, BLOQUEADO_TOP10_DESCRIPTION_CANDIDATES),
        quantity: findColumnByCandidates(columns, BLOQUEADO_TOP10_QUANTITY_CANDIDATES),
        value: findColumnByCandidates(columns, BLOQUEADO_TOP10_VALUE_CANDIDATES),
        reason: findColumnByCandidates(columns, BLOQUEADO_TOP10_REASON_CANDIDATES),
    };

    const extractText = (row, columnName) => {
        if (!columnName || !(columnName in row)) {
            return "";
        }
        const value = row[columnName];
        return value === null || value === undefined ? "" : String(value).trim();
    };

    const entries = rows.map((row) => {
        const quantityValue = columnRefs.quantity ? parseNumericValue(row?.[columnRefs.quantity]) : null;
        const amountValue = columnRefs.value ? parseNumericValue(row?.[columnRefs.value]) : null;

        return {
            item: extractText(row, columnRefs.item),
            description: extractText(row, columnRefs.description),
            quantity: Number.isFinite(quantityValue) ? quantityValue : null,
            value: Number.isFinite(amountValue) ? amountValue : null,
            reason: extractText(row, columnRefs.reason),
        };
    });

    const filtered = entries.filter((entry) => {
        return (
            entry.item ||
            entry.description ||
            Number.isFinite(entry.quantity) ||
            Number.isFinite(entry.value) ||
            entry.reason
        );
    });

    filtered.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    return filtered.slice(0, 10);
}

function renderBloqueadoTop10List(entries) {
    if (!bloqueadoTop10List) {
        renderBloqueadoTop10Insights(Array.isArray(entries) ? entries : []);
        return;
    }

    const safeEntries = Array.isArray(entries) ? entries : [];
    bloqueadoTop10List.innerHTML = "";

    if (!safeEntries.length) {
        const emptyItem = document.createElement("li");
        emptyItem.className = "bloqueado-top10-card__empty";
        emptyItem.textContent = "Sem dados disponiveis";
        bloqueadoTop10List.appendChild(emptyItem);
        renderBloqueadoTop10Insights([]);
        return;
    }

    const createMetric = (label, value, modifier, iconName) => {
        const metric = document.createElement("div");
        metric.className = "bloqueado-top10-card__metric" + (modifier ? ` bloqueado-top10-card__metric--${modifier}` : "");

        const metricHeader = document.createElement("span");
        metricHeader.className = "bloqueado-top10-card__metric-header";

        const metricIcon = document.createElement("span");
        metricIcon.className = "material-symbols-rounded bloqueado-top10-card__metric-icon";
        metricIcon.textContent = iconName || "bar_chart";
        metricIcon.setAttribute("aria-hidden", "true");

        const metricLabel = document.createElement("span");
        metricLabel.className = "bloqueado-top10-card__metric-label";
        metricLabel.textContent = label;

        metricHeader.append(metricIcon, metricLabel);

        const metricValue = document.createElement("span");
        metricValue.className = "bloqueado-top10-card__metric-value";
        metricValue.textContent = value;

        metric.append(metricHeader, metricValue);
        return metric;
    };

    const getRankIcon = (position) => {
        if (position === 1) {
            return "workspace_premium";
        }
        if (position === 2) {
            return "emoji_events";
        }
        if (position === 3) {
            return "military_tech";
        }
        return "format_list_numbered";
    };

    safeEntries.forEach((entry, index) => {
        const rank = index + 1;
        const quantityText = Number.isFinite(entry.quantity) ? decimalFormatter.format(entry.quantity) : "—";
        const valueText = Number.isFinite(entry.value) ? currencyFormatter.format(entry.value) : "—";

        const itemElement = document.createElement("li");
        itemElement.className = "bloqueado-top10-card__item funnel-summary__item";
        itemElement.dataset.rank = String(rank);
        itemElement.setAttribute(
            "aria-label",
            `Top ${String(rank).padStart(2, "0")} - ${entry.item || entry.description || "Sem identificacao"}`
        );

        const main = document.createElement("div");
        main.className = "bloqueado-top10-card__item-main";

        const badge = document.createElement("span");
        badge.className = "bloqueado-top10-card__badge";
        badge.setAttribute("aria-hidden", "true");

        const badgeIcon = document.createElement("span");
        badgeIcon.className = "material-symbols-rounded bloqueado-top10-card__badge-icon";
        badgeIcon.textContent = getRankIcon(rank);

        const badgeLabel = document.createElement("span");
        badgeLabel.className = "bloqueado-top10-card__badge-label";
        badgeLabel.textContent = `Top ${String(rank).padStart(2, "0")}`;

        badge.append(badgeIcon, badgeLabel);

        const info = document.createElement("div");
        info.className = "bloqueado-top10-card__info";

        const itemHeader = document.createElement("div");
        itemHeader.className = "bloqueado-top10-card__item-header";

        const itemIcon = document.createElement("span");
        itemIcon.className = "material-symbols-rounded bloqueado-top10-card__item-icon";
        itemIcon.textContent = "inventory";
        itemIcon.setAttribute("aria-hidden", "true");

        const itemCode = document.createElement("span");
        itemCode.className = "bloqueado-top10-card__item-code";
        itemCode.textContent = entry.item || "—";
        if (entry.item) {
            itemCode.title = entry.item;
        }

        itemHeader.append(itemIcon, itemCode);

        const description = document.createElement("p");
        description.className = "bloqueado-top10-card__description";
        description.textContent = entry.description || "Descricao nao informada";
        if (entry.description) {
            description.title = entry.description;
        }

        info.append(itemHeader, description);

        const metrics = document.createElement("div");
        metrics.className = "bloqueado-top10-card__metrics";
        metrics.append(
            createMetric("Qtd. bloqueada", quantityText, "quantity", "inventory_2"),
            createMetric("Valor bloqueado", valueText, "value", "payments")
        );

        main.append(badge, info, metrics);

        const reasonWrapper = document.createElement("p");
        reasonWrapper.className = "bloqueado-top10-card__reason";

        const reasonLabel = document.createElement("span");
        reasonLabel.className = "bloqueado-top10-card__reason-label";

        const reasonIcon = document.createElement("span");
        reasonIcon.className = "material-symbols-rounded bloqueado-top10-card__reason-icon";
        reasonIcon.textContent = "flag";
        reasonIcon.setAttribute("aria-hidden", "true");

        const reasonLabelText = document.createElement("span");
        reasonLabelText.textContent = "Motivo";

        reasonLabel.append(reasonIcon, reasonLabelText);

        const reasonText = document.createElement("span");
        reasonText.className = "bloqueado-top10-card__reason-text";
        reasonText.textContent = entry.reason || "Nao informado";
        if (entry.reason) {
            reasonText.title = entry.reason;
        }

        reasonWrapper.append(reasonLabel, reasonText);

        itemElement.append(main, reasonWrapper);

        bloqueadoTop10List.appendChild(itemElement);
    });

    renderBloqueadoTop10Insights(safeEntries);
}

function renderBloqueadoTop10Insights(entries) {
    if (!bloqueadoTop10Insights) {
        return;
    }

    const insightKeys = Object.keys(bloqueadoTop10Insights);
    if (!insightKeys.length) {
        return;
    }

    const safeEntries = Array.isArray(entries) ? entries : [];

    const setInsightValue = (key, value) => {
        const element = bloqueadoTop10Insights?.[key];
        if (element) {
            element.textContent = value;
        }
    };

    if (!safeEntries.length) {
        setInsightValue("total-value", "—");
        setInsightValue("total-quantity", "—");
        setInsightValue("top3-share", "—");
        return;
    }

    const totalValue = safeEntries.reduce((sum, entry) => {
        return sum + (Number.isFinite(entry.value) ? entry.value : 0);
    }, 0);

    const totalQuantity = safeEntries.reduce((sum, entry) => {
        return sum + (Number.isFinite(entry.quantity) ? entry.quantity : 0);
    }, 0);

    const top3Value = safeEntries.slice(0, 3).reduce((sum, entry) => {
        return sum + (Number.isFinite(entry.value) ? entry.value : 0);
    }, 0);

    const hasValueData = safeEntries.some((entry) => Number.isFinite(entry.value));
    const hasQuantityData = safeEntries.some((entry) => Number.isFinite(entry.quantity));
    const top3Share = hasValueData && totalValue > 0 ? top3Value / totalValue : null;

    setInsightValue("total-value", hasValueData ? currencyFormatter.format(totalValue) : "—");
    setInsightValue(
        "total-quantity",
        hasQuantityData ? decimalFormatter.format(totalQuantity) : "—"
    );
    setInsightValue(
        "top3-share",
        Number.isFinite(top3Share) ? percentageFormatter.format(top3Share) : "—"
    );
}

function collectBloqueadoTop10Insights() {
    const elements = document.querySelectorAll("[data-top10-insight-value]");
    if (!elements.length) {
        return {};
    }

    return Array.from(elements).reduce((accumulator, element) => {
        const key = element.getAttribute("data-top10-insight-value");
        if (key) {
            accumulator[key] = element;
        }
        return accumulator;
    }, {});
}

function initPanelSlideToggle({
    toggleSelector,
    primarySelector,
    secondarySelector,
    showSecondaryLabel,
    showPrimaryLabel,
    headingSelector,
    primaryHeading,
    secondaryHeading,
    subtitleSelector,
    primarySubtitle,
    secondarySubtitle,
}) {
    const toggleButton = document.querySelector(toggleSelector);
    const primarySection = document.querySelector(primarySelector);
    const secondarySection = document.querySelector(secondarySelector);
    const headingElement = headingSelector ? document.querySelector(headingSelector) : null;
    const subtitleElement = subtitleSelector ? document.querySelector(subtitleSelector) : null;
    const labelElement = toggleButton?.querySelector?.("[data-toggle-label]") ?? null;

    if (!toggleButton || !primarySection || !secondarySection) {
        return;
    }

    let showingSecondary = false;

    const initialHeading = headingElement ? headingElement.textContent.trim() : null;
    const initialSubtitle = subtitleElement ? subtitleElement.textContent.trim() : null;
    const fallbackLabel = !labelElement ? toggleButton.textContent.trim() : null;
    const hasIconElement = Boolean(toggleButton?.querySelector?.(".panel__toggle-icon"));

    const setButtonLabel = (value) => {
        if (labelElement) {
            labelElement.textContent = value;
        } else if (typeof value === "string") {
            toggleButton.textContent = value;
        }
    };

    if (!labelElement && fallbackLabel && !showSecondaryLabel) {
        showSecondaryLabel = fallbackLabel;
    }

    const applyState = () => {
        if (showingSecondary) {
            primarySection.style.transform = "translateX(-100%)";
            primarySection.style.opacity = "0";
            primarySection.style.pointerEvents = "none";
            primarySection.setAttribute("aria-hidden", "true");

            secondarySection.style.transform = "translateX(-100%)";
            secondarySection.style.opacity = "1";
            secondarySection.style.pointerEvents = "auto";
            secondarySection.removeAttribute("aria-hidden");

            setButtonLabel(showPrimaryLabel);
            toggleButton.setAttribute("aria-pressed", "true");
            toggleButton.setAttribute("aria-expanded", "true");

            if (headingElement) {
                headingElement.textContent = secondaryHeading ?? primaryHeading ?? initialHeading ?? "";
            }

            if (subtitleElement) {
                subtitleElement.textContent = secondarySubtitle ?? primarySubtitle ?? initialSubtitle ?? "";
            }
        } else {
            primarySection.style.transform = "translateX(0%)";
            primarySection.style.opacity = "1";
            primarySection.style.pointerEvents = "auto";
            primarySection.removeAttribute("aria-hidden");

            secondarySection.style.transform = "translateX(0%)";
            secondarySection.style.opacity = "0";
            secondarySection.style.pointerEvents = "none";
            secondarySection.setAttribute("aria-hidden", "true");

            setButtonLabel(showSecondaryLabel ?? fallbackLabel ?? "");
            toggleButton.setAttribute("aria-pressed", "false");
            toggleButton.setAttribute("aria-expanded", "false");

            if (headingElement) {
                headingElement.textContent = primaryHeading ?? initialHeading ?? "";
            }

            if (subtitleElement) {
                subtitleElement.textContent = primarySubtitle ?? initialSubtitle ?? "";
            }
        }

        if (hasIconElement) {
            toggleButton.classList.toggle("panel__toggle--reverse", showingSecondary);
        }
    };

    toggleButton.addEventListener("click", () => {
        showingSecondary = !showingSecondary;
        applyState();
    });

    secondarySection.style.transform = "translateX(0%)";
    secondarySection.style.opacity = "0";
    secondarySection.style.pointerEvents = "none";
    secondarySection.setAttribute("aria-hidden", "true");

    primarySection.style.transform = "translateX(0%)";
    primarySection.style.opacity = "1";
    primarySection.style.pointerEvents = "auto";
    primarySection.removeAttribute("aria-hidden");

    if (showSecondaryLabel) {
        setButtonLabel(showSecondaryLabel);
    }

    applyState();
}

function initBloqueadoTopToggle() {
    initPanelSlideToggle({
        toggleSelector: "[data-bloqueado-toggle]",
        primarySelector: "[data-bloqueado-primary]",
        secondarySelector: "[data-bloqueado-top10]",
        showSecondaryLabel: "Bloqueado do Estoque TOP 10",
        showPrimaryLabel: "R$ Bloq. no ESTOQUE",
        headingSelector: "[data-bloqueado-title]",
        primaryHeading: "R$ Bloq. no ESTOQUE",
        secondaryHeading: "Bloqueado de Estoque",
        subtitleSelector: "[data-bloqueado-subtitle]",
        primarySubtitle: "Valores apresentados por início e fim de cada mês",
        secondarySubtitle: "Bloqueado de Estoque os TOP 10 itens com maior valor bloqueados",
    });
}

function initCorteSetoresToggle() {
    initPanelSlideToggle({
        toggleSelector: "[data-corte-toggle]",
        primarySelector: "[data-corte-primary]",
        secondarySelector: "[data-corte-setores]",
        showSecondaryLabel: "Corte Setores",
        showPrimaryLabel: "Corte por Faturamento",
    });
}

function initInventarioCanceladosToggle() {
    initPanelSlideToggle({
        toggleSelector: "[data-inventario-toggle]",
        primarySelector: "[data-inventario-primary]",
        secondarySelector: "[data-inventario-cancelados]",
        showSecondaryLabel: "Inventário cancelados",
        showPrimaryLabel: "Inventário Rotativo",
    });
}

function loadCorteDataset(statusElement) {
    fetch(API_ENDPOINT_CORTE)
        .then((response) => {
            if (!response.ok) {
                throw new Error("Falha ao carregar os dados de corte");
            }
            return response.json();
        })
        .then((payload) => {
            const dataset = prepareCorteDataset(payload);
            corteDatasetCache = dataset;
            renderCorteChart(dataset);
            updateCorteMetrics();
            if (statusElement) {
                statusElement.textContent = "";
                statusElement.classList.add("status-message--hidden");
            }
        })
        .catch((error) => {
            console.error(error);
            corteDatasetCache = null;
            updateCorteMetrics();
            if (statusElement) {
                statusElement.textContent = "Nao foi possivel carregar os dados.";
                statusElement.classList.remove("status-message--hidden");
            }
        });
}

function loadCorteMotivosDataset(statusElement) {
    fetch(API_ENDPOINT_CORTE_MOTIVOS)
        .then((response) => {
            if (!response.ok) {
                throw new Error("Falha ao carregar os motivos de corte");
            }
            return response.json();
        })
        .then((payload) => {
            corteMotivosSummary = normalizeMotivosRows(payload?.rows);
            populateMotivosTable(corteMotivosSummary);
            updateCorteMetrics();
            if (statusElement) {
                statusElement.textContent = "";
                statusElement.classList.add("status-message--hidden");
            }
        })
        .catch((error) => {
            console.error(error);
            corteMotivosSummary = [];
            populateMotivosTable(corteMotivosSummary);
            updateCorteMetrics();
            if (statusElement) {
                statusElement.textContent = "Nao foi possivel carregar os dados.";
                statusElement.classList.remove("status-message--hidden");
            }
        });
}

function loadInventarioDataset(statusElement) {
    fetch(API_ENDPOINT_INVENTARIO)
        .then((response) => {
            if (!response.ok) {
                throw new Error("Falha ao carregar os dados de inventario");
            }
            return response.json();
        })
        .then((payload) => {
            renderInventarioValoresCard(payload?.valores);
            const dataset = prepareInventarioDataset(payload);
            inventarioDatasetCache = dataset;
            renderInventarioChart(dataset);
            updateInventarioMetrics();
            if (statusElement) {
                statusElement.textContent = "";
                statusElement.classList.add("status-message--hidden");
            }
        })
        .catch((error) => {
            console.error(error);
            inventarioDatasetCache = null;
            if (inventarioChartInstance) {
                inventarioChartInstance.destroy();
                inventarioChartInstance = null;
            }
            resetInventarioValoresCard();
            updateInventarioMetrics();
            if (statusElement) {
                statusElement.textContent = "Nao foi possivel carregar os dados.";
                statusElement.classList.remove("status-message--hidden");
            }
        });
}

function prepareInventarioDataset(payload) {
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    if (!rows.length) {
        throw new Error("Dados de inventario indisponiveis");
    }

    const columns = Array.isArray(payload?.columns) && payload.columns.length
        ? payload.columns
        : Object.keys(rows[0] ?? {});

    if (!columns.length) {
        throw new Error("Colunas de inventario nao encontradas");
    }

    const realizedColumn = findColumnByCandidates(columns, INVENTARIO_REALIZADO_CANDIDATES);
    if (!realizedColumn) {
        throw new Error("Coluna de realizado nao encontrada");
    }

    const metaColumn = findColumnByCandidates(columns, INVENTARIO_META_CANDIDATES);

    const candidateLabelColumns = columns.filter((column) => column !== realizedColumn && column !== metaColumn);
    let labelColumn = findColumnByCandidates(candidateLabelColumns, INVENTARIO_LABEL_CANDIDATES);

    if (!labelColumn) {
        labelColumn = candidateLabelColumns.find((column) =>
            rows.some((row) => {
                const value = row?.[column];
                if (value === null || value === undefined) {
                    return false;
                }
                if (typeof value === "string") {
                    return value.trim() !== "";
                }
                return typeof value !== "number";
            })
        );
    }

    if (!labelColumn) {
        labelColumn = candidateLabelColumns[0] || realizedColumn;
    }

    const toPercentValue = (value) => {
        const numeric = parseNumericValue(value);
        if (numeric === null) {
            return null;
        }
        return Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
    };

    const labels = rows.map((row, index) => {
        const raw = row?.[labelColumn];
        if (raw === null || raw === undefined || raw === "") {
            return `Item ${index + 1}`;
        }
        return String(raw);
    });

    const realizadoValues = rows.map((row) => toPercentValue(row?.[realizedColumn]));
    const metaValues = metaColumn ? rows.map((row) => toPercentValue(row?.[metaColumn])) : [];

    return {
        labels,
        realizado: realizadoValues,
        meta: metaValues,
    };
}

function prepareInventarioValoresSummary(payload) {
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    if (!rows.length) {
        return null;
    }

    const columns = Array.isArray(payload?.columns) && payload.columns.length
        ? payload.columns
        : Object.keys(rows[0] ?? {});

    if (!columns.length) {
        return null;
    }

    const columnRefs = {
        ano: findColumnByCandidates(columns, INVENTARIO_VALORES_ANO_CANDIDATES),
        unidade: findColumnByCandidates(columns, INVENTARIO_VALORES_UNIDADE_CANDIDATES),
        estoque: findColumnByCandidates(columns, INVENTARIO_VALORES_ESTOQUE_CANDIDATES),
        falta: findColumnByCandidates(columns, INVENTARIO_VALORES_AJUSTE_FALTA_CANDIDATES),
        sobra: findColumnByCandidates(columns, INVENTARIO_VALORES_AJUSTE_SOBRA_CANDIDATES),
        valorAbsoluto: findColumnByCandidates(columns, INVENTARIO_VALORES_ABSOLUTO_CANDIDATES),
        valorModular: findColumnByCandidates(columns, INVENTARIO_VALORES_MODULAR_CANDIDATES),
        percentualAjuste: findColumnByCandidates(columns, INVENTARIO_VALORES_PERCENT_CANDIDATES),
    };

    const anoValues = new Set();
    const unidadeValues = new Set();

    const totals = {
        estoque: { value: 0, has: false },
        falta: { value: 0, has: false },
        sobra: { value: 0, has: false },
        valorAbsoluto: { value: 0, has: false },
        valorModular: { value: 0, has: false },
    };

    const percentValues = [];

    rows.forEach((row) => {
        if (!row) {
            return;
        }

        if (columnRefs.ano) {
            const rawAno = row[columnRefs.ano];
            if (rawAno !== null && rawAno !== undefined && rawAno !== "") {
                anoValues.add(String(rawAno));
            }
        }

        if (columnRefs.unidade) {
            const rawUnidade = row[columnRefs.unidade];
            if (rawUnidade !== null && rawUnidade !== undefined && rawUnidade !== "") {
                unidadeValues.add(String(rawUnidade));
            }
        }

        const addNumeric = (columnName, targetKey) => {
            if (!columnName) {
                return;
            }
            const numeric = parseNumericValue(row[columnName]);
            if (numeric === null) {
                return;
            }
            totals[targetKey].value += numeric;
            totals[targetKey].has = true;
        };

        addNumeric(columnRefs.estoque, "estoque");
        addNumeric(columnRefs.falta, "falta");
        addNumeric(columnRefs.sobra, "sobra");
        addNumeric(columnRefs.valorAbsoluto, "valorAbsoluto");
        addNumeric(columnRefs.valorModular, "valorModular");

        if (columnRefs.percentualAjuste) {
            const rawPercent = row[columnRefs.percentualAjuste];
            let numericPercent = null;
            if (typeof rawPercent === "number") {
                numericPercent = rawPercent;
            } else {
                numericPercent = parseNumericValue(rawPercent);
            }
            if (numericPercent !== null) {
                const normalizedPercent = Math.abs(numericPercent) > 1 ? numericPercent / 100 : numericPercent;
                percentValues.push(normalizedPercent);
            }
        }
    });

    const summarizeSet = (valuesSet) => {
        if (!valuesSet || valuesSet.size === 0) {
            return null;
        }
        if (valuesSet.size <= 3) {
            return Array.from(valuesSet).join(", ");
        }
        const values = Array.from(valuesSet);
        return `${values.slice(0, 2).join(", ")} +${valuesSet.size - 2}`;
    };

    const percentualAjuste = percentValues.length
        ? percentValues.reduce((sum, value) => sum + value, 0) / percentValues.length
        : null;

    return {
        ano: summarizeSet(anoValues),
        unidade: summarizeSet(unidadeValues),
        estoque: totals.estoque.has ? totals.estoque.value : null,
        falta: totals.falta.has ? totals.falta.value : null,
        sobra: totals.sobra.has ? totals.sobra.value : null,
        valorAbsoluto: totals.valorAbsoluto.has ? totals.valorAbsoluto.value : null,
        valorModular: totals.valorModular.has ? totals.valorModular.value : null,
        percentualAjuste,
    };
}

const INVENTARIO_CHART_COLORS = {
    hitBorder: "#009100ff",
    missBorder: "#DC2626",
    neutralBorder: "#4B5563",
    line: "#ecb418ff",
    hitFill: "rgba(4, 102, 17, 1)",
    missFill: "rgba(224, 15, 15, 1)",
    neutralFill: "rgba(75, 85, 99, 1)",
};

const INVENTARIO_LINE_OVER_BARS_PLUGIN = {
    id: "inventarioLineOverBars",
    afterDatasetsDraw: (chart) => {
        if (!chart?.canvas || chart.canvas.id !== "inventarioChart") {
            return;
        }
        const metas = chart.getSortedVisibleDatasetMetas().filter((meta) => meta.type === "line");
        if (!metas.length) {
            return;
        }
        const { ctx } = chart;
        ctx.save();
        metas.forEach((meta) => {
            if (meta.hidden) {
                return;
            }
            meta.dataset.draw(ctx);
            meta.data.forEach((element) => {
                if (typeof element.draw === "function") {
                    element.draw(ctx);
                }
            });
        });
        ctx.restore();
    },
};

const INVENTARIO_VALUE_LABELS_PLUGIN = {
    id: "inventarioValueLabels",
    afterDatasetsDraw: (chart) => {
        if (!chart?.canvas || chart.canvas.id !== "inventarioChart") {
            return;
        }
        const metas = chart.getSortedVisibleDatasetMetas();
        if (!metas.length) {
            return;
        }

        const barMetas = metas.filter((meta) => meta.type === "bar" && !meta.hidden);
        const lineMetas = metas.filter((meta) => meta.type === "line" && !meta.hidden);

        if (!barMetas.length && !lineMetas.length) {
            return;
        }

        const { ctx } = chart;
        ctx.save();
        ctx.textBaseline = "bottom";
        ctx.textAlign = "center";
        ctx.font = "600 11px 'Segoe UI', Tahoma";

        const labelPaddingX = 8;
        const labelPaddingY = 4;
        const labelMargin = 6;
        const placedBoxes = [];

        const addPlacement = (centerX, width, height, startY) => {
            let adjustedY = startY;
            let top = adjustedY - height;
            let bottom = adjustedY;

            const overlaps = (box) => {
                const horizontalOverlap = centerX - width / 2 < box.right && centerX + width / 2 > box.left;
                const verticalOverlap = top < box.bottom + labelMargin && bottom > box.top - labelMargin;
                return horizontalOverlap && verticalOverlap;
            };

            while (placedBoxes.some(overlaps)) {
                adjustedY -= height + labelMargin;
                top = adjustedY - height;
                bottom = adjustedY;
            }

            placedBoxes.push({
                left: centerX - width / 2,
                right: centerX + width / 2,
                top,
                bottom,
            });

            return adjustedY;
        };

        const drawRoundedRect = (x, y, width, height, radius, fillStyle, strokeStyle) => {
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
            ctx.fillStyle = fillStyle;
            ctx.fill();
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = 1;
            ctx.stroke();
        };

        const drawLabel = (text, x, y, accentColor) => {
            ctx.font = "600 11px 'Segoe UI', Tahoma";
            const textMetrics = ctx.measureText(text);
            const textWidth = textMetrics.width;
            const textHeight = 11;
            const boxWidth = textWidth + labelPaddingX * 2;
            const boxHeight = textHeight + labelPaddingY * 2;
            const adjustedY = addPlacement(x, boxWidth, boxHeight, y - 8);
            const boxX = x - boxWidth / 2;
            const boxY = adjustedY - boxHeight;

            drawRoundedRect(boxX, boxY, boxWidth, boxHeight, 6, "rgba(255, 255, 255, 0.92)", accentColor);

            ctx.fillStyle = accentColor;
            ctx.fillText(text, x, boxY + boxHeight - labelPaddingY);
        };

        barMetas.forEach((meta) => {
            const dataset = chart.data.datasets[meta.index];
            const color = dataset?.borderColor || "#1f2937";

            meta.data.forEach((element, index) => {
                const value = dataset?.data?.[index];
                if (!Number.isFinite(value)) {
                    return;
                }

                const { x, y } = element.tooltipPosition();
                const label = `${Number.parseFloat(value).toFixed(2)}%`;
                drawLabel(label, x, y, color);
            });
        });

        lineMetas.forEach((meta) => {
            const dataset = chart.data.datasets[meta.index];
            const lineData = Array.isArray(dataset?.data) ? dataset.data : [];
            let lastNonNullIndex = -1;
            for (let i = lineData.length - 1; i >= 0; i -= 1) {
                if (Number.isFinite(lineData[i])) {
                    lastNonNullIndex = i;
                    break;
                }
            }

            if (lastNonNullIndex === -1) {
                return;
            }

            const pointElement = meta.data[lastNonNullIndex];
            if (!pointElement) {
                return;
            }

            const { x, y } = pointElement.tooltipPosition();
            const label = `${Number.parseFloat(lineData[lastNonNullIndex]).toFixed(2)}%`;
            const accent = dataset?.borderColor || INVENTARIO_CHART_COLORS.line;
            drawLabel(label, x, y, accent);
        });

        ctx.restore();
    },
};

function collectInventarioValoresElements() {
    const layout = document.querySelector("#inventario-chart-card .indice-chart-card__layout");
    const card = document.getElementById("inventario-values-card");
    if (!card) {
        return null;
    }

    const queryField = (name) => card.querySelector(`[data-inventario-info="${name}"]`);

    return {
        layout,
        card,
        ano: queryField("ano"),
        unidade: queryField("unidade"),
        estoque: queryField("estoque"),
        falta: queryField("falta"),
        sobra: queryField("sobra"),
        valorAbsoluto: queryField("valor-absoluto"),
        valorModular: queryField("valor-modular"),
        percentualAjuste: queryField("percentual-ajuste"),
    };
}

function resetInventarioValoresCard() {
    if (!inventarioValoresDOM) {
        inventarioValoresDOM = collectInventarioValoresElements();
    }

    const dom = inventarioValoresDOM;
    if (!dom || !dom.card) {
        return;
    }

    const fields = [
        dom.ano,
        dom.unidade,
        dom.estoque,
        dom.falta,
        dom.sobra,
        dom.valorAbsoluto,
        dom.valorModular,
        dom.percentualAjuste,
    ];

    fields.forEach((element) => {
        if (element) {
            element.textContent = "—";
        }
    });

    dom.card.hidden = true;
    dom.card.setAttribute("aria-hidden", "true");
    if (dom.layout) {
        dom.layout.classList.add("indice-chart-card__layout--single");
    }
}

function renderInventarioValoresCard(valoresPayload) {
    if (!inventarioValoresDOM) {
        inventarioValoresDOM = collectInventarioValoresElements();
    }

    const dom = inventarioValoresDOM;
    if (!dom || !dom.card) {
        return;
    }

    const summary = prepareInventarioValoresSummary(valoresPayload);
    if (!summary) {
        resetInventarioValoresCard();
        return;
    }

    const setFieldValue = (element, value, mode = "text") => {
        if (!element) {
            return;
        }
        if (value === null || value === undefined || (typeof value === "number" && !Number.isFinite(value))) {
            element.textContent = "—";
            return;
        }

        switch (mode) {
            case "currency":
                element.textContent = currencyFormatter.format(value);
                break;
            case "percent":
                element.textContent = percentageFormatter.format(value);
                break;
            default:
                element.textContent = String(value);
                break;
        }
    };

    dom.card.hidden = false;
    dom.card.setAttribute("aria-hidden", "false");
    if (dom.layout) {
        dom.layout.classList.remove("indice-chart-card__layout--single");
    }

    setFieldValue(dom.ano, summary.ano);
    setFieldValue(dom.unidade, summary.unidade);
    setFieldValue(dom.estoque, summary.estoque, "currency");
    setFieldValue(dom.falta, summary.falta, "currency");
    setFieldValue(dom.sobra, summary.sobra, "currency");
    setFieldValue(dom.valorAbsoluto, summary.valorAbsoluto, "currency");
    setFieldValue(dom.valorModular, summary.valorModular, "currency");
    setFieldValue(dom.percentualAjuste, summary.percentualAjuste, "percent");
}

function getInventarioChartElements() {
    const chartCard = document.getElementById("inventario-chart-card");
    const chartContainer = document.getElementById("inventario-chart");
    const canvas = document.getElementById("inventarioChart");
    const emptyState = document.getElementById("inventario-chart-empty");
    const legend = chartCard ? chartCard.querySelector(".indice-chart-card__legend") : null;
    const legendItems = legend
        ? {
              semMeta: legend.querySelector('[data-legend="sem-meta"]') || null,
              atingiu: legend.querySelector('[data-legend="atingiu"]') || null,
              naoAtingiu: legend.querySelector('[data-legend="nao-atingiu"]') || null,
          }
        : null;
    return { chartCard, chartContainer, canvas, emptyState, legend, legendItems };
}

function formatInventarioPercent(value) {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return null;
    }
    return Number.parseFloat(value.toFixed(2));
}

function toggleInventarioEmptyState(shouldShow) {
    const { chartContainer, emptyState, legend, legendItems } = getInventarioChartElements();
    if (!chartContainer || !emptyState) {
        return;
    }
    if (shouldShow) {
        emptyState.hidden = false;
        chartContainer.classList.add("is-hidden");
        if (legend) {
            legend.hidden = true;
            legend.setAttribute("aria-hidden", "true");
        }
        if (legendItems) {
            Object.values(legendItems).forEach((item) => {
                if (item) {
                    item.classList.add("is-hidden");
                }
            });
        }
    } else {
        emptyState.hidden = true;
        chartContainer.classList.remove("is-hidden");
        if (legend) {
            legend.hidden = false;
            legend.setAttribute("aria-hidden", "false");
        }
    }
}

function ensureInventarioPlugins() {
    return Boolean(window.Chart);
}

function updateInventarioLegendState(indicadores) {
    const { legend, legendItems } = getInventarioChartElements();
    if (!legend || !legendItems) {
        return;
    }
    const temAlgum = indicadores.semMeta || indicadores.atingiu || indicadores.naoAtingiu;
    legend.hidden = !temAlgum;
    legend.setAttribute("aria-hidden", temAlgum ? "false" : "true");
    if (!temAlgum) {
        Object.values(legendItems).forEach((item) => {
            if (item) {
                item.classList.add("is-hidden");
            }
        });
        return;
    }
    if (legendItems.semMeta) {
        legendItems.semMeta.classList.toggle("is-hidden", !indicadores.semMeta);
    }
    if (legendItems.atingiu) {
        legendItems.atingiu.classList.toggle("is-hidden", !indicadores.atingiu);
    }
    if (legendItems.naoAtingiu) {
        legendItems.naoAtingiu.classList.toggle("is-hidden", !indicadores.naoAtingiu);
    }
}

function buildInventarioChartConfig(registros, metaPadrao) {
    const labels = registros.map((item) => item.mes);
    const dadosAtingiu = [];
    const dadosNaoAtingiu = [];
    const dadosSemMeta = [];
    const linhaMeta = [];

    registros.forEach((item) => {
        const percentual = formatInventarioPercent(item.percent);
        const metaReferencia = Number.isFinite(item.meta)
            ? formatInventarioPercent(item.meta)
            : Number.isFinite(metaPadrao)
            ? formatInventarioPercent(metaPadrao)
            : null;

        if (metaReferencia === null) {
            dadosAtingiu.push(null);
            dadosNaoAtingiu.push(null);
            dadosSemMeta.push(percentual);
            linhaMeta.push(null);
            return;
        }

        linhaMeta.push(metaReferencia);

        if (percentual !== null && percentual <= metaReferencia) {
            dadosAtingiu.push(percentual);
            dadosNaoAtingiu.push(null);
            dadosSemMeta.push(null);
        } else if (percentual !== null) {
            dadosAtingiu.push(null);
            dadosNaoAtingiu.push(percentual);
            dadosSemMeta.push(null);
        } else {
            dadosAtingiu.push(null);
            dadosNaoAtingiu.push(null);
            dadosSemMeta.push(null);
        }
    });

    const temSemMeta = dadosSemMeta.some((valor) => Number.isFinite(valor));
    const temAtingiu = dadosAtingiu.some((valor) => Number.isFinite(valor));
    const temNaoAtingiu = dadosNaoAtingiu.some((valor) => Number.isFinite(valor));
    const temMeta = linhaMeta.some((valor) => Number.isFinite(valor));

    const datasets = [];

    if (temSemMeta) {
        datasets.push({
            type: "bar",
            label: "Sem meta",
            data: dadosSemMeta,
            backgroundColor: INVENTARIO_CHART_COLORS.neutralFill,
            borderColor: INVENTARIO_CHART_COLORS.neutralBorder,
            borderWidth: 0,
            borderRadius: 2,
            borderSkipped: false,
            stack: "percentual",
            maxBarThickness: 70,
            order: 1,
        });
    }

    if (temAtingiu) {
        datasets.push({
            type: "bar",
            label: "Atingiu meta",
            data: dadosAtingiu,
            backgroundColor: INVENTARIO_CHART_COLORS.hitFill,
            borderColor: INVENTARIO_CHART_COLORS.hitBorder,
            borderWidth: 0,
            borderRadius: 2,
            borderSkipped: false,
            stack: "percentual",
            maxBarThickness: 70,
            order: 1,
        });
    }

    if (temNaoAtingiu) {
        datasets.push({
            type: "bar",
            label: "Nao atingiu meta",
            data: dadosNaoAtingiu,
            backgroundColor: INVENTARIO_CHART_COLORS.missFill,
            borderColor: INVENTARIO_CHART_COLORS.missBorder,
            borderWidth: 0,
            borderRadius: 2,
            borderSkipped: false,
            stack: "percentual",
            maxBarThickness: 70,
            order: 1,
        });
    }

    if (temMeta) {
        datasets.push({
            type: "line",
            label: "Meta",
            data: linhaMeta.map((valor) => (Number.isFinite(valor) ? valor : null)),
            borderColor: INVENTARIO_CHART_COLORS.line,
            backgroundColor: INVENTARIO_CHART_COLORS.line,
            borderWidth: 3,
            pointRadius: 4,
            pointHoverRadius: 5,
            pointBackgroundColor: INVENTARIO_CHART_COLORS.line,
            pointBorderColor: "#ffffff",
            pointBorderWidth: 1.5,
            spanGaps: false,
            tension: 0.35,
            order: 99,
            stack: "meta-line",
            clip: false,
        });
    }

    const possuiSeries = datasets.some(
        (dataset) => Array.isArray(dataset.data) && dataset.data.some((valor) => Number.isFinite(valor))
    );

    const config = {
        type: "bar",
        data: {
            labels,
            datasets,
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: "index",
                intersect: false,
            },
            scales: {
                x: {
                    stacked: true,
                    grid: {
                        display: false,
                    },
                    ticks: {
                        color: "#000000",
                        font: {
                            size: 12,
                        },
                    },
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    grid: {
                        color: "rgba(15, 23, 42, 0.08)",
                        drawBorder: false,
                    },
                    ticks: {
                        color: "rgba(15, 23, 42, 0.65)",
                        font: {
                            size: 12,
                        },
                        callback: (value) => {
                            if (!Number.isFinite(value)) {
                                return "";
                            }
                            return `${Number.parseFloat(value).toFixed(2)}%`;
                        },
                    },
                },
            },
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    mode: "index",
                    intersect: false,
                    callbacks: {
                        label: (context) => {
                            const value = context?.parsed?.y;
                            if (!Number.isFinite(value)) {
                                return undefined;
                            }
                            const datasetLabel = context.dataset?.label || "";
                            const formatted = `${value.toFixed(2)}%`;
                            return datasetLabel ? `${datasetLabel}: ${formatted}` : formatted;
                        },
                    },
                },
            },
        },
        plugins: [INVENTARIO_LINE_OVER_BARS_PLUGIN, INVENTARIO_VALUE_LABELS_PLUGIN],
    };

    return {
        config,
        possuiSeries,
        indicadoresLegenda: {
            semMeta: temSemMeta,
            atingiu: temAtingiu,
            naoAtingiu: temNaoAtingiu,
        },
    };
}

function renderInventarioChart(dataset) {
    const { canvas } = getInventarioChartElements();
    if (!canvas) {
        return;
    }

    if (!dataset || !Array.isArray(dataset.labels) || !dataset.labels.length) {
        throw new Error("Dados de inventario indisponiveis");
    }

    if (!ensureInventarioPlugins()) {
        console.error("Chart.js nao foi carregado. Verifique o script externo.");
        return;
    }

    const realizedValues = Array.isArray(dataset.realizado) ? dataset.realizado : [];
    const metaValues = Array.isArray(dataset.meta) ? dataset.meta : [];

    const registros = dataset.labels.map((label, index) => {
        const percentValue = typeof realizedValues[index] === "number" && Number.isFinite(realizedValues[index])
            ? realizedValues[index]
            : null;
        const metaValue = typeof metaValues[index] === "number" && Number.isFinite(metaValues[index])
            ? metaValues[index]
            : null;
        return {
            mes: label !== null && label !== undefined && label !== "" ? String(label) : `Item ${index + 1}`,
            percent: percentValue,
            meta: metaValue,
        };
    });

    const registrosValidos = registros.filter((row) => row.mes && Number.isFinite(row.percent));
    if (!registrosValidos.length) {
        if (inventarioChartInstance) {
            inventarioChartInstance.destroy();
            inventarioChartInstance = null;
        }
        toggleInventarioEmptyState(true);
        updateInventarioLegendState({ semMeta: false, atingiu: false, naoAtingiu: false });
        return;
    }

    const metaPadrao = registrosValidos.map((row) => row.meta).find((value) => Number.isFinite(value)) ?? null;
    const { config, possuiSeries, indicadoresLegenda } = buildInventarioChartConfig(registrosValidos, metaPadrao);

    if (!possuiSeries) {
        if (inventarioChartInstance) {
            inventarioChartInstance.destroy();
            inventarioChartInstance = null;
        }
        toggleInventarioEmptyState(true);
        updateInventarioLegendState({ semMeta: false, atingiu: false, naoAtingiu: false });
        return;
    }

    toggleInventarioEmptyState(false);
    updateInventarioLegendState(indicadoresLegenda);

    if (inventarioChartInstance) {
        inventarioChartInstance.destroy();
        inventarioChartInstance = null;
    }

    const context = canvas.getContext("2d");
    if (!context) {
        console.error("Contexto 2D do canvas indisponivel para o grafico de inventario.");
        toggleInventarioEmptyState(true);
        updateInventarioLegendState({ semMeta: false, atingiu: false, naoAtingiu: false });
        return;
    }

    try {
        inventarioChartInstance = new Chart(context, config);
    } catch (error) {
        console.error("Falha ao renderizar grafico de inventario.", error);
        toggleInventarioEmptyState(true);
        updateInventarioLegendState({ semMeta: false, atingiu: false, naoAtingiu: false });
        return;
    }

    const inventarioPanel = document.querySelector('[data-slide-id="inventario"]');
    if (inventarioPanel && inventarioPanel.classList.contains("is-active")) {
        requestAnimationFrame(() => {
            if (inventarioChartInstance) {
                inventarioChartInstance.resize();
            }
        });
    }
}

function renderBloqueadoChart(payload) {
    const canvasElement = document.getElementById("bloqueadoChart");
    if (!canvasElement) {
        return;
    }

    if (bloqueadoChartInstance) {
        bloqueadoChartInstance.destroy();
    }

    removeExistingTooltip(canvasElement);

    const styles = getComputedStyle(document.documentElement);
    const colors = {
        primary: styles.getPropertyValue("--color-primary").trim() || "#001f54",
        axis: styles.getPropertyValue("--color-axis").trim() || "#7d8597",
        grid: styles.getPropertyValue("--color-grid").trim() || "rgba(0, 31, 84, 0.08)",
        linePositive: styles.getPropertyValue("--color-line-positive").trim() || "#1f9d58",
        lineNegative: styles.getPropertyValue("--color-line-negative").trim() || "#d64545",
        lineBase: styles.getPropertyValue("--color-line-base").trim() || "#b8860b",
        lineLabelPositive: styles.getPropertyValue("--color-line-label-positive").trim() || "#0f5132",
        lineLabelNegative: styles.getPropertyValue("--color-line-label-negative").trim() || "#7b1b1b",
        lineLabelZero: styles.getPropertyValue("--color-line-label-zero").trim() || "#ffffff",
        pointCore: styles.getPropertyValue("--color-point-core").trim() || "#ffffff",
        tickInicio: styles.getPropertyValue("--color-tick-inicio").trim() || "#0b7285",
        tickFim: styles.getPropertyValue("--color-tick-fim").trim() || "#7b1b1b",
        barLabelPositive: styles.getPropertyValue("--color-bar-label-positive").trim() || "#b42331",
        barLabelNegative: styles.getPropertyValue("--color-bar-label-negative").trim() || "#0f5132",
        barLabelNeutral: styles.getPropertyValue("--color-bar-label-neutral").trim() || "#4f5d75",
        tooltipBg: styles.getPropertyValue("--color-card-bg").trim() || "#ffffff",
        tooltipBorder: styles.getPropertyValue("--color-axis").trim() || "#7d8597",
        textMain: styles.getPropertyValue("--color-text-main").trim() || "#1f2430",
        monthHighlightStart: styles.getPropertyValue("--color-highlight-inicio").trim() || "rgba(0, 101, 148, 0.12)",
        monthHighlightEnd: styles.getPropertyValue("--color-highlight-fim").trim() || "rgba(123, 27, 27, 0.12)",
    };

    Chart.defaults.font.family = "Segoe UI, Tahoma, Geneva, Verdana, sans-serif";
    Chart.defaults.color = colors.textMain;

    const gradient = canvasElement.getContext("2d").createLinearGradient(0, 0, 0, canvasElement.height);
    gradient.addColorStop(0, colors.primary);
    gradient.addColorStop(1, colors.primary);

    const monthEdgeHighlights = {
        id: "monthEdgeHighlights",
        beforeDatasetsDraw(chart) {
            const meta = chart.getDatasetMeta(0);
            if (!meta || !meta.data) {
                return;
            }

            const { ctx, chartArea } = chart;
            if (!chartArea) {
                return;
            }

            ctx.save();
            ctx.globalAlpha = 1;

            meta.data.forEach((barElement, index) => {
                const day = (dayLabels[index] || "").toLowerCase();
                if (day !== "inicio" && day !== "fim") {
                    return;
                }

                const props = barElement.getProps(["x", "width"], true);
                const centerX = props.x ?? barElement.x;
                const barWidth = props.width ?? barElement.width ?? 0;
                if (typeof centerX !== "number" || Number.isNaN(centerX)) {
                    return;
                }
                const safeWidth = typeof barWidth === "number" && !Number.isNaN(barWidth) ? barWidth : 0;
                const halfWidth = safeWidth / 2;
                const padding = 12;
                const left = centerX - halfWidth - padding;
                const right = centerX + halfWidth + padding;
                const top = chartArea.top - 6;
                const height = chartArea.bottom - chartArea.top + 12;

                ctx.fillStyle = day === "inicio" ? colors.monthHighlightStart : colors.monthHighlightEnd;
                ctx.fillRect(left, top, right - left, height);
            });

            ctx.restore();
        },
    };

    const customValueLabels = {
        id: "customValueLabels",
        afterDatasetsDraw(chart) {
            const { ctx } = chart;
            const datasetMeta = chart.getDatasetMeta(0);
            const dataset = chart.data.datasets[0];

            const placedBoxes = [];
            const labelHeight = 16;
            const labelMargin = 6;

            const adjustVerticalPosition = (centerX, width, startY) => {
                let adjustedY = startY;
                let top = adjustedY - labelHeight;
                let bottom = adjustedY;

                const overlaps = (box) => {
                    const horizontalOverlap =
                        centerX - width / 2 < box.right && centerX + width / 2 > box.left;
                    const verticalOverlap = top < box.bottom + labelMargin && bottom > box.top - labelMargin;
                    return horizontalOverlap && verticalOverlap;
                };

                while (placedBoxes.some(overlaps)) {
                    adjustedY -= labelHeight + labelMargin;
                    top = adjustedY - labelHeight;
                    bottom = adjustedY;
                }

                placedBoxes.push({
                    left: centerX - width / 2,
                    right: centerX + width / 2,
                    top,
                    bottom,
                });

                return adjustedY;
            };

            ctx.save();
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillStyle = colors.textMain;
            ctx.font = "600 13px Segoe UI, Tahoma";

            datasetMeta.data.forEach((barElement, index) => {
                const rawValue = dataset.data[index];
                const previousValue = index > 0 ? dataset.data[index - 1] : null;
                const deltaInfo = evaluateDelta(rawValue, previousValue);
                const arrow = deltaInfo.arrow && deltaInfo.delta !== null ? deltaInfo.arrow : "";
                const arrowColor = deltaToneColors[deltaInfo.tone] || colors.barLabelNeutral;

                const formattedValue = currencyFormatter.format(rawValue);
                const position = barElement.tooltipPosition();
                const originalAlign = ctx.textAlign;
                const originalFont = ctx.font;

                const arrowText = arrow;
                const spaceText = arrow ? " " : "";
                const valueText = formattedValue;

                ctx.textAlign = "left";

                let arrowWidth = 0;
                let spaceWidth = 0;
                if (arrow) {
                    ctx.font = "700 13px Segoe UI, Tahoma";
                    arrowWidth = ctx.measureText(arrowText).width;
                    spaceWidth = ctx.measureText(spaceText).width;
                }

                ctx.font = originalFont;
                const valueWidth = ctx.measureText(valueText).width;
                const totalWidth = arrowWidth + spaceWidth + valueWidth;
                const baseX = position.x - totalWidth / 2;
                const adjustedBaseY = adjustVerticalPosition(position.x, totalWidth, position.y - 12);

                if (arrow) {
                    ctx.font = "700 13px Segoe UI, Tahoma";
                    ctx.fillStyle = arrowColor;
                    ctx.fillText(arrowText, baseX, adjustedBaseY);
                }

                ctx.font = originalFont;
                ctx.fillStyle = colors.textMain;
                ctx.fillText(valueText, baseX + arrowWidth + spaceWidth, adjustedBaseY);

                ctx.textAlign = originalAlign;
            });

            ctx.restore();
        },
    };

    const lineValueLabels = {
        id: "lineValueLabels",
        afterDatasetsDraw(chart) {
            const datasetIndex = chart.data.datasets.findIndex((dataset) => dataset.label === "Percentual");
            if (datasetIndex === -1) {
                return;
            }

            const meta = chart.getDatasetMeta(datasetIndex);
            if (!meta || meta.hidden) {
                return;
            }

            const { ctx } = chart;
            ctx.save();
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.font = "600 12px Segoe UI, Tahoma";

            const placedBoxes = [];
            const labelHeight = 14;
            const labelMargin = 6;

            const adjustVerticalPosition = (centerX, width, startY) => {
                let adjustedY = startY;
                let top = adjustedY - labelHeight;
                let bottom = adjustedY;

                const overlaps = (box) => {
                    const horizontalOverlap =
                        centerX - width / 2 < box.right && centerX + width / 2 > box.left;
                    const verticalOverlap = top < box.bottom + labelMargin && bottom > box.top - labelMargin;
                    return horizontalOverlap && verticalOverlap;
                };

                while (placedBoxes.some(overlaps)) {
                    adjustedY -= labelHeight + labelMargin;
                    top = adjustedY - labelHeight;
                    bottom = adjustedY;
                }

                placedBoxes.push({
                    left: centerX - width / 2,
                    right: centerX + width / 2,
                    top,
                    bottom,
                });

                return adjustedY;
            };

            meta.data.forEach((pointElement, index) => {
                if (!pointElement) {
                    return;
                }

                const originalValue = percentValues[index] ?? 0;
                let textColor = colors.lineLabelZero;
                if (originalValue > 0) {
                    textColor = colors.lineLabelPositive;
                } else if (originalValue < 0) {
                    textColor = colors.lineLabelNegative;
                }

                const label = percentageFormatter.format(originalValue / 100);
                const { x, y } = pointElement.tooltipPosition();
                const labelWidth = ctx.measureText(label).width;
                const adjustedY = adjustVerticalPosition(x, labelWidth, y - 8);
                ctx.fillStyle = textColor;
                ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
                ctx.shadowBlur = 6;
                ctx.fillText(label, x, adjustedY);
            });

            ctx.restore();
        },
    };

    const labelParts = payload.labels.map((label) => {
        if (typeof label !== "string") {
            return { day: "", month: "" };
        }
        const rawParts = label.trim().split(/\s+/);
        const [dayPart, ...monthParts] = rawParts;
        return {
            day: dayPart ? dayPart.trim() : "",
            month: monthParts.length ? monthParts.join(" ").trim() : "",
        };
    });

    const dayLabels = labelParts.map((part) => part.day);
    const monthLabels = labelParts.map((part) => part.month || part.day);

    const percentValues = Array.isArray(payload.line) ? payload.line : [];
    const acumulativoValues = Array.isArray(payload.acumulativos) ? payload.acumulativos : [];
    const maxPercent = percentValues.length ? Math.max(...percentValues) : 0;
    const minPercent = percentValues.length ? Math.min(...percentValues) : 0;

    const lineScale = 0.55; // 55% of original amplitude
    const lineOffset = 55;  // shift down in axis units (after scaling)
    const scaledPercentValues = percentValues.map((v) => v * lineScale - lineOffset);
    const maxScaled = scaledPercentValues.length ? Math.max(...scaledPercentValues) : 0;
    const minScaled = scaledPercentValues.length ? Math.min(...scaledPercentValues) : 0;

    const lineDataset = {
        type: "line",
        label: "Percentual",
        data: scaledPercentValues,
        yAxisID: "yPercent",
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: false,
        tension: 0,
        borderColor: colors.lineBase,
        pointBackgroundColor: colors.pointCore,
        pointBorderColor: colors.lineBase,
        pointHoverBackgroundColor: colors.pointCore,
        pointHoverBorderColor: colors.lineBase,
        pointBorderWidth: 2,
        order: 2,
        clip: false,
    };

    const barDataset = {
        type: "bar",
        label: "R$ Bloq. no ESTOQUE",
        data: payload.bars,
        yAxisID: "y",
        backgroundColor: gradient,
        borderRadius: 4,
        barThickness: 60,
        borderSkipped: false,
        categoryPercentage: 0.62,
        barPercentage: 0.74,
        order: 3,
    };

    const deltaToneColors = {
        good: colors.barLabelNegative,
        bad: colors.barLabelPositive,
        neutral: colors.barLabelNeutral,
        empty: colors.barLabelNeutral,
    };

    const toneClassMap = {
        good: "good",
        bad: "bad",
        neutral: "neutral",
        empty: "neutral",
    };

    const evaluateDelta = (current, previous) => {
        if (previous === undefined || previous === null) {
            return {
                delta: null,
                percent: null,
                arrow: null,
                tone: "neutral",
            };
        }

        const delta = current - previous;
        const percentChange = previous !== 0 ? delta / previous : null;
        let arrow = "→";
        let tone = "neutral";
        if (delta > 0) {
            arrow = "↑";
            tone = "bad";
        } else if (delta < 0) {
            arrow = "↓";
            tone = "good";
        }

        return {
            delta,
            percent: percentChange,
            arrow,
            tone,
        };
    };

    const toneDescriptions = {
        good: "Queda (bom)",
        bad: "Alta (ruim)",
        neutral: "Estável",
        empty: "Sem avaliação",
    };

    const formatDeltaText = ({ delta, percent }, { isCurrency = true, zeroFallback = "Sem variação" } = {}) => {
        if (delta === null) {
            return zeroFallback;
        }

        if (isCurrency) {
            const deltaText = currencyFormatter.format(Math.abs(delta));
            if (percent !== null && !Number.isNaN(percent)) {
                return `${deltaText} (${percentageFormatter.format(Math.abs(percent))})`;
            }
            return deltaText;
        }

        return percentageFormatter.format(Math.abs(delta) / 100);
    };

    const createTooltipEntry = (label, value, options = {}) => ({
        label,
        value,
        arrow: options.arrow || "",
        arrowTone: options.arrowTone || "neutral",
        valueTone: options.valueTone || "neutral",
        emphasize: Boolean(options.emphasize),
        muted: Boolean(options.muted),
        icon: options.icon || null,
    });

    const tooltipIcons = {
        value: '<svg viewBox="0 0 24 24" role="presentation" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19h14"></path><path d="M8 19V11"></path><path d="M12 19V7"></path><path d="M16 19V13"></path></svg>',
        percent: '<svg viewBox="0 0 24 24" role="presentation" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 17.5l11-11"></path><circle cx="8.5" cy="8.5" r="2.5"></circle><circle cx="15.5" cy="15.5" r="2.5"></circle></svg>',
        delta: '<svg viewBox="0 0 24 24" role="presentation" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 14l5.5-6 3.5 4L19 8"></path><path d="M15 8h4v4"></path></svg>',
        signal: '<svg viewBox="0 0 24 24" role="presentation" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14"></path><path d="M7 13l3-3 3 2 4-5"></path><path d="M17 6h2v2"></path></svg>',
        sum: '<svg viewBox="0 0 24 24" role="presentation" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 6.5h-9l5 5-5 6h9"></path></svg>',
        compare: '<svg viewBox="0 0 24 24" role="presentation" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19h14"></path><path d="M8.5 19V9"></path><path d="M15.5 19V13"></path><path d="M11.5 9l-3-3H8v3"></path><path d="M12.5 13l3 3H16v-3"></path></svg>',
    };

    const getBarTooltipEntries = (index) => {
        const entries = [];
        const current = payload.bars[index] ?? 0;
        const previous = index > 0 ? payload.bars[index - 1] : null;
        const acumulativoAtual = acumulativoValues[index];
        const deltaInfo = evaluateDelta(current, previous);

        entries.push(
            createTooltipEntry("Valor atual", currencyFormatter.format(current), {
                emphasize: true,
                icon: "value",
            })
        );

        if (typeof acumulativoAtual === "number" && !Number.isNaN(acumulativoAtual)) {
            entries.push(
                createTooltipEntry("Acumulativo", currencyFormatter.format(acumulativoAtual), {
                    muted: true,
                    icon: "sum",
                })
            );
        }

        if (deltaInfo.delta === null) {
            entries.push(
                createTooltipEntry("Δ vs anterior", "Sem histórico", {
                    muted: true,
                    icon: "delta",
                })
            );
        } else {
            const deltaText = formatDeltaText(deltaInfo, { isCurrency: true });
            entries.push(
                createTooltipEntry("Δ vs anterior", deltaText, {
                    arrow: deltaInfo.arrow,
                    arrowTone: deltaInfo.tone,
                    icon: "delta",
                })
            );
            entries.push(
                createTooltipEntry("Sinal", toneDescriptions[deltaInfo.tone] || toneDescriptions.neutral, {
                    muted: true,
                    icon: "signal",
                })
            );
            if (index > 0 && payload.labels[index - 1]) {
                entries.push(
                    createTooltipEntry("Comparado com", payload.labels[index - 1], {
                        muted: true,
                        icon: "compare",
                    })
                );
            }
        }

        return entries;
    };

    const getLineTooltipEntries = (index) => {
        const entries = [];
        const currentPercent = percentValues[index] ?? 0;
        const previousPercent = index > 0 ? percentValues[index - 1] : null;
        const deltaInfo = evaluateDelta(currentPercent, previousPercent);
        const correspondingBar = payload.bars[index];
        const acumulativoAtual = acumulativoValues[index];

        entries.push(
            createTooltipEntry("Percentual", percentageFormatter.format(currentPercent / 100), {
                valueTone: currentPercent > 0 ? "good" : currentPercent < 0 ? "bad" : "neutral",
                emphasize: true,
                icon: "percent",
            })
        );

        if (deltaInfo.delta === null) {
            entries.push(
                createTooltipEntry("Δ vs anterior", "Sem histórico", {
                    muted: true,
                    icon: "delta",
                })
            );
        } else {
            const deltaPercentText = formatDeltaText(deltaInfo, { isCurrency: false });
            entries.push(
                createTooltipEntry("Δ vs anterior", deltaPercentText, {
                    arrow: deltaInfo.arrow,
                    arrowTone: deltaInfo.tone,
                    icon: "delta",
                })
            );
            entries.push(
                createTooltipEntry("Sinal", toneDescriptions[deltaInfo.tone] || toneDescriptions.neutral, {
                    muted: true,
                    icon: "signal",
                })
            );
            if (index > 0 && payload.labels[index - 1]) {
                entries.push(
                    createTooltipEntry("Comparado com", payload.labels[index - 1], {
                        muted: true,
                        icon: "compare",
                    })
                );
            }
        }

        if (typeof correspondingBar === "number" && !Number.isNaN(correspondingBar)) {
            entries.push(
                createTooltipEntry("Bloq. no estoque", currencyFormatter.format(correspondingBar), {
                    muted: true,
                    icon: "value",
                })
            );
        }

        if (typeof acumulativoAtual === "number" && !Number.isNaN(acumulativoAtual)) {
            entries.push(
                createTooltipEntry("Acumulativo", currencyFormatter.format(acumulativoAtual), {
                    muted: true,
                    icon: "sum",
                })
            );
        }

        return entries;
    };

    const tooltipHelpers = {
        getEntriesForBar: getBarTooltipEntries,
        getEntriesForLine: getLineTooltipEntries,
        toneClassMap,
        icons: tooltipIcons,
    };

    bloqueadoChartInstance = new Chart(canvasElement, {
        type: "bar",
        data: {
            labels: payload.labels,
            datasets: [barDataset, lineDataset],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    enabled: false,
                    external: (context) => externalTooltipHandler(context, tooltipHelpers),
                },
            },
            scales: {
                x: {
                    offset: true,
                    ticks: {
                        maxRotation: 0,
                        minRotation: 0,
                        autoSkip: false,
                        padding: 12,
                        callback(value, index) {
                            const day = dayLabels[index] || "";
                            const month = monthLabels[index] || "";
                            return [day, month];
                        },
                        color: (context) => {
                            const day = (dayLabels[context.index] || "").toLowerCase();
                            if (day === "inicio") {
                                return colors.tickInicio;
                            }
                            if (day === "fim") {
                                return colors.tickFim;
                            }
                            return "#000000";
                        },
                    },
                    grid: {
                        display: false,
                    },
                    border: {
                        display: false,
                    },
                },
                y: {
                    beginAtZero: true,
                    display: false,
                    ticks: {
                        display: false,
                        callback: (value) => currencyFormatter.format(value),
                    },
                    grid: {
                        display: false,
                    },
                    border: {
                        display: false,
                    },
                },
                yPercent: {
                    position: "right",
                    display: false,
                    ticks: {
                        // Invert transform for axis labels
                        callback: (value) => percentageFormatter.format((value + lineOffset) / 100 / lineScale),
                        padding: 12,
                        color: colors.axis,
                        maxTicksLimit: 6,
                        display: false,
                    },
                    grid: {
                        drawOnChartArea: false,
                        display: false,
                    },
                    border: {
                        display: false,
                    },
                    // Use scaled bounds to keep the line lower without clipping
                    suggestedMin: Math.min(minScaled * 1.2, -40),
                    suggestedMax: Math.max(maxScaled * 1.2, 10),
                },
            },
        },
        plugins: [monthEdgeHighlights, customValueLabels, lineValueLabels],
    });
}

function prepareCorteDataset(payload) {
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    if (!rows.length) {
        throw new Error("Formato de dados de corte invalido");
    }

    const parseNumeric = (value) => {
        if (value === null || value === undefined || value === "") {
            return null;
        }
        if (typeof value === "number") {
            return Number.isFinite(value) ? value : null;
        }
        if (typeof value === "string") {
            const cleaned = value.replace(/[^0-9,\-.]/g, "").trim();
            const hasComma = cleaned.includes(",");
            const hasDot = cleaned.includes(".");
            let normalized = cleaned;
            if (hasComma && hasDot) {
                normalized = cleaned.replace(/\./g, "").replace(",", ".");
            } else if (hasComma) {
                normalized = cleaned.replace(",", ".");
            }
            const parsed = Number(normalized);
            return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
    };

    const labels = [];
    const percentages = [];
    const meta = [];
    const valorTotalValues = [];
    const cortePedidoValues = [];
    const faturamentoValues = [];

    const valorTotalCandidates = ["Soma de Valor Total", "Valor Total", "Total", "Valor", "Soma"];
    const cortePedidoCandidates = ["Corte/Pedido", "Corte por Pedido", "Corte Pedido", "% Corte/Pedido", "% Corte por Pedido"];
    const faturamentoCandidates = ["FATURAMENTO", "Faturamento", "Total Faturamento", "Soma de Faturamento"];

    rows.forEach((row) => {
        if (!row) {
            return;
        }

        const labelRaw = row["Rótulos de Linha"] ?? row["Mês"] ?? row.Mes ?? "";
        labels.push(labelRaw !== undefined && labelRaw !== null ? String(labelRaw) : "");

        const percentValue = parseNumeric(row["%"]); // stored as ratio (0-1)
        percentages.push(percentValue !== null ? percentValue * 100 : 0);

        const metaValue = parseNumeric(row.META);
        meta.push(metaValue !== null ? metaValue * 100 : null);

        const valorTotalRaw = extractValueFromRow(row, valorTotalCandidates);
        const valorTotalNumeric = parseNumeric(valorTotalRaw);
        valorTotalValues.push(valorTotalNumeric);

        const cortePedidoRaw = extractValueFromRow(row, cortePedidoCandidates);
        let cortePedidoNumeric = parseNumeric(cortePedidoRaw);
        if (typeof cortePedidoNumeric === "number") {
            cortePedidoNumeric = Math.abs(cortePedidoNumeric) <= 1 ? cortePedidoNumeric * 100 : cortePedidoNumeric;
        } else {
            cortePedidoNumeric = null;
        }
        cortePedidoValues.push(cortePedidoNumeric);

        const faturamentoRaw = extractValueFromRow(row, faturamentoCandidates);
        const faturamentoNumeric = parseNumeric(faturamentoRaw);
        faturamentoValues.push(faturamentoNumeric);
    });

    return {
        labels,
        percentages,
        meta,
        valorTotal: valorTotalValues,
        cortePorPedido: cortePedidoValues,
        faturamento: faturamentoValues,
    };
}

function renderCorteChart(dataset) {
    const canvasElement = document.getElementById("corteChart");
    if (!canvasElement) {
        return;
    }

    if (!dataset || !Array.isArray(dataset.labels) || !dataset.labels.length) {
        throw new Error("Dados de corte indisponiveis");
    }

    if (corteChartInstance) {
        corteChartInstance.destroy();
    }

    const context = canvasElement.getContext("2d");
    const styles = getComputedStyle(document.documentElement);
    const colors = {
        primary: styles.getPropertyValue("--color-primary").trim() || "#001f54",
        axis: styles.getPropertyValue("--color-axis").trim() || "#7d8597",
        grid: styles.getPropertyValue("--color-grid").trim() || "rgba(0, 31, 84, 0.08)",
        lineBase: styles.getPropertyValue("--color-line-base").trim() || "#b8860b",
        pointCore: styles.getPropertyValue("--color-point-core").trim() || "#ffffff",
        textMain: styles.getPropertyValue("--color-text-main").trim() || "#1f2430",
        barLabelPositive: styles.getPropertyValue("--color-bar-label-positive").trim() || "#b42331",
        barLabelNegative: styles.getPropertyValue("--color-bar-label-negative").trim() || "#0f5132",
        barLabelNeutral: styles.getPropertyValue("--color-bar-label-neutral").trim() || "#4f5d75",
        tooltipBg: styles.getPropertyValue("--color-card-bg").trim() || "#ffffff",
        tooltipBorder: styles.getPropertyValue("--color-axis").trim() || "#7d8597",
    };

    const deltaToneColors = {
        good: colors.barLabelNegative,
        bad: colors.barLabelPositive,
        neutral: colors.barLabelNeutral,
        empty: colors.barLabelNeutral,
    };

    let barBackground = colors.primary;
    if (context) {
        const height = canvasElement.height || canvasElement.clientHeight || 320;
        const gradient = context.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, colors.primary);
        gradient.addColorStop(1, colors.primary);
        barBackground = gradient;
    }

    const sanitizedLabels = dataset.labels.map((label) => (label ? label.trim() : "N/A"));
    const sanitizedBars = dataset.percentages.map((value) => {
        if (typeof value === "number" && Number.isFinite(value)) {
            return value;
        }
        return 0;
    });

    const sanitizedMeta = dataset.meta.map((value) => {
        if (typeof value === "number" && Number.isFinite(value)) {
            return value;
        }
        return null;
    });

    const sanitizedValorTotal = Array.isArray(dataset.valorTotal)
        ? dataset.valorTotal.map((value) => (typeof value === "number" && Number.isFinite(value) ? value : null))
        : [];

    const sanitizedCortePedido = Array.isArray(dataset.cortePorPedido)
        ? dataset.cortePorPedido.map((value) => (typeof value === "number" && Number.isFinite(value) ? value : null))
        : [];

    const sanitizedFaturamento = Array.isArray(dataset.faturamento)
        ? dataset.faturamento.map((value) => (typeof value === "number" && Number.isFinite(value) ? value : null))
        : [];

    const positiveValues = sanitizedBars.filter((value) => typeof value === "number");
    const metaValues = sanitizedMeta.filter((value) => typeof value === "number");
    const allValues = [...positiveValues, ...metaValues];

    let axisMax = allValues.length ? Math.max(...allValues) : 0;

        const epsilon = 0.0001;
        if (!Number.isFinite(axisMax) || axisMax === 0) {
            axisMax = 10;
        } else {
            axisMax = axisMax * 1.05;
        }

    const barTones = sanitizedBars.map((current, index) => {
        if (typeof current !== "number" || !Number.isFinite(current)) {
            return "neutral";
        }

        const previous =
            index > 0 && typeof sanitizedBars[index - 1] === "number" && Number.isFinite(sanitizedBars[index - 1])
                ? sanitizedBars[index - 1]
                : null;
        const metaValue = sanitizedMeta[index];

        let isGood = false;
        let isBad = false;

        if (previous !== null) {
            if (current <= previous - epsilon) {
                isGood = true;
            } else if (current >= previous + epsilon) {
                isBad = true;
            }
        }

        if (typeof metaValue === "number" && Number.isFinite(metaValue)) {
            if (current <= metaValue + epsilon) {
                isGood = true;
            } else if (current > metaValue + epsilon) {
                isBad = true;
            }
        }

        if (isBad && !isGood) {
            return "bad";
        }
        if (isGood && !isBad) {
            return "good";
        }
        return "neutral";
    });

    const toneFillMap = {
        good: "rgba(15, 81, 50, 0.56)",
        bad: "rgba(122, 0, 12, 0.81)",
        neutral: barBackground,
    };

    const toneBorderMap = {
        good: "rgba(15, 81, 50, 0.82)",
        bad: "rgba(71, 0, 7, 1)",
        neutral: colors.primary,
    };

    const barColors = barTones.map((tone) => toneFillMap[tone] || barBackground);
    const barBorderColors = barTones.map((tone) => toneBorderMap[tone] || colors.primary);

    const tooltipIcons = {
        percent: '<svg viewBox="0 0 24 24" role="presentation" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 17.5l11-11"></path><circle cx="8.5" cy="8.5" r="2.5"></circle><circle cx="15.5" cy="15.5" r="2.5"></circle></svg>',
        target: '<svg viewBox="0 0 24 24" role="presentation" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="4"></circle><circle cx="12" cy="12" r="1"></circle></svg>',
        delta: '<svg viewBox="0 0 24 24" role="presentation" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 14l5.5-6 3.5 4L19 8"></path><path d="M15 8h4v4"></path></svg>',
        compare: '<svg viewBox="0 0 24 24" role="presentation" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19h14"></path><path d="M8.5 19V9"></path><path d="M15.5 19V13"></path><path d="M11.5 9l-3-3H8v3"></path><path d="M12.5 13l3 3H16v-3"></path></svg>',
        value: '<svg viewBox="0 0 24 24" role="presentation" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19h14"></path><path d="M8 19V11"></path><path d="M12 19V7"></path><path d="M16 19V13"></path></svg>',
        sum: '<svg viewBox="0 0 24 24" role="presentation" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 6.5h-9l5 5-5 6h9"></path></svg>',
    };

    const toneClassMap = {
        good: "good",
        bad: "bad",
        neutral: "neutral",
        empty: "neutral",
    };

    const evaluateDelta = (current, comparison, { positiveIsBad = true } = {}) => {
        if (comparison === null || comparison === undefined) {
            return {
                delta: null,
                arrow: null,
                tone: "neutral",
            };
        }

        const delta = current - comparison;
        if (!Number.isFinite(delta)) {
            return {
                delta: null,
                arrow: null,
                tone: "neutral",
            };
        }

        if (Math.abs(delta) < 0.0001) {
            return {
                delta: 0,
                arrow: "→",
                tone: "neutral",
            };
        }

        const arrow = delta > 0 ? "↑" : "↓";
        let tone;
        if (delta > 0) {
            tone = positiveIsBad ? "bad" : "good";
        } else {
            tone = positiveIsBad ? "good" : "bad";
        }

        return {
            delta,
            arrow,
            tone,
        };
    };

    const formatPercent = (value) => percentageFormatter.format((value || 0) / 100);

    const createTooltipEntry = (label, value, options = {}) => ({
        label,
        value,
        arrow: options.arrow || "",
        arrowTone: options.arrowTone || "neutral",
        valueTone: options.valueTone || "neutral",
        emphasize: Boolean(options.emphasize),
        muted: Boolean(options.muted),
        icon: options.icon || null,
    });

    const getEntriesForBar = (index) => {
        const entries = [];
        const current = sanitizedBars[index] ?? 0;
        const metaValue = sanitizedMeta[index];
        const previousValue = index > 0 && typeof sanitizedBars[index - 1] === "number" ? sanitizedBars[index - 1] : null;
        const totalValue = sanitizedValorTotal[index];
        const cortePedidoValue = sanitizedCortePedido[index];
        const faturamentoValue = sanitizedFaturamento[index];

        entries.push(
            createTooltipEntry("Percentual", formatPercent(current), {
                emphasize: true,
                icon: "percent",
                valueTone: barTones[index] || "neutral",
            })
        );

        if (typeof totalValue === "number") {
            entries.push(
                createTooltipEntry("Corte de Pedido", currencyFormatter.format(totalValue), {
                    icon: "sum",
                    muted: true,
                })
            );
        }

        if (typeof cortePedidoValue === "number") {
            entries.push(
                createTooltipEntry("Corte/pedido", formatPercent(cortePedidoValue), {
                    icon: "percent",
                    muted: true,
                })
            );
        }

        if (typeof faturamentoValue === "number") {
            entries.push(
                createTooltipEntry("Faturamento", currencyFormatter.format(faturamentoValue), {
                    icon: "value",
                    muted: true,
                })
            );
        }

        if (previousValue !== null) {
            entries.push(
                createTooltipEntry("Mês anterior", formatPercent(previousValue), {
                    icon: "compare",
                    muted: true,
                })
            );

            const deltaPrevInfo = evaluateDelta(current, previousValue, { positiveIsBad: true });
            if (deltaPrevInfo.delta !== null) {
                const deltaPrevText = Math.abs(deltaPrevInfo.delta) < 0.0001
                    ? "Sem variação"
                    : formatPercent(Math.abs(deltaPrevInfo.delta));
                entries.push(
                    createTooltipEntry("Δ vs anterior", deltaPrevText, {
                        arrow: deltaPrevInfo.arrow,
                        arrowTone: deltaPrevInfo.tone,
                        icon: "delta",
                        muted: deltaPrevInfo.delta === 0,
                    })
                );
            }
        }

        if (typeof metaValue === "number") {
            entries.push(
                createTooltipEntry("Meta", formatPercent(metaValue), {
                    icon: "target",
                })
            );

            const deltaInfo = evaluateDelta(current, metaValue);
            if (deltaInfo.delta !== null) {
                const deltaText = formatPercent(Math.abs(deltaInfo.delta));
                entries.push(
                    createTooltipEntry("Δ vs meta", deltaInfo.delta === 0 ? "Alinhado" : deltaText, {
                        arrow: deltaInfo.arrow,
                        arrowTone: deltaInfo.tone,
                        icon: "delta",
                        muted: deltaInfo.delta === 0,
                    })
                );
            }
        }

        return entries;
    };

    const getEntriesForMeta = (index) => {
        const entries = [];
        const metaValue = sanitizedMeta[index];
        const current = sanitizedBars[index];
        const totalValue = sanitizedValorTotal[index];
        const cortePedidoValue = sanitizedCortePedido[index];
        const faturamentoValue = sanitizedFaturamento[index];

        entries.push(
            createTooltipEntry("Meta", formatPercent(metaValue ?? 0), {
                emphasize: true,
                icon: "target",
            })
        );

        if (typeof current === "number") {
            entries.push(
                createTooltipEntry("Percentual", formatPercent(current), {
                    icon: "percent",
                    valueTone: barTones[index] || "neutral",
                })
            );

            const deltaInfo = evaluateDelta(current, metaValue);
            if (deltaInfo.delta !== null) {
                const deltaText = formatPercent(Math.abs(deltaInfo.delta));
                entries.push(
                    createTooltipEntry("Δ vs meta", deltaInfo.delta === 0 ? "Alinhado" : deltaText, {
                        arrow: deltaInfo.arrow,
                        arrowTone: deltaInfo.tone,
                        icon: "delta",
                        muted: deltaInfo.delta === 0,
                    })
                );
            }
        }

        if (typeof totalValue === "number") {
            entries.push(
                createTooltipEntry("Corte de Pedido", currencyFormatter.format(totalValue), {
                    icon: "sum",
                    muted: true,
                })
            );
        }

        if (typeof cortePedidoValue === "number") {
            entries.push(
                createTooltipEntry("Corte/pedido", formatPercent(cortePedidoValue), {
                    icon: "percent",
                    muted: true,
                })
            );
        }

        if (typeof faturamentoValue === "number") {
            entries.push(
                createTooltipEntry("Faturamento", currencyFormatter.format(faturamentoValue), {
                    icon: "value",
                    muted: true,
                })
            );
        }

        return entries;
    };

    const tooltipHelpers = {
        getEntriesForBar,
        getEntriesForLine: getEntriesForMeta,
        toneClassMap,
        icons: tooltipIcons,
    };

    const corteValueLabels = {
        id: "corteValueLabels",
        afterDatasetsDraw(chart) {
            const meta = chart.getDatasetMeta(0);
            if (!meta) {
                return;
            }

            const { ctx } = chart;
            ctx.save();
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";

            const placedBoxes = [];
            const labelHeight = 16;
            const labelMargin = 6;

            const adjustVerticalPosition = (centerX, width, startY) => {
                let adjustedY = startY;
                let top = adjustedY - labelHeight;
                let bottom = adjustedY;

                const overlaps = (box) => {
                    const horizontalOverlap = centerX - width / 2 < box.right && centerX + width / 2 > box.left;
                    const verticalOverlap = top < box.bottom + labelMargin && bottom > box.top - labelMargin;
                    return horizontalOverlap && verticalOverlap;
                };

                while (placedBoxes.some(overlaps)) {
                    adjustedY -= labelHeight + labelMargin;
                    top = adjustedY - labelHeight;
                    bottom = adjustedY;
                }

                placedBoxes.push({
                    left: centerX - width / 2,
                    right: centerX + width / 2,
                    top,
                    bottom,
                });

                return adjustedY;
            };

            meta.data.forEach((barElement, index) => {
                const barValue = sanitizedBars[index];
                if (!barElement || typeof barValue !== "number") {
                    return;
                }

                const { x, y } = barElement.tooltipPosition();
                const valueText = formatPercent(barValue);
                const previousValue =
                    index > 0 && typeof sanitizedBars[index - 1] === "number" ? sanitizedBars[index - 1] : null;
                const deltaInfo = evaluateDelta(barValue, previousValue, { positiveIsBad: true });
                const arrow = previousValue !== null ? deltaInfo.arrow : "";
                const arrowColor = deltaToneColors[deltaInfo.tone] || colors.barLabelNeutral;
                const valueColor = colors.textMain;

                const originalAlign = ctx.textAlign;
                const originalFont = ctx.font;

                ctx.textAlign = "left";
                ctx.font = "600 13px Segoe UI, Tahoma";
                const valueWidth = ctx.measureText(valueText).width;

                let arrowWidth = 0;
                let spaceWidth = 0;
                if (arrow) {
                    ctx.font = "700 13px Segoe UI, Tahoma";
                    arrowWidth = ctx.measureText(arrow).width;
                    spaceWidth = ctx.measureText(" ").width;
                }

                ctx.font = "600 13px Segoe UI, Tahoma";
                const totalWidth = arrowWidth + spaceWidth + valueWidth;
                const baseX = x - totalWidth / 2;
                const adjustedY = adjustVerticalPosition(x, totalWidth, y - 12);

                if (arrow) {
                    ctx.font = "700 13px Segoe UI, Tahoma";
                    ctx.fillStyle = arrowColor;
                    ctx.fillText(arrow, baseX, adjustedY);
                }

                ctx.font = "600 13px Segoe UI, Tahoma";
                ctx.fillStyle = valueColor;
                const valueX = arrow ? baseX + arrowWidth + spaceWidth : baseX;
                ctx.fillText(valueText, valueX, adjustedY);

                ctx.textAlign = originalAlign;
                ctx.font = originalFont;
            });

            ctx.restore();
        },
    };

    const corteMetaValueLabels = {
        id: "corteMetaValueLabels",
        afterDatasetsDraw(chart) {
            const datasetIndex = chart.data.datasets.findIndex((dataset) => dataset.label === "Meta" && dataset.type === "line");
            if (datasetIndex === -1) {
                return;
            }

            const meta = chart.getDatasetMeta(datasetIndex);
            if (!meta || meta.hidden) {
                return;
            }

            const { ctx } = chart;
            ctx.save();
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.font = "600 12px Segoe UI, Tahoma";
            ctx.fillStyle = "#ffffff";
            ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
            ctx.shadowBlur = 6;

            meta.data.forEach((pointElement, index) => {
                const value = sanitizedMeta[index];
                if (!pointElement || typeof value !== "number") {
                    return;
                }

                const { x, y } = pointElement.tooltipPosition();
                const label = formatPercent(value);
                ctx.fillText(label, x, y - 18);
            });

            ctx.restore();
        },
    };

    corteChartInstance = new Chart(canvasElement, {
        type: "bar",
        data: {
            labels: sanitizedLabels,
            datasets: [
                {
                    label: "% de corte",
                    data: sanitizedBars,
                    backgroundColor: barColors,
                    hoverBackgroundColor: barColors,
                    borderColor: barBorderColors,
                    borderWidth: 1,
                    borderRadius: 4,
                    borderSkipped: false,
                    categoryPercentage: 0.62,
                    barPercentage: 0.74,
                    barThickness: 60,
                    order: 3,
                },
                {
                    type: "line",
                    label: "Meta",
                    data: sanitizedMeta,
                    borderColor: colors.lineBase,
                    borderWidth: 2,
                    tension: 0,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: colors.pointCore,
                    pointBorderColor: colors.lineBase,
                    pointHoverBackgroundColor: colors.pointCore,
                    pointHoverBorderColor: colors.lineBase,
                    pointBorderWidth: 2,
                    fill: false,
                    spanGaps: true,
                    clip: false,
                    yAxisID: "y",
                    order: 2,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    enabled: false,
                    external: (context) => externalTooltipHandler(context, tooltipHelpers),
                },
            },
            scales: {
                x: {
                    title: {
                        display: false,
                    },
                    grid: {
                        display: false,
                    },
                    border: {
                        display: false,
                    },
                    ticks: {
                        color: "#000000",
                        maxRotation: 0,
                        minRotation: 0,
                    },
                },
                y: {
                    min: 0,
                    suggestedMax: axisMax,
                    title: {
                        display: false,
                    },
                    ticks: {
                        color: colors.axis,
                        callback: (value) => percentageFormatter.format(value / 100),
                    },
                    grid: {
                        color: colors.grid,
                        drawBorder: false,
                    },
                    border: {
                        display: false,
                    },
                },
            },
        },
        plugins: [corteValueLabels, corteMetaValueLabels],
    });

    const faturamentoPanel = document.querySelector('[data-slide-id="faturamento"]');
    if (faturamentoPanel && faturamentoPanel.classList.contains("is-active")) {
        requestAnimationFrame(() => {
            corteChartInstance.resize();
        });
    }
}

function populateMotivosTable(payload) {
    if (!motivosTableBody) {
        return;
    }

    const normalizedRows = Array.isArray(payload)
        ? payload
        : normalizeMotivosRows(payload?.rows);

    if (!normalizedRows.length) {
        motivosTableBody.innerHTML = '<tr class="motivos-table__empty"><td colspan="2">Sem dados disponíveis</td></tr>';
        return;
    }

    motivosTableBody.innerHTML = "";
    normalizedRows.forEach((entry, index) => {
        const tableRow = document.createElement("tr");
        tableRow.className = "motivos-table__row";

        const motivoCell = document.createElement("td");
        motivoCell.className = "motivos-table__motivo";
        const icon = createMotivoIcon(index);
        const motivoText = document.createElement("span");
        motivoText.className = "motivos-table__motivo-text";
        motivoText.textContent = entry.motivo || "Sem motivo";
        motivoCell.appendChild(icon);
        motivoCell.appendChild(motivoText);

        const valorCell = document.createElement("td");
        valorCell.className = "motivos-table__valor";
        if (typeof entry.value === "number") {
            valorCell.textContent = currencyFormatter.format(entry.value);
        } else if (entry.rawValue !== null && entry.rawValue !== undefined && entry.rawValue !== "") {
            valorCell.textContent = String(entry.rawValue);
        } else {
            valorCell.textContent = "—";
        }

        tableRow.appendChild(motivoCell);
        tableRow.appendChild(valorCell);
        motivosTableBody.appendChild(tableRow);
    });
}

function collectMetricElements() {
    const buildEntry = (id) => {
        const card = document.querySelector(`[data-metric="${id}"]`);
        if (!card) {
            return null;
        }
        return {
            card,
            value: card.querySelector(".metric-card__value"),
            context: card.querySelector(".metric-card__context"),
        };
    };

    return {
        "largest-positive": buildEntry("largest-positive"),
        "largest-negative": buildEntry("largest-negative"),
        trend: buildEntry("trend"),
        acumulativo: buildEntry("acumulativo"),
        latest: buildEntry("latest"),
    };
}

function collectCorteMetricElements() {
    const mapping = [
        ["highest", "highest"],
        ["lowest", "lowest"],
        ["meta-hit", "metaHit"],
        ["meta-gap", "metaGap"],
        ["top-motivo", "topMotivo"],
    ];

    return mapping.reduce((accumulator, [selector, key]) => {
        const card = document.querySelector(`[data-corte-metric="${selector}"]`);
        if (!card) {
            accumulator[key] = null;
            return accumulator;
        }

        accumulator[key] = {
            card,
            value: card.querySelector(".metric-card__value"),
            context: card.querySelector(".metric-card__context"),
        };

        return accumulator;
    }, {});
}

function collectInventarioMetricElements() {
    const mapping = [
        ["highest-coverage", "highestCoverage"],
        ["lowest-coverage", "lowestCoverage"],
        ["average-coverage", "averageCoverage"],
        ["weeks-on-target", "weeksOnTarget"],
        ["divergence-index", "divergenceIndex"],
    ];

    return mapping.reduce((accumulator, [selector, key]) => {
        const card = document.querySelector(`[data-inventario-metric="${selector}"]`);
        if (!card) {
            accumulator[key] = null;
            return accumulator;
        }

        accumulator[key] = {
            card,
            value: card.querySelector(".metric-card__value"),
            context: card.querySelector(".metric-card__context"),
        };

        return accumulator;
    }, {});
}

function renderMetrics(metrics) {
    if (!metricsDOM) {
        return;
    }

    const safeMetrics = metrics || {};

    updateMetricCard(metricsDOM["largest-positive"], safeMetrics.largest_positive, {
        defaultTone: "bad",
        getArrow: (data) => (data ? { char: "↑", tone: "bad" } : null),
        formatValue: (data) => percentageFormatter.format((data.percent || 0) / 100),
        formatContext: (data) => data.label || "Sem referência",
        emptyContext: "Sem variação positiva",
    });

    updateMetricCard(metricsDOM["largest-negative"], safeMetrics.largest_negative, {
        defaultTone: "good",
        getArrow: (data) => (data ? { char: "↓", tone: "good" } : null),
        formatValue: (data) => percentageFormatter.format(Math.abs(data.percent || 0) / 100),
        formatContext: (data) => data.label || "Sem referência",
        emptyContext: "Sem variação negativa",
    });

    updateMetricCard(metricsDOM.trend, safeMetrics.trend, {
        defaultTone: "trend",
        getArrow: (data) => {
            if (!data || !data.direction) {
                return null;
            }
            if (data.direction.toLowerCase() === "alta") {
                return { char: "↑", tone: "bad" };
            }
            if (data.direction.toLowerCase() === "queda") {
                return { char: "↓", tone: "good" };
            }
            return { char: "→", tone: "neutral" };
        },
        formatValue: (data) => data.direction || "Estável",
        formatContext: (data) => {
            if (!data) {
                return "Sem dados";
            }
            const deltaAbs = Math.abs(data.delta || 0);
            const deltaText = currencyFormatter.format(deltaAbs);
            if (!data.start_label || !data.end_label) {
                return `Δ ${deltaText}`;
            }
            return `Δ ${deltaText} (${data.start_label} → ${data.end_label})`;
        },
    });

    updateMetricCard(metricsDOM.acumulativo, safeMetrics.acumulativo_sum, {
        defaultTone: "neutral",
        formatValue: (total) => currencyFormatter.format(total || 0),
        formatContext: () => "Somatório do período",
        emptyContext: "Sem dados acumulados",
    });

    updateBloqueadoLatestMetric();
}

function updateBloqueadoLatestMetric() {
    if (!metricsDOM || !metricsDOM.latest) {
        return;
    }

    const dataset = bloqueadoDatasetCache;
    const bars = Array.isArray(dataset?.bars) ? dataset.bars : [];
    const labels = Array.isArray(dataset?.labels) ? dataset.labels : [];

    let latestIndex = -1;
    for (let index = bars.length - 1; index >= 0; index -= 1) {
        const value = bars[index];
        if (typeof value === "number" && Number.isFinite(value)) {
            latestIndex = index;
            break;
        }
    }

    if (latestIndex === -1) {
        updateMetricCard(metricsDOM.latest, null, {
            emptyContext: "Sem histórico recente",
        });
        return;
    }

    const currentValue = bars[latestIndex];
    const currentLabel = labels[latestIndex] !== undefined && labels[latestIndex] !== null
        ? String(labels[latestIndex])
        : "";

    let previousIndex = -1;
    let previousValue = null;
    for (let index = latestIndex - 1; index >= 0; index -= 1) {
        const candidate = bars[index];
        if (typeof candidate === "number" && Number.isFinite(candidate)) {
            previousIndex = index;
            previousValue = candidate;
            break;
        }
    }

    const entry = {
        value: currentValue,
        label: currentLabel,
        previousValue,
        previousLabel:
            previousIndex !== -1 && labels[previousIndex] !== undefined && labels[previousIndex] !== null
                ? String(labels[previousIndex])
                : "",
        delta: previousValue !== null ? currentValue - previousValue : null,
    };

    updateMetricCard(metricsDOM.latest, entry, {
        defaultTone: "neutral",
        getArrow: (data) => {
            if (data.delta === null || Number.isNaN(data.delta)) {
                return null;
            }
            if (Math.abs(data.delta) <= 0.001) {
                return { char: "→", tone: "neutral" };
            }
            return data.delta > 0 ? { char: "↑", tone: "bad" } : { char: "↓", tone: "good" };
        },
        formatValue: (data) => currencyFormatter.format(data.value || 0),
        formatContext: (data) => {
            const label = data.label || "Último período";
            if (data.delta === null || Number.isNaN(data.delta) || data.previousValue === null) {
                return label;
            }
            const relation = data.delta > 0 ? "acima" : "abaixo";
            const deltaText = currencyFormatter.format(Math.abs(data.delta));
            if (data.previousLabel) {
                return `${label} · ${relation} ${deltaText} vs ${data.previousLabel}`;
            }
            return `${label} · ${relation} ${deltaText}`;
        },
        emptyContext: "Sem histórico recente",
    });
}

function updateMetricCard(group, data, options = {}) {
    if (!group || !group.value || !group.context) {
        return;
    }

    const {
        defaultTone = "neutral",
        getArrow,
        formatValue,
        formatContext,
        emptyValue = "—",
        emptyContext = "Sem dados",
    } = options;

    let tone = "empty";
    let arrowMarkup = "";
    let valueText = emptyValue;
    let contextText = emptyContext;

    if (data !== undefined && data !== null) {
        tone = defaultTone;
        if (typeof formatValue === "function") {
            valueText = formatValue(data);
        } else {
            valueText = String(data);
        }

        if (typeof formatContext === "function") {
            contextText = formatContext(data);
        } else if (typeof formatContext === "string") {
            contextText = formatContext;
        }

        if (typeof getArrow === "function") {
            const arrowInfo = getArrow(data);
            if (arrowInfo && arrowInfo.char) {
                tone = arrowInfo.tone || tone;
                arrowMarkup = `<span class="metric-card__arrow metric-card__arrow--${arrowInfo.tone || tone}">${arrowInfo.char}</span>`;
            }
        }
    }

    group.card.dataset.tone = tone;
    group.value.innerHTML = `${arrowMarkup}<span class="metric-card__value-text">${valueText}</span>`;
    group.context.textContent = contextText;
}

function clearMetrics() {
    if (!metricsDOM) {
        return;
    }

    Object.values(metricsDOM).forEach((entry) => {
        if (!entry || !entry.value || !entry.context) {
            return;
        }
        entry.card.dataset.tone = "empty";
        entry.value.innerHTML = '<span class="metric-card__value-text">&mdash;</span>';
        entry.context.textContent = "Sem dados";
    });
}

function clearCorteMetrics() {
    if (!corteMetricsDOM) {
        return;
    }

    Object.values(corteMetricsDOM).forEach((entry) => {
        if (!entry || !entry.value || !entry.context) {
            return;
        }
        entry.card.dataset.tone = "empty";
        entry.value.innerHTML = '<span class="metric-card__value-text">&mdash;</span>';
        entry.context.textContent = "Sem dados";
    });
}

function clearInventarioMetrics() {
    if (!inventarioMetricsDOM) {
        inventarioMetricsDOM = collectInventarioMetricElements();
    }

    if (!inventarioMetricsDOM) {
        return;
    }

    Object.values(inventarioMetricsDOM).forEach((entry) => {
        if (!entry || !entry.value || !entry.context) {
            return;
        }
        entry.card.dataset.tone = "empty";
        entry.value.innerHTML = '<span class="metric-card__value-text">&mdash;</span>';
        entry.context.textContent = "Sem dados";
    });
}

function findInventarioExtremum(dataset, mode) {
    if (!dataset) {
        return null;
    }

    const values = Array.isArray(dataset.realizado) ? dataset.realizado : [];
    const labels = Array.isArray(dataset.labels) ? dataset.labels : [];
    const metas = Array.isArray(dataset.meta) ? dataset.meta : [];

    let bestIndex = -1;
    let bestValue = mode === "min" ? Infinity : -Infinity;

    values.forEach((value, index) => {
        if (typeof value !== "number" || !Number.isFinite(value)) {
            return;
        }

        if (mode === "min") {
            if (value < bestValue) {
                bestValue = value;
                bestIndex = index;
            }
        } else if (value > bestValue) {
            bestValue = value;
            bestIndex = index;
        }
    });

    if (bestIndex === -1) {
        return null;
    }

    const metaValue = metas[bestIndex];

    return {
        label: labels[bestIndex] !== undefined && labels[bestIndex] !== null ? String(labels[bestIndex]) : "",
        value: bestValue,
        meta: typeof metaValue === "number" && Number.isFinite(metaValue) ? metaValue : null,
    };
}

function computeInventarioAverage(dataset) {
    if (!dataset) {
        return null;
    }

    const values = Array.isArray(dataset.realizado) ? dataset.realizado.filter((value) => Number.isFinite(value)) : [];
    if (!values.length) {
        return null;
    }

    const metas = Array.isArray(dataset.meta) ? dataset.meta.filter((value) => Number.isFinite(value)) : [];
    const total = values.reduce((sum, current) => sum + current, 0);
    const metaAverage = metas.length ? metas.reduce((sum, current) => sum + current, 0) / metas.length : null;

    return {
        average: total / values.length,
        count: values.length,
        metaAverage,
    };
}

function computeInventarioWeeksOnTarget(dataset) {
    if (!dataset) {
        return null;
    }

    const valores = Array.isArray(dataset.realizado) ? dataset.realizado : [];
    const metas = Array.isArray(dataset.meta) ? dataset.meta : [];

    let total = 0;
    let hits = 0;

    valores.forEach((valor, index) => {
        const metaValue = metas[index];
        if (!Number.isFinite(valor) || !Number.isFinite(metaValue)) {
            return;
        }
        total += 1;
        if (valor >= metaValue - 0.0001) {
            hits += 1;
        }
    });

    if (total === 0) {
        return null;
    }

    return {
        hits,
        total,
        share: hits / total,
    };
}

function computeInventarioDivergence(dataset) {
    if (!dataset) {
        return null;
    }

    const valores = Array.isArray(dataset.realizado) ? dataset.realizado : [];
    const metas = Array.isArray(dataset.meta) ? dataset.meta : [];
    const labels = Array.isArray(dataset.labels) ? dataset.labels : [];

    let total = 0;
    let sumDiff = 0;
    let worstDiff = -Infinity;
    let worstLabel = "";

    valores.forEach((valor, index) => {
        const metaValue = metas[index];
        if (!Number.isFinite(valor) || !Number.isFinite(metaValue)) {
            return;
        }

        const diff = Math.abs(valor - metaValue);
        sumDiff += diff;
        total += 1;

        if (diff > worstDiff) {
            worstDiff = diff;
            worstLabel = labels[index] !== undefined && labels[index] !== null ? String(labels[index]) : "";
        }
    });

    if (total === 0) {
        return null;
    }

    return {
        averageDiff: sumDiff / total,
        worstDiff,
        worstLabel,
    };
}

function updateInventarioMetrics() {
    if (!inventarioMetricsDOM) {
        inventarioMetricsDOM = collectInventarioMetricElements();
    }

    if (!inventarioMetricsDOM) {
        return;
    }

    const dataset = inventarioDatasetCache;
    const realizedValues = Array.isArray(dataset?.realizado)
        ? dataset.realizado.filter((value) => Number.isFinite(value))
        : [];
    const hasRealized = realizedValues.length > 0;
    const hasMeta = Array.isArray(dataset?.meta) && dataset.meta.some((value) => Number.isFinite(value));

    if (inventarioMetricsDOM.highestCoverage) {
        const highest = hasRealized ? findInventarioExtremum(dataset, "max") : null;
        const defaultTone = highest && typeof highest.meta === "number"
            ? highest.value >= highest.meta
                ? "good"
                : "bad"
            : "good";

        updateMetricCard(inventarioMetricsDOM.highestCoverage, highest, {
            defaultTone,
            getArrow: (entry) => {
                if (typeof entry.meta === "number") {
                    const delta = entry.value - entry.meta;
                    if (Math.abs(delta) <= 0.001) {
                        return { char: "→", tone: "neutral" };
                    }
                    return delta > 0 ? { char: "↑", tone: "good" } : { char: "↓", tone: "bad" };
                }
                return { char: "↑", tone: "good" };
            },
            formatValue: (entry) => percentageFormatter.format((entry.value || 0) / 100),
            formatContext: (entry) => {
                const label = entry.label || "Sem rótulo";
                if (typeof entry.meta === "number") {
                    const delta = entry.value - entry.meta;
                    const relation = delta >= 0 ? "acima" : "abaixo";
                    const deltaText = percentageFormatter.format(Math.abs(delta) / 100);
                    return `${label} · ${relation} da meta (${deltaText})`;
                }
                return label;
            },
            emptyContext: "Sem cobertura registrada",
        });
    }

    if (inventarioMetricsDOM.lowestCoverage) {
        const lowest = hasRealized ? findInventarioExtremum(dataset, "min") : null;
        const defaultTone = lowest && typeof lowest.meta === "number"
            ? lowest.value >= lowest.meta
                ? "neutral"
                : "bad"
            : "bad";

        updateMetricCard(inventarioMetricsDOM.lowestCoverage, lowest, {
            defaultTone,
            getArrow: (entry) => {
                if (typeof entry.meta === "number") {
                    const delta = entry.value - entry.meta;
                    if (Math.abs(delta) <= 0.001) {
                        return { char: "→", tone: "neutral" };
                    }
                    return delta > 0 ? { char: "↑", tone: "neutral" } : { char: "↓", tone: "bad" };
                }
                return { char: "↓", tone: "bad" };
            },
            formatValue: (entry) => percentageFormatter.format((entry.value || 0) / 100),
            formatContext: (entry) => {
                const label = entry.label || "Sem rótulo";
                if (typeof entry.meta === "number") {
                    const delta = entry.value - entry.meta;
                    const relation = delta >= 0 ? "acima" : "abaixo";
                    const deltaText = percentageFormatter.format(Math.abs(delta) / 100);
                    return `${label} · ${relation} da meta (${deltaText})`;
                }
                return label;
            },
            emptyContext: "Sem cobertura registrada",
        });
    }

    if (inventarioMetricsDOM.averageCoverage) {
        const averageInfo = hasRealized ? computeInventarioAverage(dataset) : null;
        const averageTone = averageInfo
            ? typeof averageInfo.metaAverage === "number"
                ? averageInfo.average >= averageInfo.metaAverage
                    ? "good"
                    : "bad"
                : "neutral"
            : "neutral";

        updateMetricCard(inventarioMetricsDOM.averageCoverage, averageInfo, {
            defaultTone: averageTone,
            getArrow: (info) => {
                if (!info || typeof info.metaAverage !== "number") {
                    return null;
                }
                const delta = info.average - info.metaAverage;
                if (Math.abs(delta) <= 0.001) {
                    return { char: "→", tone: "neutral" };
                }
                return delta > 0 ? { char: "↑", tone: "good" } : { char: "↓", tone: "bad" };
            },
            formatValue: (info) => percentageFormatter.format((info?.average || 0) / 100),
            formatContext: (info) => {
                if (!info) {
                    return "Sem dados";
                }
                if (typeof info.metaAverage === "number") {
                    const delta = info.average - info.metaAverage;
                    const deltaText = percentageFormatter.format(Math.abs(delta) / 100);
                    const relation = delta >= 0 ? "acima" : "abaixo";
                    return `Meta média ${percentageFormatter.format(info.metaAverage / 100)} · ${relation} ${deltaText}`;
                }
                return `${info.count} semanas analisadas`;
            },
            emptyContext: "Sem cobertura consolidada",
        });
    }

    if (inventarioMetricsDOM.weeksOnTarget) {
        const weeksInfo = hasRealized && hasMeta ? computeInventarioWeeksOnTarget(dataset) : null;
        const targetTone = weeksInfo
            ? weeksInfo.share >= 0.7
                ? "good"
                : weeksInfo.share >= 0.5
                    ? "neutral"
                    : "bad"
            : "neutral";

        updateMetricCard(inventarioMetricsDOM.weeksOnTarget, weeksInfo, {
            defaultTone: targetTone,
            formatValue: (info) => `${info.hits} / ${info.total}`,
            formatContext: (info) => `Cobertura ≥ meta em ${percentageFormatter.format(info.share)}`,
            emptyContext: hasMeta ? "Sem semanas avaliadas" : "Sem metas registradas",
        });
    }

    if (inventarioMetricsDOM.divergenceIndex) {
        const divergenceInfo = hasRealized && hasMeta ? computeInventarioDivergence(dataset) : null;
        const divergenceTone = divergenceInfo
            ? divergenceInfo.averageDiff <= 5
                ? "good"
                : divergenceInfo.averageDiff <= 10
                    ? "neutral"
                    : "bad"
            : hasMeta
                ? "neutral"
                : "neutral";

        updateMetricCard(inventarioMetricsDOM.divergenceIndex, divergenceInfo, {
            defaultTone: divergenceTone,
            formatValue: (info) => percentageFormatter.format((info.averageDiff || 0) / 100),
            formatContext: (info) => {
                if (!info) {
                    return hasMeta ? "Sem divergências" : "Sem metas";
                }
                const worstLabel = info.worstLabel || "Sem rótulo";
                const worstGap = percentageFormatter.format((info.worstDiff || 0) / 100);
                return `Maior gap: ${worstLabel} (${worstGap})`;
            },
            emptyContext: hasMeta ? "Sem divergências calculadas" : "Sem metas registradas",
        });
    }
}

function findCorteExtremum(dataset, mode) {
    if (!dataset) {
        return null;
    }

    const values = Array.isArray(dataset.percentages) ? dataset.percentages : [];
    const labels = Array.isArray(dataset.labels) ? dataset.labels : [];
    const metas = Array.isArray(dataset.meta) ? dataset.meta : [];

    let bestIndex = -1;
    let bestValue = mode === "min" ? Infinity : -Infinity;

    values.forEach((value, index) => {
        if (typeof value !== "number" || !Number.isFinite(value)) {
            return;
        }

        if (mode === "min") {
            if (value < bestValue) {
                bestValue = value;
                bestIndex = index;
            }
        } else if (value > bestValue) {
            bestValue = value;
            bestIndex = index;
        }
    });

    if (bestIndex === -1) {
        return null;
    }

    return {
        label: labels[bestIndex] !== undefined && labels[bestIndex] !== null ? String(labels[bestIndex]) : "",
        value: values[bestIndex],
        meta: typeof metas[bestIndex] === "number" && Number.isFinite(metas[bestIndex]) ? metas[bestIndex] : null,
    };
}

function computeMetaHitInfo(dataset) {
    if (!dataset) {
        return null;
    }

    const percentages = Array.isArray(dataset.percentages) ? dataset.percentages : [];
    const metas = Array.isArray(dataset.meta) ? dataset.meta : [];

    let total = 0;
    let hits = 0;

    metas.forEach((metaValue, index) => {
        const percentValue = percentages[index];
        if (
            typeof metaValue === "number" &&
            Number.isFinite(metaValue) &&
            typeof percentValue === "number" &&
            Number.isFinite(percentValue)
        ) {
            total += 1;
            if (percentValue <= metaValue + 0.0001) {
                hits += 1;
            }
        }
    });

    if (total === 0) {
        return null;
    }

    return {
        hits,
        total,
        share: hits / total,
    };
}

function computeMetaGapInfo(dataset) {
    if (!dataset) {
        return null;
    }

    const percentages = Array.isArray(dataset.percentages) ? dataset.percentages : [];
    const metas = Array.isArray(dataset.meta) ? dataset.meta : [];
    const labels = Array.isArray(dataset.labels) ? dataset.labels : [];

    let total = 0;
    let excessSum = 0;
    let excessCount = 0;
    let worstLabel = "";
    let worstExcess = -Infinity;

    metas.forEach((metaValue, index) => {
        const percentValue = percentages[index];
        if (
            typeof metaValue === "number" &&
            Number.isFinite(metaValue) &&
            typeof percentValue === "number" &&
            Number.isFinite(percentValue)
        ) {
            total += 1;
            const excess = percentValue - metaValue;
            if (excess > 0.0001) {
                excessSum += excess;
                excessCount += 1;
                if (excess > worstExcess) {
                    worstExcess = excess;
                    worstLabel = labels[index] !== undefined && labels[index] !== null ? String(labels[index]) : "";
                }
            }
        }
    });

    if (total === 0) {
        return null;
    }

    const averageExcess = excessCount > 0 ? excessSum / excessCount : 0;

    return {
        averageExcess,
        aboveCount: excessCount,
        total,
        worstLabel,
        worstExcess: excessCount > 0 ? worstExcess : 0,
    };
}

function extractTopMotivo(summary) {
    if (!Array.isArray(summary) || !summary.length) {
        return null;
    }

    const topEntry = summary.find((entry) => entry && (typeof entry.value === "number" || entry.rawValue || entry.motivo));
    if (!topEntry) {
        return null;
    }

    return {
        motivo: topEntry.motivo || "",
        value: typeof topEntry.value === "number" && Number.isFinite(topEntry.value) ? topEntry.value : null,
        rawValue: topEntry.rawValue !== undefined ? topEntry.rawValue : null,
    };
}

function createMotivoIcon(rank) {
    const iconWrapper = document.createElement("span");
    iconWrapper.className = "motivos-table__icon";
    iconWrapper.setAttribute("aria-hidden", "true");

    if (rank === 0) {
        iconWrapper.dataset.tone = "gold";
    } else if (rank === 1) {
        iconWrapper.dataset.tone = "silver";
    } else if (rank === 2) {
        iconWrapper.dataset.tone = "bronze";
    }

    iconWrapper.innerHTML =
        '<svg viewBox="0 0 24 24" role="presentation" focusable="false" fill="currentColor"><path d="M12 2a1 1 0 0 1 .92.6l1.52 3.46 3.74.34a1 1 0 0 1 .56 1.74l-2.84 2.5.84 3.66a1 1 0 0 1-1.47 1.1L12 13.93l-3.27 1.47a1 1 0 0 1-1.47-1.1l.84-3.66-2.84-2.5a1 1 0 0 1 .56-1.74l3.74-.34L11.08 2.6A1 1 0 0 1 12 2Z"></path></svg>';

    return iconWrapper;
}

function updateCorteMetrics() {
    if (!corteMetricsDOM) {
        return;
    }

    const datasetReady =
        corteDatasetCache &&
        Array.isArray(corteDatasetCache.percentages) &&
        corteDatasetCache.percentages.length &&
        Array.isArray(corteDatasetCache.labels) &&
        corteDatasetCache.labels.length;

    const motivesReady = Array.isArray(corteMotivosSummary) && corteMotivosSummary.length;

    if (corteMetricsDOM.highest) {
        const highest = datasetReady ? findCorteExtremum(corteDatasetCache, "max") : null;
        updateMetricCard(corteMetricsDOM.highest, highest, {
            defaultTone: "neutral",
            emptyContext: "Sem dados de corte",
            formatValue: (entry) => percentageFormatter.format((entry.value || 0) / 100),
            formatContext: (entry) => {
                const label = entry.label ? String(entry.label) : "Sem rótulo";
                if (typeof entry.meta === "number") {
                    return `${label} · Meta ${percentageFormatter.format(entry.meta / 100)}`;
                }
                return label;
            },
        });
    }

    if (corteMetricsDOM.lowest) {
        const lowest = datasetReady ? findCorteExtremum(corteDatasetCache, "min") : null;
        updateMetricCard(corteMetricsDOM.lowest, lowest, {
            defaultTone: "neutral",
            emptyContext: "Sem dados de corte",
            formatValue: (entry) => percentageFormatter.format((entry.value || 0) / 100),
            formatContext: (entry) => {
                const label = entry.label ? String(entry.label) : "Sem rótulo";
                if (typeof entry.meta === "number") {
                    const delta = entry.meta - entry.value;
                    const deltaText = percentageFormatter.format(Math.abs(delta || 0) / 100);
                    const relation = delta > 0 ? "abaixo" : delta < 0 ? "acima" : "igual";
                    return `${label} · ${relation} da meta (${deltaText})`;
                }
                return label;
            },
        });
    }

    if (corteMetricsDOM.metaHit) {
        const metaHitInfo = datasetReady ? computeMetaHitInfo(corteDatasetCache) : null;
        updateMetricCard(corteMetricsDOM.metaHit, metaHitInfo, {
            defaultTone: "neutral",
            emptyContext: "Sem metas registradas",
            formatValue: (info) => `${info.hits} / ${info.total}`,
            formatContext: (info) => {
                const percentage = percentageFormatter.format(info.share || 0);
                return `Meses ≤ meta (${percentage})`;
            },
        });
    }

    if (corteMetricsDOM.metaGap) {
        const metaGapInfo = datasetReady ? computeMetaGapInfo(corteDatasetCache) : null;
        updateMetricCard(corteMetricsDOM.metaGap, metaGapInfo, {
            defaultTone: "neutral",
            emptyContext: "Sem metas registradas",
            formatValue: (info) => percentageFormatter.format((info.averageExcess || 0) / 100),
            formatContext: (info) => {
                if (info.aboveCount === 0) {
                    return "Todos os meses ≤ meta";
                }
                const worstLabel = info.worstLabel || "Sem rótulo";
                const worstGapText = percentageFormatter.format((info.worstExcess || 0) / 100);
                return `${info.aboveCount} meses acima · Pior ${worstLabel} (${worstGapText})`;
            },
        });
    }

    if (corteMetricsDOM.topMotivo) {
        const topMotivo = motivesReady ? extractTopMotivo(corteMotivosSummary) : null;
        updateMetricCard(corteMetricsDOM.topMotivo, topMotivo, {
            defaultTone: "neutral",
            emptyContext: "Sem dados de motivos",
            formatValue: (entry) => {
                if (typeof entry.value === "number") {
                    return currencyFormatter.format(entry.value);
                }
                if (entry.rawValue !== null && entry.rawValue !== undefined && entry.rawValue !== "") {
                    return String(entry.rawValue);
                }
                return "—";
            },
            formatContext: (entry) => entry.motivo || "Sem descrição",
        });
    }
}

function removeExistingTooltip(canvasElement) {
    if (!canvasElement || !canvasElement.parentNode) {
        return;
    }
    const existing = canvasElement.parentNode.querySelector(".chart-tooltip");
    if (existing) {
        existing.remove();
    }
}

function ensureTooltipElement(parent) {
    let tooltipEl = parent.querySelector(".chart-tooltip");
    if (!tooltipEl) {
        tooltipEl = document.createElement("div");
        tooltipEl.className = "chart-tooltip";
        tooltipEl.innerHTML = '<div class="chart-tooltip__title"></div><div class="chart-tooltip__list"></div>';
        parent.appendChild(tooltipEl);
    }
    return tooltipEl;
}

function externalTooltipHandler(context, helpers) {
    const { chart, tooltip } = context;
    const parent = chart.canvas.parentNode;
    if (!parent) {
        return;
    }

    const tooltipEl = ensureTooltipElement(parent);

    if (tooltip.opacity === 0) {
        tooltipEl.style.opacity = 0;
        return;
    }

    const dataPoint = tooltip.dataPoints && tooltip.dataPoints[0];
    if (!dataPoint) {
        tooltipEl.style.opacity = 0;
        return;
    }

    const entries = dataPoint.dataset.type === "line"
        ? helpers.getEntriesForLine(dataPoint.dataIndex)
        : helpers.getEntriesForBar(dataPoint.dataIndex);

    const title = tooltip.title && tooltip.title[0] ? tooltip.title[0] : dataPoint.label || "";
    const titleElement = tooltipEl.querySelector(".chart-tooltip__title");
    if (titleElement) {
        titleElement.textContent = title;
    }

    const listElement = tooltipEl.querySelector(".chart-tooltip__list");
    if (listElement) {
        listElement.innerHTML = "";
        const toneClassMap = helpers.toneClassMap || {};

        entries.forEach((entry) => {
            const itemEl = document.createElement("div");
            itemEl.className = "chart-tooltip__item";
            if (entry.muted) {
                itemEl.classList.add("chart-tooltip__item--muted");
            }

            const labelWrapper = document.createElement("span");
            labelWrapper.className = "chart-tooltip__label-wrap";

            if (entry.icon) {
                const iconMarkup = helpers.icons && helpers.icons[entry.icon];
                if (iconMarkup) {
                    const iconSpan = document.createElement("span");
                    iconSpan.className = `chart-tooltip__icon chart-tooltip__icon--${entry.icon}`;
                    iconSpan.setAttribute("aria-hidden", "true");
                    iconSpan.innerHTML = iconMarkup;
                    labelWrapper.appendChild(iconSpan);
                }
            }

            const labelSpan = document.createElement("span");
            labelSpan.className = "chart-tooltip__label";
            labelSpan.textContent = entry.label;
            labelWrapper.appendChild(labelSpan);

            itemEl.appendChild(labelWrapper);

            const valueWrapper = document.createElement("span");
            valueWrapper.className = "chart-tooltip__value";

            if (entry.arrow) {
                const arrowClass = toneClassMap[entry.arrowTone] || "neutral";
                const arrowSpan = document.createElement("span");
                arrowSpan.className = `chart-tooltip__arrow chart-tooltip__arrow--${arrowClass}`;
                arrowSpan.textContent = entry.arrow;
                valueWrapper.appendChild(arrowSpan);
            }

            const valueSpan = document.createElement("span");
            valueSpan.className = "chart-tooltip__value-text";
            if (entry.emphasize) {
                valueSpan.classList.add("chart-tooltip__value-text--emphasis");
            }
            const valueToneClass = toneClassMap[entry.valueTone];
            if (valueToneClass && valueToneClass !== "neutral") {
                valueSpan.classList.add(`chart-tooltip__value-text--${valueToneClass}`);
            }
            valueSpan.textContent = entry.value;
            valueWrapper.appendChild(valueSpan);

            itemEl.appendChild(valueWrapper);
            listElement.appendChild(itemEl);
        });
    }

    const canvasRect = chart.canvas.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();

    const tooltipWidth = tooltipEl.offsetWidth || tooltipEl.getBoundingClientRect().width;
    const tooltipHeight = tooltipEl.offsetHeight || tooltipEl.getBoundingClientRect().height;
    const margin = 18;

    let left = canvasRect.left - parentRect.left + tooltip.caretX;
    let top = canvasRect.top - parentRect.top + tooltip.caretY;

    if (tooltipWidth && Number.isFinite(tooltipWidth)) {
        const halfWidth = tooltipWidth / 2;
        const minCenter = margin + halfWidth;
        const maxCenter = parentRect.width - margin - halfWidth;
        if (minCenter <= maxCenter) {
            left = Math.min(Math.max(left, minCenter), maxCenter);
        } else {
            left = parentRect.width / 2;
        }
    }

    if (tooltipHeight && Number.isFinite(tooltipHeight)) {
        const offsetAbove = tooltipHeight + 18; // matches translateY(-100% - 18px)
        const minAnchorTop = margin + offsetAbove;
        if (top < minAnchorTop) {
            top = minAnchorTop;
        }
    }

    tooltipEl.style.opacity = 1;
    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
}

function initPanelScrollAnimation() {
    const panels = Array.from(document.querySelectorAll(".panel--animate"));
    if (!panels.length) {
        return null;
    }

    const syncVisibility = () => {
        panels.forEach((panel) => {
            const shouldShow = panel.classList.contains("is-active") || !panel.dataset.slideId;
            panel.classList.toggle("is-visible", shouldShow);
        });
    };

    syncVisibility();

    return {
        notifyActiveChange: syncVisibility,
    };
}

function initSlideNavigation(panelAnimator) {
    const slidesContainer = document.querySelector("[data-slides]");
    if (!slidesContainer) {
        return;
    }

    const slides = Array.from(slidesContainer.querySelectorAll("[data-slide-id]"));
    const tabs = Array.from(document.querySelectorAll("[data-slide-target]"));
    const tabContainer = document.querySelector(".dashboard__filters-actions");

    if (!slides.length || !tabs.length) {
        return;
    }

    if (tabContainer) {
        tabContainer.addEventListener(
            "wheel",
            (event) => {
                if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
                    return;
                }

                tabContainer.scrollLeft += event.deltaY;
                event.preventDefault();
            },
            { passive: false }
        );
    }

    let activeId =
        slides.find((slide) => slide.classList.contains("is-active"))?.dataset.slideId || slides[0].dataset.slideId;
    const transitionDuration = 650;
    let isTransitioning = false;
    let transitionTimer = null;

    const syncTabs = (targetId) => {
        tabs.forEach((tab) => {
            const isActive = tab.dataset.slideTarget === targetId;
            tab.classList.toggle("is-active", isActive);
            tab.setAttribute("aria-selected", isActive ? "true" : "false");
            tab.setAttribute("tabindex", isActive ? "0" : "-1");

            if (isActive && tabContainer) {
                requestAnimationFrame(() =>
                    tab.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })
                );
            }
        });
    };

    const activateSlide = (targetId, { force = false } = {}) => {
        if (!targetId) {
            return false;
        }

        if (!force && (targetId === activeId || isTransitioning)) {
            syncTabs(targetId);
            return false;
        }

        const nextSlide = slides.find((slide) => slide.dataset.slideId === targetId);
        if (!nextSlide) {
            return false;
        }

        const currentSlide = slides.find((slide) => slide.dataset.slideId === activeId);
        if (currentSlide && currentSlide !== nextSlide) {
            currentSlide.classList.remove("is-active");
            currentSlide.classList.remove("is-visible");
        }

        nextSlide.classList.add("is-active");
        activeId = targetId;
        syncTabs(targetId);

        if (panelAnimator && typeof panelAnimator.notifyActiveChange === "function") {
            panelAnimator.notifyActiveChange();
        } else {
            nextSlide.classList.add("is-visible");
        }

        if (targetId === "bloqueado" && bloqueadoChartInstance) {
            requestAnimationFrame(() => {
                bloqueadoChartInstance.resize();
            });
        }

        if (targetId === "faturamento" && corteChartInstance) {
            requestAnimationFrame(() => {
                corteChartInstance.resize();
            });
        }

        if (targetId === "inventario" && inventarioChartInstance) {
            requestAnimationFrame(() => {
                inventarioChartInstance.resize();
            });
        }

        if (force) {
            isTransitioning = false;
            return true;
        }

        isTransitioning = true;
        if (transitionTimer) {
            clearTimeout(transitionTimer);
        }
        transitionTimer = window.setTimeout(() => {
            isTransitioning = false;
        }, transitionDuration);

        return true;
    };

    tabs.forEach((tab) => {
        tab.addEventListener("click", () => activateSlide(tab.dataset.slideTarget));
        tab.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                activateSlide(tab.dataset.slideTarget);
            }
        });
    });

    const findActiveIndex = () => tabs.findIndex((tab) => tab.dataset.slideTarget === activeId);

    const moveByOffset = (offset, { focusTab = false } = {}) => {
        if (!offset) {
            return false;
        }
        const currentIndex = findActiveIndex();
        if (currentIndex === -1 || tabs.length <= 1) {
            return false;
        }

        const nextIndex = currentIndex + offset;
        if (nextIndex < 0 || nextIndex >= tabs.length) {
            return false;
        }

        const nextTab = tabs[nextIndex];
        if (!nextTab) {
            return false;
        }

        const activated = activateSlide(nextTab.dataset.slideTarget);
        if (focusTab && activated) {
            nextTab.focus();
        }
        return activated;
    };

    const handleWheel = (event) => {
        if (tabs.length <= 1) {
            return;
        }

        const deltaY = event.deltaY;
        if (!Number.isFinite(deltaY) || Math.abs(deltaY) < 28) {
            return;
        }
        const direction = deltaY > 0 ? 1 : -1;
        const currentIndex = findActiveIndex();
        if (currentIndex === -1) {
            return;
        }

        const nextIndex = currentIndex + direction;
        if (nextIndex < 0 || nextIndex >= tabs.length) {
            return;
        }

        event.preventDefault();
        moveByOffset(direction);
    };

    slidesContainer.addEventListener("wheel", handleWheel, { passive: false });

    let touchStartY = null;

    slidesContainer.addEventListener(
        "touchstart",
        (event) => {
            if (event.touches && event.touches.length === 1) {
                touchStartY = event.touches[0].clientY;
            }
        },
        { passive: true }
    );

    slidesContainer.addEventListener(
        "touchmove",
        (event) => {
            if (touchStartY === null || !event.touches || event.touches.length !== 1) {
                return;
            }

            const currentY = event.touches[0].clientY;
            const deltaY = touchStartY - currentY;
            if (Math.abs(deltaY) < 40) {
                return;
            }

            event.preventDefault();

            const direction = deltaY > 0 ? 1 : -1;
            const changed = moveByOffset(direction);
            if (changed) {
                touchStartY = null;
            }
        },
        { passive: false }
    );

    slidesContainer.addEventListener(
        "touchend",
        () => {
            touchStartY = null;
        },
        { passive: true }
    );

    slidesContainer.addEventListener(
        "touchcancel",
        () => {
            touchStartY = null;
        },
        { passive: true }
    );

    document.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
            return;
        }

        event.preventDefault();
        const offset = event.key === "ArrowRight" ? 1 : -1;
        moveByOffset(offset, { focusTab: true });
    });

    activateSlide(activeId, { force: true });
}
