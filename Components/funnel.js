const FUNNEL_ENDPOINT = "/api/funnel";

const funnelCurrencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
});

const funnelPercentageFormatter = new Intl.NumberFormat("pt-BR", {
    style: "percent",
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
});

const funnelIntegerFormatter = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
});

const funnelDOM = {
    status: null,
    total: null,
    list: null,
    metrics: {},
};

document.addEventListener("DOMContentLoaded", () => {
    funnelDOM.status = document.querySelector('[data-status="funnel"]');
    funnelDOM.total = document.querySelector("[data-funnel-total]");
    funnelDOM.list = document.querySelector("[data-funnel-breakdown]");
    funnelDOM.metrics = collectFunnelMetrics();

    if (!funnelDOM.total || !funnelDOM.list) {
        return;
    }

    resetFunnelMetrics("Carregando...");
    loadFunnelDataset();
});

function loadFunnelDataset() {
    fetch(FUNNEL_ENDPOINT)
        .then((response) => {
            if (!response.ok) {
                throw new Error("Falha ao carregar os dados de funnel");
            }
            return response.json();
        })
        .then((payload) => {
            const dataset = prepareFunnelEntries(payload);
            renderFunnelSummary(dataset);
        })
        .catch((error) => {
            console.error(error);
            showFunnelError();
        });
}

function updateFunnelStatus(message) {
    if (!funnelDOM.status) {
        return;
    }

    if (message) {
        funnelDOM.status.textContent = message;
        funnelDOM.status.classList.remove("is-hidden");
    } else {
        funnelDOM.status.textContent = "";
        funnelDOM.status.classList.add("is-hidden");
    }
}

function showFunnelError() {
    updateFunnelStatus("Nao foi possivel carregar os dados.");

    if (funnelDOM.total) {
        funnelDOM.total.textContent = "Total bloqueado: --";
    }

    if (funnelDOM.list) {
        funnelDOM.list.innerHTML = '<li class="funnel-summary__empty">Nao foi possivel carregar os dados</li>';
    }

    resetFunnelMetrics("Indicadores indisponiveis.");
}

function renderFunnelSummary(dataset) {
    if (!funnelDOM.total || !funnelDOM.list) {
        return;
    }

    const total = Number.isFinite(dataset?.total) ? dataset.total : 0;
    funnelDOM.total.textContent = `Total bloqueado: ${funnelCurrencyFormatter.format(total)}`;

    const entries = Array.isArray(dataset?.entries) ? dataset.entries : [];
    if (!entries.length) {
        funnelDOM.list.innerHTML = '<li class="funnel-summary__empty">Sem dados disponíveis</li>';
        updateFunnelStatus("Sem dados disponiveis.");
        resetFunnelMetrics("Sem dados disponiveis.");
        return;
    }

    updateFunnelStatus("");
    funnelDOM.list.innerHTML = "";

    const palette = generateFunnelPalette(entries.length);

    const headerItem = document.createElement("li");
    headerItem.className = "funnel-summary__header";
    const headerRow = document.createElement("div");
    headerRow.className = "funnel-summary__row funnel-summary__row--header";

    const createHeaderCell = (labelText, iconName, extraClass) => {
        const cell = document.createElement("span");
        cell.className = `funnel-summary__cell ${extraClass}`.trim();

        const content = document.createElement("span");
        content.className = "funnel-summary__header-content";

        const icon = document.createElement("span");
        icon.className = "funnel-summary__header-icon material-symbols-rounded";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = iconName;

        const label = document.createElement("span");
        label.textContent = labelText;

        content.appendChild(icon);
        content.appendChild(label);
        cell.appendChild(content);

        return cell;
    };

    const motiveHeading = createHeaderCell("Motivo", "filter_alt", "funnel-summary__cell--label");
    const observationHeading = createHeaderCell("Observação", "notes", "funnel-summary__cell--observation");
    const detailsHeading = createHeaderCell("Valor e participação", "payments", "funnel-summary__cell--details");

    headerRow.appendChild(motiveHeading);
    headerRow.appendChild(observationHeading);
    headerRow.appendChild(detailsHeading);
    headerItem.appendChild(headerRow);
    funnelDOM.list.appendChild(headerItem);

    entries.forEach((entry, index) => {
        const item = document.createElement("li");
        item.className = "funnel-summary__item";

        const row = document.createElement("div");
        row.className = "funnel-summary__row";

        const label = document.createElement("span");
        label.className = "funnel-summary__cell funnel-summary__cell--label";
        label.textContent = entry.label || "Sem motivo";

        const observation = document.createElement("span");
        observation.className = "funnel-summary__cell funnel-summary__cell--observation";
        observation.textContent = entry.observation || "—";

        const details = document.createElement("span");
        details.className = "funnel-summary__cell funnel-summary__cell--details";
        const shareText = funnelPercentageFormatter.format(entry.share || 0);
        details.textContent = `${funnelCurrencyFormatter.format(entry.value)} - ${shareText} do total`;

        row.appendChild(label);
        row.appendChild(observation);
        row.appendChild(details);

        const meter = document.createElement("span");
        meter.className = "funnel-summary__item-meter";
        const widthPercent = Math.max(4, Math.min(100, Math.round((entry.share || 0) * 100)));
        const startColor = palette[index] || "#005f9e";
        const endColor = adjustColorLightness(startColor, 1.25);
        meter.style.setProperty("--meter-width", `${widthPercent}%`);
        meter.style.setProperty("--meter-color-start", startColor);
        meter.style.setProperty("--meter-color-end", endColor);

        item.appendChild(row);
        item.appendChild(meter);
        funnelDOM.list.appendChild(item);
    });

    renderFunnelMetrics(dataset);
}

function prepareFunnelEntries(payload) {
    const rawTotal = typeof payload?.total === "number" && Number.isFinite(payload.total) ? payload.total : 0;
    const rawEntries = Array.isArray(payload?.entries) ? payload.entries : [];

    const normalized = rawEntries
        .map((entry) => {
            const value = typeof entry?.value === "number" && Number.isFinite(entry.value) ? entry.value : null;
            if (value === null) {
                return null;
            }
            const label = entry?.label !== undefined && entry?.label !== null ? String(entry.label) : "Sem motivo";

            let observation = null;
            if (entry?.observation !== undefined && entry?.observation !== null) {
                if (typeof entry.observation === "string") {
                    observation = entry.observation.trim();
                } else {
                    observation = String(entry.observation).trim();
                }
            }

            if (!observation) {
                observation = null;
            }

            return { label, value, observation };
        })
        .filter(Boolean);

    if (!normalized.length) {
        return { total: rawTotal, entries: [] };
    }

    normalized.sort((a, b) => b.value - a.value);

    const computedTotal = normalized.reduce((sum, entry) => sum + entry.value, 0);
    const total = rawTotal > 0 ? rawTotal : computedTotal;

    const entries = normalized.map((entry) => {
        const share = total > 0 ? entry.value / total : 0;
        return { ...entry, share };
    });

    return { total, entries };
}

function generateFunnelPalette(count) {
    if (!count || count <= 0) {
        return ["#005f9e"];
    }

    const baseColors = [
        "#005f9e",
        "#0077c2",
        "#0091d5",
        "#00a3db",
        "#00b5dd",
        "#00c7d4",
        "#1dd4c4",
        "#34ead0",
        "#4ff3c6",
        "#6af8b8",
    ];

    if (count <= baseColors.length) {
        return baseColors.slice(0, count);
    }

    const palette = [];
    for (let index = 0; index < count; index += 1) {
        const base = baseColors[index % baseColors.length];
        const factor = 1 - (index / count) * 0.22;
        const shade = adjustColorLightness(base, factor);
        palette.push(shade);
    }
    return palette;
}

function adjustColorLightness(hexColor, factor) {
    const sanitized = hexColor.replace("#", "");
    const bigint = parseInt(sanitized, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;

    const adjust = (component) => {
        const value = Math.min(255, Math.max(0, Math.round(component * factor)));
        return value;
    };

    const newR = adjust(r);
    const newG = adjust(g);
    const newB = adjust(b);

    return `#${newR.toString(16).padStart(2, "0")}${newG.toString(16).padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
}

function collectFunnelMetrics() {
    const metricCards = document.querySelectorAll("[data-funnel-metric]");
    if (!metricCards.length) {
        return {};
    }

    const metrics = {};
    metricCards.forEach((card) => {
        const key = card.getAttribute("data-funnel-metric");
        if (!key) {
            return;
        }
        metrics[key] = {
            value: card.querySelector(".metric-card__value"),
            context: card.querySelector(".metric-card__context"),
        };
    });

    return metrics;
}

function resetFunnelMetrics(message = "—") {
    if (!funnelDOM.metrics) {
        return;
    }

    Object.values(funnelDOM.metrics).forEach((nodes) => {
        if (!nodes) {
            return;
        }
        if (nodes.value) {
            nodes.value.textContent = "—";
        }
        if (nodes.context) {
            nodes.context.textContent = message;
        }
    });
}

function renderFunnelMetrics(dataset) {
    if (!funnelDOM.metrics) {
        return;
    }

    const metrics = calculateFunnelMetrics(dataset);
    if (!metrics) {
        resetFunnelMetrics("Sem dados disponiveis.");
        return;
    }

    Object.entries(funnelDOM.metrics).forEach(([key, nodes]) => {
        const metric = metrics[key];
        if (!nodes) {
            return;
        }

        if (!metric) {
            if (nodes.value) {
                nodes.value.textContent = "—";
            }
            if (nodes.context) {
                nodes.context.textContent = "Sem dados disponiveis.";
            }
            return;
        }

        if (nodes.value) {
            nodes.value.textContent = metric.value;
        }
        if (nodes.context) {
            nodes.context.textContent = metric.context;
        }
    });
}

function calculateFunnelMetrics(dataset) {
    const entries = Array.isArray(dataset?.entries) ? dataset.entries : [];
    if (!entries.length) {
        return null;
    }

    const total = typeof dataset?.total === "number" && Number.isFinite(dataset.total)
        ? dataset.total
        : entries.reduce((sum, entry) => sum + (Number.isFinite(entry?.value) ? entry.value : 0), 0);

    const quantity = entries.length;
    const topEntry = entries[0];
    const top3Entries = entries.slice(0, 3);
    const top3Share = top3Entries.reduce((sum, entry) => sum + (Number.isFinite(entry?.share) ? entry.share : 0), 0);
    const averageValue = quantity > 0 ? total / quantity : 0;
    const criticalThreshold = 0.1;
    const criticalEntries = entries.filter((entry) => (Number.isFinite(entry?.share) ? entry.share : 0) >= criticalThreshold);
    const hhiValue = entries.reduce((sum, entry) => sum + Math.pow(Number.isFinite(entry?.share) ? entry.share : 0, 2), 0);
    const hhiScore = Math.round(hhiValue * 10000);
    const tailShare = Math.min(1, Math.max(0, 1 - top3Share));
    const tailCount = Math.max(quantity - top3Entries.length, 0);

    const topShareText = funnelPercentageFormatter.format(Number.isFinite(topEntry?.share) ? topEntry.share : 0);
    const thresholdText = funnelPercentageFormatter.format(criticalThreshold);

    return {
        "top-motive": {
            value: funnelCurrencyFormatter.format(Number.isFinite(topEntry?.value) ? topEntry.value : 0),
            context: `${topEntry?.label ?? "Sem motivo"} - ${topShareText}`,
        },
        "top3-share": {
            value: funnelPercentageFormatter.format(top3Share),
            context: `Participacao conjunta dos ${Math.min(3, quantity)} maiores motivos`,
        },
        "average-value": {
            value: funnelCurrencyFormatter.format(averageValue),
            context: `Media calculada sobre ${quantity} motivo${quantity === 1 ? "" : "s"}`,
        },
        "critical-count": {
            value: funnelIntegerFormatter.format(criticalEntries.length),
            context: `Motivos com participacao >= ${thresholdText}`,
        },
        hhi: {
            value: funnelIntegerFormatter.format(hhiScore),
            context: "HHI (0 a 10.000) - maior valor indica maior concentracao",
        },
        "tail-share": {
            value: funnelPercentageFormatter.format(tailShare),
            context: `Demais motivos (${tailCount}) apos o Top 3`,
        },
    };
}
