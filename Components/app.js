const API_ENDPOINT = "/api/bloqueado";

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
let metricsDOM = null;

document.addEventListener("DOMContentLoaded", () => {
    const statusElement = document.querySelector("[data-status]");
    metricsDOM = collectMetricElements();
    clearMetrics();

    fetch(API_ENDPOINT)
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
});

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
                            return colors.axis;
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
