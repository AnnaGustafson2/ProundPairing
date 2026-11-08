const WIDTH = 1200;
const HEIGHT = 800;

const SEASON_ORDER = { Spring: 0, Summer: 1, Fall: 2 };
const termKey = (t) => {
  if (!t) return 0;
  const [season, year] = t.split(" ");
  return (+year || 2026) * 3 + (SEASON_ORDER[season] ?? 0);
};

function dateToTerm(date) {
  if (!date) return "Fall 2026";
  let month = 9;
  let year = 2026;
  if (date.includes("-")) {
    const parts = date.split("-").map(Number);
    year = parts[0];
    month = parts[1];
  } else if (date.includes("/")) {
    const parts = date.split("/").map(Number);
    month = parts[0];
    year = parts[2];
  } else {
    return date;
  }

  const season =
    month >= 1 && month <= 5
      ? "Spring"
      : month >= 6 && month <= 8
        ? "Summer"
        : "Fall";

  return `${season} ${year}`;
}

function sortYearsDomain(values) {
  return [...new Set(values)].sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  });
}

const tournamentBin = (n) =>
  n === 0 ? "0" : n <= 2 ? "1–2" : n <= 4 ? "3–4" : "5+";

const attendanceBin = (n) =>
  n <= 5 ? "0-5" : n <= 10 ? "5-10" : n <= 15 ? "10-15" : "15+";

const ATTENDANCE_COLOR_OPTIONS = {
  years: {
    label: "Years on team",
    get: (d) => {
      const yrs = d.years_on_team ?? (d.start_year ? 2026 - d.start_year + 1 : null);
      return yrs ? `${yrs} yr` : "Unknown";
    },
  },
  tournaments: {
    label: "Tournaments attended",
    get: (d) => tournamentBin(d.tournaments_attended || 0),
  },
  attendance: {
    label: "Practices attended",
    get: (d) => attendanceBin(d.attended || 0),
  },
};

const COLOR_OPTIONS = {
  years: {
    label: "Years on team",
    get: (d) => {
      const yrs = d.years_on_team ?? (d.start_year ? 2026 - d.start_year + 1 : null);
      return yrs ? `${yrs} yr` : "Unknown";
    },
  },
  experience: { label: "Experience", get: (d) => d.status || d.experience_level || "Unknown" },
  gender: { label: "Gender", get: (d) => d.gender || "Unknown" },
};

/* =====================================================================
   Reusable attendance bar chart
   ===================================================================== */
async function createAttendanceChart({
  apiEndpoint,
  file,       // fallback JSON file to load
  prefix,     // id prefix in the HTML, e.g. "attendance" or "tournament-attendance"
  totalKey,   // field holding the total number of events
  noun,       // "sessions" or "tournaments", used in labels and tooltips
}) {
  let rows = [];
  if (apiEndpoint) {
    try {
      const res = await fetch(apiEndpoint);
      if (res.ok) {
        rows = await res.json();
      }
    } catch (e) {}
  }
  if (!rows || rows.length === 0) {
    try {
      rows = await d3.json(file);
    } catch (e) {
      console.error(`Error loading ${file}:`, e);
      return;
    }
  }

  const total = rows.length ? rows[0][totalKey] || rows[0].total_sessions || rows[0].total_tournaments || 0 : 0;
  const margin = { top: 20, right: 30, bottom: 36, left: 150 };
  const width = 900;
  const height = rows.length * 22 + margin.top + margin.bottom;
  let colorBy = "attendance";

  const svg = d3
    .select(`#${prefix}-vis`)
    .append("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("style", "width: 100%; max-width: 100%; height: auto;");
  const x = d3
    .scaleLinear()
    .domain([0, Math.max(1, total)])
    .range([margin.left, width - margin.right]);
  const y = d3
    .scaleBand()
    .domain(rows.map((d) => d.name))
    .range([margin.top, height - margin.bottom])
    .padding(0.15);
  const color = d3.scaleOrdinal(d3.schemeCategory10);

  const bars = svg
    .append("g")
    .selectAll("rect")
    .data(rows)
    .join("rect")
    .attr("x", x(0))
    .attr("y", (d) => y(d.name))
    .attr("width", (d) => x(d.attended) - x(0))
    .attr("height", y.bandwidth());

  bars
    .append("title")
    .text(
      (d) =>
        `${d.name}\n${d.attended} of ${d[totalKey] || total} ${noun} ` +
        `(${Math.round((d.rate || (total > 0 ? d.attended / total : 0)) * 100)}%)\n` +
        (d.experience_level ? `${d.experience_level}, ` : "") +
        `${d.years_on_team ?? (d.start_year ? 2026 - d.start_year + 1 : '?')} yr on team`,
    );

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSize(0))
    .select(".domain")
    .remove();
  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(
      d3.axisBottom(x).ticks(Math.min(total, 10)).tickFormat(d3.format("d")),
    );
  svg
    .append("text")
    .attr("x", width - margin.right)
    .attr("y", height - 4)
    .attr("text-anchor", "end")
    .attr("font-size", 12)
    .text(`${noun[0].toUpperCase() + noun.slice(1)} attended (out of ${total})`);

  function recolor() {
    const get = ATTENDANCE_COLOR_OPTIONS[colorBy].get;
    const domain = sortYearsDomain(rows.map(get));
    color.domain(domain);
    bars.attr("fill", (d) => color(get(d)));

    const items = d3
      .select(`#${prefix}-legend`)
      .selectAll("span.legend-item")
      .data(color.domain(), (d) => d)
      .join("span")
      .attr("class", "legend-item")
      .style("margin-right", "12px");
    items.selectAll("*").remove();
    items
      .append("span")
      .style("display", "inline-block")
      .style("width", "10px")
      .style("height", "10px")
      .style("border-radius", "50%")
      .style("margin-right", "4px")
      .style("background", (d) => color(d));
    items.append("span").text((d) => d);
  }

  const select = d3.select(`#${prefix}-colorBy`);
  if (!select.empty()) {
    select
      .selectAll("option")
      .data(Object.entries(ATTENDANCE_COLOR_OPTIONS))
      .join("option")
      .attr("value", ([key]) => key)
      .text(([, opt]) => opt.label);
    select.property("value", colorBy);
    select.on("change", function () {
      colorBy = this.value;
      recolor();
    });
  }

  recolor();
}

createAttendanceChart({
  apiEndpoint: "/api/statistics/attendance",
  file: "./data/attendance.json",
  prefix: "attendance",
  totalKey: "total_sessions",
  noun: "sessions",
});

createAttendanceChart({
  apiEndpoint: "/api/statistics/tournament-attendance",
  file: "./data/tournament-attendance.json",
  prefix: "tournament-attendance",
  totalKey: "total_tournaments",
  noun: "tournaments",
});

/* =====================================================================
   Dumbell Chart to compare attendance and tournament attendance
   ===================================================================== */
async function createComparisonChart() {
  let practice = [];
  let tourney = [];
  try {
    const resP = await fetch("/api/statistics/attendance");
    if (resP.ok) practice = await resP.json();
  } catch (e) {}
  if (!practice.length) {
    practice = await d3.json("./data/attendance.json").catch(() => []);
  }

  try {
    const resT = await fetch("/api/statistics/tournament-attendance");
    if (resT.ok) tourney = await resT.json();
  } catch (e) {}
  if (!tourney.length) {
    tourney = await d3.json("./data/tournament-attendance.json").catch(() => []);
  }

  const byId = new Map();
  practice.forEach((d) =>
    byId.set(d.id || d.name, { ...d, practice: d.rate, tournament: 0 }),
  );
  tourney.forEach((d) => {
    const key = d.id || d.name;
    if (byId.has(key)) byId.get(key).tournament = d.rate;
    else byId.set(key, { ...d, practice: 0, tournament: d.rate });
  });
  const rows = [...byId.values()].sort(
    (a, b) =>
      b.practice - a.practice ||
      b.tournament - a.tournament ||
      a.name.localeCompare(b.name),
  );

  const margin = { top: 20, right: 30, bottom: 36, left: 150 };
  const width = 900;
  const height = rows.length * 22 + margin.top + margin.bottom;

  const svg = d3
    .select("#comparison-vis")
    .append("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("style", "width: 100%; max-width: 100%; height: auto;");

  const x = d3
    .scaleLinear()
    .domain([0, 1])
    .range([margin.left, width - margin.right]);
  const y = d3
    .scaleBand()
    .domain(rows.map((d) => d.name))
    .range([margin.top, height - margin.bottom])
    .padding(0.15);

  const PRACTICE = "#4F83CC";
  const TOURNAMENT = "#F39C35";

  // Light gridlines
  svg
    .append("g")
    .attr("stroke", "#ddd")
    .selectAll("line")
    .data(x.ticks(5))
    .join("line")
    .attr("x1", (d) => x(d))
    .attr("x2", (d) => x(d))
    .attr("y1", margin.top)
    .attr("y2", height - margin.bottom);

  const row = svg
    .append("g")
    .selectAll("g")
    .data(rows)
    .join("g")
    .attr("transform", (d) => `translate(0,${y(d.name) + y.bandwidth() / 2})`);

  row
    .append("line")
    .attr("x1", (d) => x(Math.min(d.practice, d.tournament)))
    .attr("x2", (d) => x(Math.max(d.practice, d.tournament)))
    .attr("stroke", "#999")
    .attr("stroke-width", 2);
  row
    .append("circle")
    .attr("cx", (d) => x(d.practice))
    .attr("r", 5)
    .attr("fill", PRACTICE);
  row
    .append("circle")
    .attr("cx", (d) => x(d.tournament))
    .attr("r", 5)
    .attr("fill", TOURNAMENT);

  row.append("title").text(
    (d) =>
      `${d.name}\nPractice: ${Math.round(d.practice * 100)}%` +
      `\nTournaments: ${Math.round(d.tournament * 100)}%`,
  );

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSize(0))
    .select(".domain")
    .remove();
  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".0%")));

  // Legend
  const items = d3
    .select("#comparison-legend")
    .selectAll("span.legend-item")
    .data([
      ["Practice", PRACTICE],
      ["Tournaments", TOURNAMENT],
    ])
    .join("span")
    .attr("class", "legend-item")
    .style("margin-right", "12px");
  items
    .append("span")
    .style("display", "inline-block")
    .style("width", "10px")
    .style("height", "10px")
    .style("border-radius", "50%")
    .style("margin-right", "4px")
    .style("background", (d) => d[1]);
  items.append("span").text((d) => d[0]);
}

createComparisonChart();

/* =====================================================================
   Force graph (used for the tournament pairings)
   ===================================================================== */
function createVis(data, { mount = "#vis", noun = "Tournaments" } = {}) {
  const $ = (id) => `#${id}`;

  // Copy nodes once so positions persist across filtering.
  const allNodes = (data.nodes || []).map((d) => ({ ...d }));

  // Normalize tournament links to consistent format.
  const allLinks = (data.links || []).map((d) => ({
    ...d,
    year: d.year || dateToTerm(d.date),
    label: d.tournament || d.date || d.year,
  }));

  const allJudging = (data.judging || []).map((d) => ({
    ...d,
    year: d.year || (d.date ? dateToTerm(d.date) : "Fall 2026"),
  }));

  const allAttendance = (data.attendance || []).map((d) => ({
    ...d,
    year: d.year || (d.date ? dateToTerm(d.date) : "Fall 2026"),
  }));

  // Sorted, de-duplicated list of terms (e.g. "Summer 2026", "Fall 2026").
  const termSet = new Set();
  allLinks.forEach((l) => l.year && termSet.add(l.year));
  allJudging.forEach((j) => j.year && termSet.add(j.year));
  allAttendance.forEach((a) => a.year && termSet.add(a.year));

  const terms = [...termSet].sort((a, b) => termKey(a) - termKey(b));
  if (terms.length === 0) terms.push("Fall 2026");

  const state = { colorBy: "years", start: 0, end: Math.max(0, terms.length - 1) };

  // ---------- SVG ----------
  const svg = d3
    .select(mount)
    .append("svg")
    .attr("width", WIDTH)
    .attr("height", HEIGHT)
    .attr("viewBox", [0, 0, WIDTH, HEIGHT])
    .attr("style", "max-width: 100%; height: auto;");

  const linkLayer = svg
    .append("g")
    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.6);
  const nodeLayer = svg
    .append("g")
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5);

  let link = linkLayer.selectAll("line");
  let node = nodeLayer.selectAll("circle");

  // ---------- Tooltip ----------
  const tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "node-tooltip")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("opacity", 0)
    .style("background", "rgba(30, 30, 30, 0.92)")
    .style("color", "#fff")
    .style("padding", "6px 10px")
    .style("border-radius", "4px")
    .style("font", "13px/1.4 sans-serif")
    .style("z-index", 10);

  function showTooltip(event, d) {
    tooltip.selectAll("*").remove();
    tooltip.append("div").style("font-weight", "600").text(d.name);
    tooltip.append("div").text(`${noun}: ${d.count}`);
    const parts = [];
    if (d.debated > 0) parts.push(`Debated ${d.debated}`);
    if (d.judged > 0) parts.push(`Judged ${d.judged}`);
    if (d.attendedOnly > 0) parts.push(`Attended ${d.attendedOnly}`);
    if (parts.length > 0) {
      tooltip.append("div").text(parts.join(", "));
    }
    const yrs = d.years_on_team ?? (d.start_year ? 2026 - d.start_year + 1 : null);
    if (yrs) {
      tooltip.append("div").text(`${yrs} yr on team`);
    }
    tooltip.style("opacity", 1);
    moveTooltip(event);
  }

  function moveTooltip(event) {
    tooltip
      .style("left", event.pageX + 14 + "px")
      .style("top", event.pageY + 14 + "px");
  }

  function hideTooltip() {
    tooltip.style("opacity", 0);
  }

  // ---------- Simulation ----------
  const simulation = d3
    .forceSimulation()
    .force(
      "link",
      d3
        .forceLink()
        .id((d) => d.name)
        .strength(0.4),
    )
    .force("charge", d3.forceManyBody().strength(-200))
    .force("center", d3.forceCenter(WIDTH / 2, HEIGHT / 2))
    .force("x", d3.forceX(WIDTH / 2).strength(0.05))
    .force("y", d3.forceY(HEIGHT / 2).strength(0.05))
    .on("tick", ticked);

  function ticked() {
    const pad = 2;
    node
      .attr(
        "cx",
        (d) => (d.x = Math.max(d.r + pad, Math.min(WIDTH - d.r - pad, d.x))),
      )
      .attr(
        "cy",
        (d) => (d.y = Math.max(d.r + pad, Math.min(HEIGHT - d.r - pad, d.y))),
      );

    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);
  }

  // ---------- Color ----------
  const color = d3.scaleOrdinal(d3.schemeCategory10);

  function recolor() {
    const get = COLOR_OPTIONS[state.colorBy].get;
    // Domain comes from all nodes so colors stay stable while filtering by time.
    const domain = sortYearsDomain(allNodes.map(get));
    color.domain(domain);
    node.attr("fill", (d) => color(get(d)));
    drawLegend();
  }

  function drawLegend() {
    const items = d3
      .select($("legend"))
      .selectAll("span.legend-item")
      .data(color.domain(), (d) => d);
    items.exit().remove();
    const enter = items.enter().append("span").attr("class", "legend-item");
    enter
      .append("span")
      .attr("class", "legend-swatch")
      .style("display", "inline-block")
      .style("width", "10px")
      .style("height", "10px")
      .style("border-radius", "50%")
      .style("margin-right", "4px");
    enter.append("span").attr("class", "legend-text");
    enter.style("margin-right", "12px");
    enter
      .merge(items)
      .select(".legend-swatch")
      .style("background", (d) => color(d));
    enter
      .merge(items)
      .select(".legend-text")
      .text((d) => d);
  }

  // ---------- Time filtering ----------
  function update() {
    hideTooltip();
    const lo = termKey(terms[state.start]);
    const hi = termKey(terms[state.end]);

    // Keep links in range, merging repeat pairings between the same two people.
    const pairs = new Map();
    allLinks.forEach((l) => {
      const k = termKey(l.year);
      if (k < lo || k > hi) return;
      const key = [l.source, l.target].sort().join("|");
      if (!pairs.has(key)) {
        pairs.set(key, { key, source: l.source, target: l.target, events: [] });
      }
      pairs.get(key).events.push(`${l.label}, ${l.year}`);
    });
    const links = [...pairs.values()];

    // Debates in window
    const debated = new Map();
    links.forEach((l) => {
      [l.source, l.target].forEach((name) =>
        debated.set(name, (debated.get(name) || 0) + l.events.length),
      );
    });

    // Judging in window
    const judged = new Map();
    allJudging.forEach((j) => {
      const k = termKey(j.year);
      if (k < lo || k > hi) return;
      judged.set(j.name, (judged.get(j.name) || 0) + 1);
    });

    // Attendance in window
    const attendedOnly = new Map();
    allAttendance.forEach((a) => {
      const k = termKey(a.year);
      if (k < lo || k > hi) return;
      attendedOnly.set(a.name, (attendedOnly.get(a.name) || 0) + 1);
    });

    // Counts for all members with ANY attendance or activity in window
    const counts = new Map();
    const allActiveNames = new Set([...debated.keys(), ...judged.keys(), ...attendedOnly.keys()]);
    allActiveNames.forEach((name) => {
      const dCount = debated.get(name) || 0;
      const jCount = judged.get(name) || 0;
      const aCount = attendedOnly.get(name) || 0;
      // Total tournament events
      counts.set(name, Math.max(dCount + jCount, aCount));
    });

    // Line thickness grows with the number of pairings between two people.
    const maxLink = d3.max(links, (d) => d.events.length) || 1;
    const widthScale = d3
      .scaleLinear()
      .domain([1, Math.max(2, maxLink)])
      .range([1.5, 10]);

    // Show all members who have attended in the time frame!
    const nodes = allNodes.filter((n) => counts.has(n.name));
    nodes.forEach((n) => {
      n.debated = debated.get(n.name) || 0;
      n.judged = judged.get(n.name) || 0;
      n.attendedOnly = Math.max(0, (attendedOnly.get(n.name) || 0) - (n.debated + n.judged));
      n.count = counts.get(n.name) || (n.debated + n.judged + n.attendedOnly);
    });

    link = linkLayer
      .selectAll("line")
      .data(links, (d) => d.key)
      .join("line")
      .attr("stroke-width", (d) => widthScale(d.events.length));
    link.selectAll("title").remove();
    link.append("title").text((d) => d.events.join("\n"));

    node = nodeLayer
      .selectAll("circle")
      .data(nodes, (d) => d.name)
      .join((enter) => enter.append("circle").attr("r", 5))
      .on("mouseover", showTooltip)
      .on("mousemove", moveTooltip)
      .on("mouseout", hideTooltip)
      .call(
        d3
          .drag()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended),
      );

    // Node area grows with the count (sqrt scale keeps area proportional).
    const maxCount = d3.max(nodes, (n) => n.count) || 1;
    const radius = d3
      .scaleSqrt()
      .domain([1, Math.max(2, maxCount)])
      .range([6, 22]);
    node.attr("r", (d) => radius(d.count));
    nodes.forEach((n) => (n.r = radius(n.count)));

    // Stop bigger nodes from overlapping.
    simulation.force(
      "collide",
      d3.forceCollide().radius((d) => radius(d.count) + 3),
    );

    simulation.nodes(nodes);
    simulation.force("link").links(links);
    simulation.alpha(0.7).restart();

    recolor();
  }

  // ---------- Drag ----------
  function dragstarted(event) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  }
  function dragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }
  function dragended(event) {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  }

  // ---------- Controls ----------
  // Color dropdown
  const colorSelect = d3.select($("colorBy"));
  if (!colorSelect.empty()) {
    colorSelect
      .selectAll("option")
      .data(Object.entries(COLOR_OPTIONS))
      .join("option")
      .attr("value", ([key]) => key)
      .text(([, opt]) => opt.label);

    colorSelect
      .property("value", state.colorBy)
      .on("change", function () {
        state.colorBy = this.value;
        recolor();
      });
  }

  // Time sliders (indexes into the sorted `terms` array)
  const startSlider = d3.select($("startRange"));
  const endSlider = d3.select($("endRange"));
  const max = Math.max(0, terms.length - 1);

  [startSlider, endSlider].forEach((s) => {
    if (!s.empty()) s.attr("min", 0).attr("max", max).attr("step", 1);
  });
  if (!startSlider.empty()) startSlider.property("value", state.start);
  if (!endSlider.empty()) endSlider.property("value", state.end);

  function updateTimeLabel() {
    const text =
      state.start === state.end
        ? terms[state.start]
        : `${terms[state.start]} to ${terms[state.end]}`;
    d3.select($("timeLabel")).text(text);
  }

  if (!startSlider.empty()) {
    startSlider.on("input", function () {
      state.start = +this.value;
      if (state.start > state.end) {
        state.end = state.start;
        endSlider.property("value", state.end);
      }
      updateTimeLabel();
      update();
    });
  }

  if (!endSlider.empty()) {
    endSlider.on("input", function () {
      state.end = +this.value;
      if (state.end < state.start) {
        state.start = state.end;
        startSlider.property("value", state.start);
      }
      updateTimeLabel();
      update();
    });
  }

  updateTimeLabel();
  update();
}

const highlightedNames = new Set([
  "Amudhan Gandhi",
  "Juha Park",
  "Nico Solano",
  "Riley Crane",
  "Madison Hull",
  "Suhail Al Eryani",
  "Bowen Yan",
  "Joseph Garrison",
]);

function createPairingCharts(data, attendanceData) {
  const width = 1200;
  const height = 700;

  if (!data || !data.nodes) return;

  // Count cross-level pairings and distinct practices attended.
  const counts = new Map(data.nodes.map((d) => [d.name, { pairings: 0 }]));
  const nodesByName = new Map(data.nodes.map((d) => [d.name, d]));

  // Get practice attendance directly from the attendance data.
  const attendanceByName = new Map(
    (attendanceData || []).map((d) => [d.name, d.attended]),
  );

  (data.links || []).forEach((link) => {
    const source = nodesByName.get(link.source);
    const target = nodesByName.get(link.target);

    if (!source || !target) return;

    // Count only novice-varsity pairings.
    if (source.status && target.status && source.status !== target.status) {
      if (counts.has(source.name)) counts.get(source.name).pairings++;
      if (counts.has(target.name)) counts.get(target.name).pairings++;
    }
  });

  function drawChart(selector, status) {
    const container = d3.select(selector);
    if (container.empty()) return;

    const people = data.nodes
      .filter((d) => d.status === status)
      .map((d) => {
        const stats = counts.get(d.name) || { pairings: 0 };
        const attended = attendanceByName.get(d.name) || 0;

        return {
          ...d,
          pairings: stats.pairings,
          attended,
          ratio: attended > 0 ? stats.pairings / attended : 0,
        };
      });

    const svg = container
      .append("svg")
      .attr("viewBox", [0, 0, width, height])
      .style("width", "100%")
      .style("height", "auto");
    const x = d3
      .scaleLinear()
      .domain([0, d3.max(people, (d) => d.ratio) || 1])
      .range([80, width - 80]);

    const y = d3
      .scaleLinear()
      .domain([d3.max(people, (d) => d.attended) || 1, 0])
      .range([height - 60, 60]);

    const JITTER_RANGE = 50;

    // Tooltip for the ratio charts.
    const tooltip = d3
      .select("body")
      .append("div")
      .attr("class", "ratio-tooltip")
      .style("position", "absolute")
      .style("pointer-events", "none")
      .style("opacity", 0)
      .style("background", "rgba(30, 30, 30, 0.92)")
      .style("color", "#fff")
      .style("padding", "6px 10px")
      .style("border-radius", "4px")
      .style("font", "13px/1.4 sans-serif")
      .style("z-index", 10);

    function showTooltip(event, d) {
      tooltip.selectAll("*").remove();
      tooltip.append("div").style("font-weight", "600").text(d.name);
      if (d.gender) tooltip.append("div").text(`Gender: ${d.gender}`);
      tooltip.append("div").text(`Cross-level pairings: ${d.pairings}`);
      tooltip.append("div").text(`Practices attended: ${d.attended}`);
      tooltip
        .append("div")
        .text(`Pairings per practice: ${d.ratio.toFixed(2)}`);

      tooltip.style("opacity", 1);
      moveTooltip(event);
    }

    function moveTooltip(event) {
      tooltip
        .style("left", event.pageX + 14 + "px")
        .style("top", event.pageY + 14 + "px");
    }

    function hideTooltip() {
      tooltip.style("opacity", 0);
    }

    svg
      .append("g")
      .selectAll("circle")
      .data(people)
      .join("circle")
      .attr("cx", (d) =>
        Math.max(
          80 + 5,
          Math.min(
            width - 80 - 5,
            x(d.ratio) + (Math.random() - 0.5) * JITTER_RANGE,
          ),
        ),
      )
      .attr("cy", (d) =>
        Math.max(
          60 + 5,
          Math.min(
            height - 60 - 5,
            y(d.attended) + (Math.random() - 0.5) * JITTER_RANGE,
          ),
        ),
      )
      .attr("r", 8)
      .attr("fill", (d) =>
        highlightedNames.has(d.name) ? "#F39C35" : "#4F83CC",
      )
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .on("mouseover", showTooltip)
      .on("mousemove", moveTooltip)
      .on("mouseout", hideTooltip);

    svg
      .append("g")
      .attr("transform", `translate(0, ${height - 60})`)
      .call(d3.axisBottom(x));

    svg
      .append("g")
      .attr("transform", "translate(80, 0)")
      .call(d3.axisLeft(y).ticks(10).tickFormat(d3.format("d")));

    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", height - 15)
      .attr("text-anchor", "middle")
      .text("Cross-level Pairings per Practice");

    svg
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", 25)
      .attr("text-anchor", "middle")
      .text("Number of Practices Attended");
  }

  drawChart("#novice-pairings-vis", "Novice");
  drawChart("#varsity-pairings-vis", "Varsity");
}

/* =====================================================================
   Load all graphs
   ===================================================================== */
async function init() {
  let tournamentData = null;
  let pairingData = null;
  let attendanceData = null;
  let members = [];

  try {
    const resTourn = await fetch("/api/statistics/pairings");
    if (resTourn.ok) tournamentData = await resTourn.json();
  } catch (e) {}

  if (!tournamentData) {
    tournamentData = await d3.json("./data/pairings.json").catch(() => ({ nodes: [], links: [], judging: [] }));
  }

  pairingData = await d3.json("./data/practice-parings.json").catch(() => ({ nodes: [], links: [] }));

  try {
    const resAtt = await fetch("/api/statistics/attendance");
    if (resAtt.ok) attendanceData = await resAtt.json();
  } catch (e) {}

  if (!attendanceData) {
    attendanceData = await d3.json("./data/attendance.json").catch(() => []);
  }

  try {
    const resMem = await fetch("/api/members");
    if (resMem.ok) members = await resMem.json();
  } catch (e) {}

  // Map member names to roster metadata
  const memberMap = new Map();
  if (Array.isArray(members)) {
    members.forEach((m) => memberMap.set(m.name, m));
  }
  if (Array.isArray(attendanceData)) {
    attendanceData.forEach((m) => {
      if (!memberMap.has(m.name)) {
        memberMap.set(m.name, m);
      }
    });
  }

  // Ensure all nodes in tournament pairings have start_year and years_on_team
  if (tournamentData && tournamentData.nodes) {
    tournamentData.nodes.forEach((n) => {
      const m = memberMap.get(n.name);
      if (m) {
        if (n.start_year == null) n.start_year = m.start_year;
        if (n.years_on_team == null) {
          n.years_on_team = m.years_on_team ?? (m.start_year ? 2026 - m.start_year + 1 : null);
        }
        if (!n.status && m.experience_level) n.status = m.experience_level;
      }
      if (n.years_on_team == null) {
        n.years_on_team = n.status === "Varsity" ? 2 : 1;
      }
    });
  }

  // Draw tournament pairings force graph
  createVis(tournamentData);

  // Draw practice pairings charts
  createPairingCharts(pairingData, attendanceData);
}

function initTabs() {
  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".tab-panel");

  function show(id) {
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === id));
    panels.forEach((p) => (p.hidden = p.id !== id));
    history.replaceState(null, "", `#${id}`);
  }

  tabs.forEach((t) => t.addEventListener("click", () => show(t.dataset.tab)));

  const initial = location.hash.slice(1);
  show([...panels].some((p) => p.id === initial) ? initial : panels[0].id);
}

initTabs();
window.addEventListener("load", init);

/* Navigation button handling */
const pround_pairing = document.getElementById("pround-pairing");
if (pround_pairing) {
  pround_pairing.addEventListener("click", function () {
    window.location.href = "index.html";
  });
}

const tournament_attendance_btn = document.getElementById("tournament-attendance");
if (tournament_attendance_btn) {
  tournament_attendance_btn.addEventListener("click", function () {
    window.location.href = "tournament_attendance.html";
  });
}
