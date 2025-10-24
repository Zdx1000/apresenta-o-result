const API_ENDPOINT_BLOQUEADO = "/api/bloqueado";
const API_ENDPOINT_CORTE = "/api/corte";
const API_ENDPOINT_CORTE_MOTIVOS = "/api/corte/motivos";

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

let bloqueadoChartInstance = null;
let corteChartInstance = null;
let metricsDOM = null;
let corteMetricsDOM = null;
let motivosTableBody = null;
let corteDatasetCache = null;
let corteMotivosSummary = [];

const MOTIVO_KEY_CANDIDATES = ["Motivos", "Motivo", "Descrição", "Descricao", "Categoria"];
const VALOR_KEY_CANDIDATES = ["Soma de Valor Total", "Valor Total", "Total", "Valor", "Soma"];

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
    const corteStatusElement = document.querySelector('[data-status="corte"]');
    const corteMotivosStatusElement = document.querySelector('[data-status="corte-motivos"]');
    motivosTableBody = document.querySelector("[data-motivos-body]");
    metricsDOM = collectMetricElements();
    corteMetricsDOM = collectCorteMetricElements();
    clearMetrics();
    clearCorteMetrics();
    const panelAnimator = initPanelScrollAnimation();
    initSlideNavigation(panelAnimator);

    loadBloqueadoDataset(bloqueadoStatusElement);
    loadCorteDataset(corteStatusElement);
    loadCorteMotivosDataset(corteMotivosStatusElement);
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
            renderMetrics(payload.metrics);
            renderBloqueadoChart(payload);
            if (statusElement) {
                statusElement.textContent = "";
                statusElement.classList.add("status-message--hidden");
            }
        })
        .catch((error) => {
            console.error(error);
            clearMetrics();
            if (statusElement) {
                statusElement.textContent = "Nao foi possivel carregar os dados.";
                statusElement.classList.remove("status-message--hidden");
            }
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

    if (!slides.length || !tabs.length) {
        return;
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
