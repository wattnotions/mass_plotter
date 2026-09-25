const fileInput = document.querySelector("#csv-file");
const fileName = document.querySelector("#file-name");
const emptyState = document.querySelector("#empty-state");
const errorMessage = document.querySelector("#error-message");
const warningMessage = document.querySelector("#warning-message");
const plotElement = document.querySelector("#weight-plot");
const plotWrap = document.querySelector("#plot-wrap");
const nextPointPrompt = document.querySelector("#next-point-prompt");
const weeklyHoverCard = document.querySelector("#weekly-hover-card");
const trendCard = document.querySelector("#trend-card");
const clearTrendButton = document.querySelector("#clear-trend");
const tutorialCard = document.querySelector("#tutorial-card");
const tutorialClickLayer = document.querySelector("#tutorial-click-layer");
const helpButton = document.querySelector("#help-button");
const helpNudge = document.querySelector("#help-nudge");
const tutorialPointer = document.querySelector("#tutorial-pointer");

const palette = [
  "#4e79a7", "#59a14f", "#f28e2b", "#e15759", "#76b7b2",
  "#af7aa1", "#edc948", "#9c755f", "#ff9da7", "#79706e",
];
const cornerClasses = [
  "corner-top-left", "corner-top-right", "corner-bottom-left", "corner-bottom-right",
];

let currentData = null;
let selectedWeeks = [];
let plotRevision = 0;
let hoveredWeekIndex = null;
let tutorialStep = -1;
let tutorialActive = false;
let tutorialVisibleRawCount = 0;
let tutorialAnimationTimer = null;
let tutorialAnimationRunning = false;

function friendlyDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function signedWeight(value, suffix = " kg") {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}${suffix}`;
}

function showToast(element, message = "") {
  element.textContent = message;
  element.hidden = !message;
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;

  endTutorial();
  fileName.textContent = file.name;
  showToast(errorMessage);
  showToast(warningMessage);

  const body = new FormData();
  body.append("file", file);
  try {
    const response = await fetch("/api/weights", { method: "POST", body });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "The CSV could not be processed.");

    currentData = payload;
    selectedWeeks = [];
    plotRevision += 1;
    emptyState.hidden = true;
    renderPlot();
    showWarnings(payload);
  } catch (error) {
    showToast(errorMessage, error.message);
  } finally {
    fileInput.value = "";
  }
});

function showWarnings(data) {
  if (!data.summary.skippedCount) return;
  const detail = data.warnings.length ? ` ${data.warnings.join("; ")}` : "";
  showToast(
    warningMessage,
    `${data.summary.skippedCount} invalid row${data.summary.skippedCount === 1 ? " was" : "s were"} skipped.${detail}`,
  );
}

function renderPlot() {
  const choosingEnd = selectedWeeks.length === 1;
  const rawDataOnly = tutorialActive && tutorialStep === 0;
  const dailyWeekIndexes = currentData.daily.map((point) => {
    return currentData.weekly.findIndex((week) => week.date === point.week);
  });
  const dailyColors = dailyWeekIndexes.map((weekIndex) => {
    return palette[weekIndex % palette.length];
  });
  const weeklyColors = currentData.weekly.map((_, index) => (
    selectedWeeks.includes(index) ? "#62b879" : palette[index % palette.length]
  ));
  const weeklySizes = currentData.weekly.map((_, index) => (
    selectedWeeks.includes(index) ? 19 : choosingEnd ? 15 : 13
  ));

  const traces = [
    {
      x: currentData.daily.map((point) => point.date),
      y: currentData.daily.map((point) => point.weight),
      customdata: currentData.daily.map((point, index) => [dailyWeekIndexes[index], point.week]),
      type: "scatter",
      mode: "markers",
      name: "Daily measurements",
      hoverinfo: "skip",
      marker: {
        color: dailyColors,
        size: currentData.daily.map(() => rawDataOnly ? 5 : 4),
        opacity: currentData.daily.map((_, index) => (
          rawDataOnly ? (index < tutorialVisibleRawCount ? 1 : 0) : choosingEnd ? 0.2 : 0.38
        )),
        line: {
          color: currentData.daily.map(() => "rgba(255,255,255,0)"),
          width: currentData.daily.map(() => 0),
        },
      },
    },
    {
      x: currentData.weekly.map((point) => point.date),
      y: currentData.weekly.map((point) => point.weight),
      customdata: currentData.weekly.map((point, index) => [index, point.count]),
      type: "scatter",
      mode: "lines+markers",
      name: "Weekly average · click to compare",
      hoverinfo: "none",
      visible: !rawDataOnly,
      line: { color: "#9ba9bb", width: 2 },
      marker: {
        color: weeklyColors,
        size: weeklySizes,
        symbol: "circle",
        line: { color: "#f2f2f2", width: choosingEnd ? 2.5 : 2 },
      },
    },
  ];

  // Dedicated, tooltip-free highlight layers avoid redrawing the data traces
  // while the pointer moves across the chart.
  traces.push(
    {
      x: [], y: [], type: "scatter", mode: "markers", showlegend: false, hoverinfo: "skip",
      marker: { size: 9, opacity: 0.95, color: [], line: { color: "#ffffff", width: 1.5 } },
    },
    {
      x: [], y: [], type: "scatter", mode: "markers", showlegend: false, hoverinfo: "skip",
      marker: { size: 22, opacity: 1, color: [], symbol: "circle", line: { color: "#ffffff", width: 3 } },
    },
  );

  if (selectedWeeks.length === 2) {
    const sorted = [...selectedWeeks].sort((a, b) => a - b);
    const points = sorted.map((index) => currentData.weekly[index]);
    traces.push({
      x: points.map((point) => point.date),
      y: points.map((point) => point.weight),
      customdata: sorted.map((index) => [index]),
      type: "scatter",
      mode: "lines+markers",
      name: "Selected trend",
      hoverinfo: "skip",
      line: { color: "#62b879", width: 4, dash: "dash" },
      marker: { color: "#62b879", size: 16, line: { color: "#eeeeee", width: 2 } },
    });
  }

  const shapes = rawDataOnly ? [] : currentData.weekly.map((point) => ({
    type: "line", xref: "x", yref: "paper", x0: point.date, x1: point.date, y0: 0, y1: 1,
    line: { color: "rgba(180, 180, 180, 0.18)", width: 1, dash: "dot" },
    layer: "below",
  }));

  const layout = {
    uirevision: plotRevision,
    autosize: true,
    margin: { l: 62, r: 26, t: 55, b: 58 },
    paper_bgcolor: "#222222",
    plot_bgcolor: "#222222",
    font: { family: "Arial, Helvetica, sans-serif", color: "#dddddd" },
    hovermode: "closest",
    hoverlabel: {
      bgcolor: "#f4f4f4",
      bordercolor: "#777777",
      font: { family: "Arial, Helvetica, sans-serif", color: "#111111", size: 13 },
      align: "left",
    },
    clickmode: "event",
    dragmode: "zoom",
    legend: { orientation: "h", y: 1.08, x: 0, bgcolor: "rgba(0,0,0,0)", font: { size: 12 } },
    xaxis: { gridcolor: "#3b3b3b", linecolor: "#777777", tickformat: "%d %b\n%Y" },
    yaxis: { title: "Weight (kg)", gridcolor: "#3b3b3b", linecolor: "#777777", zeroline: false },
    shapes,
  };
  const config = {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ["lasso2d", "select2d"],
    toImageButtonOptions: { format: "png", filename: "weight-history", scale: 2 },
  };

  updateTrendOverlays();
  const renderPromise = Plotly.react(plotElement, traces, layout, config);
  renderPromise.then(() => {
    plotElement.removeAllListeners("plotly_click");
    plotElement.removeAllListeners("plotly_hover");
    plotElement.removeAllListeners("plotly_unhover");
    plotElement.removeAllListeners("plotly_relayout");
    plotElement.on("plotly_click", handlePlotClick);
    plotElement.on("plotly_hover", handlePlotHover);
    plotElement.on("plotly_unhover", resetHoverStyles);
    plotElement.on("plotly_relayout", positionVisibleOverlay);
    positionVisibleOverlay();
  });
  return renderPromise;
}

function handlePlotHover(event) {
  if (tutorialActive) return;
  const point = event.points.find((hoveredPoint) => hoveredPoint.curveNumber === 1);
  if (!point) return;

  const weekIndex = point.customdata[0];
  hoveredWeekIndex = weekIndex;
  const week = currentData.weekly[weekIndex];
  const highlightedDaily = currentData.daily.filter((dailyPoint) => (
    dailyPoint.week === week.date
  ));
  const highlightedWeek = [week];

  document.querySelector("#hover-weight").textContent = `${week.weight.toFixed(2)} kg`;
  document.querySelector("#hover-week").textContent = `Week of ${friendlyDate(week.date)}`;
  document.querySelector("#hover-count").textContent = `${week.count} measurement${week.count === 1 ? "" : "s"}`;
  weeklyHoverCard.hidden = false;

  Plotly.restyle(plotElement, {
    x: [highlightedDaily.map((dailyPoint) => dailyPoint.date)],
    y: [highlightedDaily.map((dailyPoint) => dailyPoint.weight)],
    "marker.color": [highlightedDaily.map(() => palette[weekIndex % palette.length])],
  }, [2]);
  Plotly.restyle(plotElement, {
    x: [highlightedWeek.map((week) => week.date)],
    y: [highlightedWeek.map((week) => week.weight)],
    "marker.color": [highlightedWeek.map(() => palette[weekIndex % palette.length])],
  }, [3]);
  positionVisibleOverlay();
}

function resetHoverStyles() {
  if (!currentData) return;
  hoveredWeekIndex = null;
  weeklyHoverCard.hidden = true;
  Plotly.restyle(plotElement, { x: [[]], y: [[]], "marker.color": [[]] }, [2]);
  Plotly.restyle(plotElement, { x: [[]], y: [[]], "marker.color": [[]] }, [3]);
}

function handlePlotClick(event) {
  if (tutorialActive) return;
  const clicked = event.points.find((point) => point.curveNumber === 1 || point.curveNumber === 4);
  if (!clicked || !clicked.customdata) return;

  const index = clicked.customdata[0];
  if (selectedWeeks.length >= 2) selectedWeeks = [];
  if (!selectedWeeks.includes(index)) selectedWeeks.push(index);
  renderPlot();
}

function updateTrendOverlays() {
  hoveredWeekIndex = null;
  weeklyHoverCard.hidden = true;
  nextPointPrompt.hidden = selectedWeeks.length !== 1;
  trendCard.hidden = selectedWeeks.length !== 2;

  if (selectedWeeks.length === 1) {
    const point = currentData.weekly[selectedWeeks[0]];
    document.querySelector("#start-point-summary").textContent = `${friendlyDate(point.date)} · ${point.weight.toFixed(2)} kg`;
  }
  if (selectedWeeks.length !== 2) return;

  const [startIndex, endIndex] = [...selectedWeeks].sort((a, b) => a - b);
  const start = currentData.weekly[startIndex];
  const end = currentData.weekly[endIndex];
  const weeks = Math.round((new Date(end.date) - new Date(start.date)) / 604800000);
  const change = end.weight - start.weight;
  const perWeek = weeks ? change / weeks : 0;

  const changeElement = document.querySelector("#trend-change");
  changeElement.textContent = signedWeight(change);
  changeElement.className = `trend-change${change < 0 ? " down" : change > 0 ? " up" : ""}`;
  document.querySelector("#trend-range").textContent = `${friendlyDate(start.date)} → ${friendlyDate(end.date)}`;
  document.querySelector("#trend-start").textContent = `${start.weight.toFixed(2)} kg`;
  document.querySelector("#trend-end").textContent = `${end.weight.toFixed(2)} kg`;
  document.querySelector("#trend-weekly").textContent = signedWeight(perWeek, " kg");
  document.querySelector("#trend-duration").textContent = `${weeks} wk`;
}

function positionVisibleOverlay() {
  const primaryOverlay = selectedWeeks.length === 1 ? nextPointPrompt : selectedWeeks.length === 2 ? trendCard : null;
  const hoverVisible = !weeklyHoverCard.hidden;
  if ((!primaryOverlay || primaryOverlay.hidden) && !hoverVisible) return;
  if (!plotElement._fullLayout) return;

  const xRange = plotElement._fullLayout.xaxis.range.map((value) => new Date(value).getTime());
  const yRange = plotElement._fullLayout.yaxis.range.map(Number);
  const xSpan = xRange[1] - xRange[0];
  const ySpan = yRange[1] - yRange[0];
  if (!xSpan || !ySpan) return;

  const scores = { topLeft: 0, topRight: 2, bottomLeft: 0, bottomRight: 0 };
  const scorePosition = (timestamp, weightValue, importance) => {
    const x = (timestamp - xRange[0]) / xSpan;
    const y = (weightValue - yRange[0]) / ySpan;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    if (x < 0.45 && y > 0.55) scores.topLeft += importance;
    if (x > 0.55 && y > 0.55) scores.topRight += importance;
    if (x < 0.45 && y < 0.45) scores.bottomLeft += importance;
    if (x > 0.55 && y < 0.45) scores.bottomRight += importance;
  };
  const timestamp = (point) => new Date(`${point.date}T00:00:00Z`).getTime();
  const scorePoint = (point, importance) => scorePosition(timestamp(point), point.weight, importance);
  const scoreSegment = (start, end, importance) => {
    const startTime = timestamp(start);
    const endTime = timestamp(end);
    for (let step = 0; step <= 12; step += 1) {
      const ratio = step / 12;
      scorePosition(
        startTime + ((endTime - startTime) * ratio),
        start.weight + ((end.weight - start.weight) * ratio),
        importance,
      );
    }
  };

  currentData.daily.forEach((point) => scorePoint(point, 1));
  currentData.weekly.forEach((point) => scorePoint(point, 4));
  for (let index = 1; index < currentData.weekly.length; index += 1) {
    scoreSegment(currentData.weekly[index - 1], currentData.weekly[index], 0.6);
  }
  if (selectedWeeks.length === 2) {
    const [startIndex, endIndex] = [...selectedWeeks].sort((a, b) => a - b);
    scoreSegment(currentData.weekly[startIndex], currentData.weekly[endIndex], 2.5);
  }

  const classByCorner = {
    topLeft: "corner-top-left",
    topRight: "corner-top-right",
    bottomLeft: "corner-bottom-left",
    bottomRight: "corner-bottom-right",
  };
  const placeInCorner = (overlay, corner) => {
    overlay.classList.remove(...cornerClasses);
    overlay.classList.add(classByCorner[corner]);
  };

  let occupiedCorner = null;
  if (primaryOverlay && !primaryOverlay.hidden) {
    occupiedCorner = Object.entries(scores).sort((a, b) => a[1] - b[1])[0][0];
    placeInCorner(primaryOverlay, occupiedCorner);
  }
  if (hoverVisible && hoveredWeekIndex !== null) positionHoverCardNearPoint(primaryOverlay);
}

function positionHoverCardNearPoint(primaryOverlay) {
  const layout = plotElement._fullLayout;
  const xAxis = layout.xaxis;
  const yAxis = layout.yaxis;
  const xRange = xAxis.range.map((value) => new Date(value).getTime());
  const yRange = yAxis.range.map(Number);
  const xSpan = xRange[1] - xRange[0];
  const ySpan = yRange[1] - yRange[0];
  if (!xSpan || !ySpan) return;

  const toPixel = (point) => ({
    x: xAxis._offset + ((new Date(`${point.date}T00:00:00Z`).getTime() - xRange[0]) / xSpan) * xAxis._length,
    y: yAxis._offset + (1 - ((point.weight - yRange[0]) / ySpan)) * yAxis._length,
  });
  const hoveredPoint = toPixel(currentData.weekly[hoveredWeekIndex]);
  const cardRect = weeklyHoverCard.getBoundingClientRect();
  const cardWidth = cardRect.width;
  const cardHeight = cardRect.height;
  const wrapRect = plotWrap.getBoundingClientRect();
  const visiblePoint = (point) => (
    point.x >= xAxis._offset && point.x <= xAxis._offset + xAxis._length
    && point.y >= yAxis._offset && point.y <= yAxis._offset + yAxis._length
  );
  const rawPoints = currentData.daily.map(toPixel).filter(visiblePoint);
  const weeklyPoints = currentData.weekly.map(toPixel).filter(visiblePoint);

  const mainSegments = [];
  for (let index = 1; index < currentData.weekly.length; index += 1) {
    mainSegments.push([toPixel(currentData.weekly[index - 1]), toPixel(currentData.weekly[index])]);
  }
  const trendSegments = [];
  if (selectedWeeks.length === 2) {
    const [startIndex, endIndex] = [...selectedWeeks].sort((a, b) => a - b);
    trendSegments.push([toPixel(currentData.weekly[startIndex]), toPixel(currentData.weekly[endIndex])]);
  }

  let primaryRect = null;
  if (primaryOverlay && !primaryOverlay.hidden) {
    const rect = primaryOverlay.getBoundingClientRect();
    primaryRect = {
      left: rect.left - wrapRect.left,
      right: rect.right - wrapRect.left,
      top: rect.top - wrapRect.top,
      bottom: rect.bottom - wrapRect.top,
    };
  }

  const containsPoint = (rect, point, padding = 0) => (
    point.x >= rect.left - padding && point.x <= rect.right + padding
    && point.y >= rect.top - padding && point.y <= rect.bottom + padding
  );
  const overlapsRect = (first, second, padding = 0) => !(
    first.right + padding < second.left || first.left - padding > second.right
    || first.bottom + padding < second.top || first.top - padding > second.bottom
  );
  const segmentHitsRect = (segment, rect, padding) => {
    const [start, end] = segment;
    const expanded = {
      left: rect.left - padding,
      right: rect.right + padding,
      top: rect.top - padding,
      bottom: rect.bottom + padding,
    };
    if (containsPoint(expanded, start) || containsPoint(expanded, end)) return true;
    const intersects = (firstStart, firstEnd, secondStart, secondEnd) => {
      const firstVector = { x: firstEnd.x - firstStart.x, y: firstEnd.y - firstStart.y };
      const secondVector = { x: secondEnd.x - secondStart.x, y: secondEnd.y - secondStart.y };
      const denominator = (firstVector.x * secondVector.y) - (firstVector.y * secondVector.x);
      if (Math.abs(denominator) < 0.0001) return false;
      const difference = { x: secondStart.x - firstStart.x, y: secondStart.y - firstStart.y };
      const firstRatio = ((difference.x * secondVector.y) - (difference.y * secondVector.x)) / denominator;
      const secondRatio = ((difference.x * firstVector.y) - (difference.y * firstVector.x)) / denominator;
      return firstRatio >= 0 && firstRatio <= 1 && secondRatio >= 0 && secondRatio <= 1;
    };
    const topLeft = { x: expanded.left, y: expanded.top };
    const topRight = { x: expanded.right, y: expanded.top };
    const bottomLeft = { x: expanded.left, y: expanded.bottom };
    const bottomRight = { x: expanded.right, y: expanded.bottom };
    return intersects(start, end, topLeft, topRight)
      || intersects(start, end, topRight, bottomRight)
      || intersects(start, end, bottomRight, bottomLeft)
      || intersects(start, end, bottomLeft, topLeft);
  };
  const collisionScore = (rect) => {
    if (rect.left < 6 || rect.top < 6 || rect.right > plotWrap.clientWidth - 6 || rect.bottom > plotWrap.clientHeight - 6) {
      return 100000;
    }
    let score = 0;
    rawPoints.forEach((point) => { if (containsPoint(rect, point, 5)) score += 2; });
    weeklyPoints.forEach((point) => { if (containsPoint(rect, point, 9)) score += 15; });
    mainSegments.forEach((segment) => { if (segmentHitsRect(segment, rect, 4)) score += 12; });
    trendSegments.forEach((segment) => { if (segmentHitsRect(segment, rect, 6)) score += 30; });
    if (primaryRect && overlapsRect(rect, primaryRect, 8)) score += 1000;
    return score;
  };

  const directions = [
    [1, 0], [-1, 0], [0, -1], [0, 1],
    [0.707, -0.707], [0.707, 0.707], [-0.707, -0.707], [-0.707, 0.707],
  ];
  const gaps = [10, 20, 34, 50, 70, 95, 125, 160];
  const candidates = [];
  gaps.forEach((gap) => {
    directions.forEach(([dx, dy]) => {
      const support = (Math.abs(dx) * cardWidth / 2) + (Math.abs(dy) * cardHeight / 2);
      const centerX = hoveredPoint.x + (dx * (support + gap));
      const centerY = hoveredPoint.y + (dy * (support + gap));
      const rect = {
        left: centerX - cardWidth / 2,
        right: centerX + cardWidth / 2,
        top: centerY - cardHeight / 2,
        bottom: centerY + cardHeight / 2,
      };
      candidates.push({ rect, gap, score: collisionScore(rect) });
    });
  });

  const best = candidates.sort((first, second) => first.score - second.score || first.gap - second.gap)[0];
  weeklyHoverCard.classList.remove(...cornerClasses);
  weeklyHoverCard.style.right = "auto";
  weeklyHoverCard.style.bottom = "auto";
  weeklyHoverCard.style.left = `${best.rect.left}px`;
  weeklyHoverCard.style.top = `${best.rect.top}px`;
}

function clearTrend() {
  if (!selectedWeeks.length) return;
  selectedWeeks = [];
  renderPlot();
}

function showTutorialStep() {
  const messages = [
    "Raw weight data is messy",
    "This app lets you more easily see the trend in the noise",
    "Upload your own weight data",
  ];
  tutorialCard.hidden = false;
  tutorialCard.classList.toggle("plot-step", tutorialStep < 2);
  tutorialCard.classList.toggle("raw-step", tutorialStep === 0);
  tutorialCard.classList.toggle("upload-step", tutorialStep === 2);
  document.querySelector("#tutorial-progress").textContent = `${tutorialStep + 1} OF 3`;
  document.querySelector("#tutorial-message").textContent = messages[tutorialStep];
  const tutorialHint = document.querySelector("#tutorial-hint");
  tutorialHint.hidden = tutorialStep === 0 && tutorialAnimationRunning;
  tutorialHint.textContent = tutorialStep === 2
    ? "Use the Upload CSV button above, or click anywhere to finish"
    : "Click anywhere to continue";
  return currentData ? renderPlot() : Promise.resolve();
}

function startTutorial() {
  helpNudge.hidden = true;
  selectedWeeks = [];
  tutorialActive = true;
  tutorialStep = 0;
  tutorialVisibleRawCount = 1;
  tutorialAnimationRunning = true;
  tutorialClickLayer.hidden = false;
  document.body.classList.add("tutorial-active");
  showTutorialStep().then(startRawDataAnimation);
}

function endTutorial() {
  const rawOnlyWasVisible = tutorialActive && tutorialStep === 0;
  stopRawDataAnimation();
  tutorialActive = false;
  tutorialStep = -1;
  tutorialCard.hidden = true;
  tutorialClickLayer.hidden = true;
  tutorialCard.classList.remove("upload-step");
  tutorialCard.classList.remove("raw-step");
  tutorialCard.classList.remove("plot-step");
  tutorialPointer.hidden = true;
  document.body.classList.remove("tutorial-active");
  if (rawOnlyWasVisible && currentData) renderPlot();
}

function updateTutorialPointer(pointIndex) {
  if (!plotElement._fullLayout || tutorialPointer.hidden) return;
  const point = currentData.daily[pointIndex];
  const layout = plotElement._fullLayout;
  const xRange = layout.xaxis.range.map((value) => new Date(value).getTime());
  const yRange = layout.yaxis.range.map(Number);
  const plotRect = plotElement.getBoundingClientRect();
  const boxRect = tutorialCard.getBoundingClientRect();
  const pointTime = new Date(`${point.date}T00:00:00Z`).getTime();
  const targetX = plotRect.left + layout.xaxis._offset
    + ((pointTime - xRange[0]) / (xRange[1] - xRange[0])) * layout.xaxis._length;
  const targetY = plotRect.top + layout.yaxis._offset
    + (1 - ((point.weight - yRange[0]) / (yRange[1] - yRange[0]))) * layout.yaxis._length;
  const centerX = boxRect.left + boxRect.width / 2;
  const centerY = boxRect.top + boxRect.height / 2;
  const deltaX = targetX - centerX;
  const deltaY = targetY - centerY;
  const edgeScale = Math.min(
    (boxRect.width / 2) / Math.max(Math.abs(deltaX), 0.001),
    (boxRect.height / 2) / Math.max(Math.abs(deltaY), 0.001),
  );
  const startX = centerX + (deltaX * edgeScale);
  const startY = centerY + (deltaY * edgeScale);
  const lineX = targetX - startX;
  const lineY = targetY - startY;
  const angle = Math.atan2(lineY, lineX) * (180 / Math.PI);
  tutorialPointer.style.left = `${startX}px`;
  tutorialPointer.style.top = `${startY}px`;
  tutorialPointer.style.width = "72px";
  tutorialPointer.style.transform = `rotate(${angle}deg)`;
}

function startRawDataAnimation() {
  stopRawDataAnimation(false);
  tutorialAnimationRunning = true;
  tutorialPointer.hidden = false;
  updateTutorialPointer(0);
  const totalPoints = currentData.daily.length;
  if (totalPoints <= 1) {
    finishRawDataAnimation();
    return;
  }
  const interval = 5000 / (totalPoints - 1);
  tutorialAnimationTimer = window.setInterval(() => {
    tutorialVisibleRawCount += 1;
    const visibleCount = Math.min(tutorialVisibleRawCount, totalPoints);
    Plotly.restyle(plotElement, {
      "marker.opacity": [currentData.daily.map((_, index) => index < visibleCount ? 1 : 0)],
    }, [0]);
    updateTutorialPointer(visibleCount - 1);
    if (visibleCount >= totalPoints) finishRawDataAnimation();
  }, interval);
}

function finishRawDataAnimation() {
  if (tutorialAnimationTimer !== null) window.clearInterval(tutorialAnimationTimer);
  tutorialAnimationTimer = null;
  tutorialAnimationRunning = false;
  tutorialPointer.hidden = true;
  if (tutorialActive && tutorialStep === 0) {
    const tutorialHint = document.querySelector("#tutorial-hint");
    tutorialHint.hidden = false;
    tutorialHint.textContent = "Click anywhere to continue";
  }
}

function stopRawDataAnimation(resetState = true) {
  if (tutorialAnimationTimer !== null) window.clearInterval(tutorialAnimationTimer);
  tutorialAnimationTimer = null;
  tutorialPointer.hidden = true;
  if (resetState) tutorialAnimationRunning = false;
}

async function loadDefaultSample() {
  try {
    const response = await fetch("/api/sample");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "The sample data could not be loaded.");
    currentData = payload;
    selectedWeeks = [];
    plotRevision += 1;
    fileName.textContent = "Sample · Jul–Dec 2025";
    emptyState.hidden = true;
    renderPlot();
    helpNudge.hidden = false;
  } catch (error) {
    showToast(errorMessage, error.message);
  }
}

clearTrendButton.addEventListener("click", clearTrend);
plotWrap.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  clearTrend();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (tutorialActive) endTutorial();
  else clearTrend();
});
helpButton.addEventListener("click", (event) => {
  event.stopPropagation();
  startTutorial();
});
tutorialClickLayer.addEventListener("click", () => {
  if (tutorialAnimationRunning) return;
  if (tutorialStep < 2) {
    stopRawDataAnimation();
    tutorialStep += 1;
    showTutorialStep();
  } else {
    endTutorial();
  }
});

loadDefaultSample();
