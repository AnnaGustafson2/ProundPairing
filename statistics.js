const WIDTH = 1200;
const HEIGHT = 800;
/* =====================================================================
   Reusable attendance bar chart
   ===================================================================== */
function createAttendanceChart({
  file,       // JSON file to load
  prefix,     // id prefix in the HTML, e.g. "attendance" or "tournament-attendance"
  totalKey,   // field holding the total number of events
  noun,       // "sessions" or "tournaments", used in labels and tooltips
}) {
  d3.json(file)
    .then((rows) => {
      const total = rows.length ? rows[0][totalKey] : 0;
      const margin = { top: 20, right: 30, bottom: 36, left: 150 };
      const width = 900;
      const height = rows.length * 22 + margin.top + margin.bottom;
      let colorBy = "experience";

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
            `${d.name}\n${d.attended} of ${d[totalKey]} ${noun} ` +
            `(${Math.round(d.rate * 100)}%)\n${d.experience_level}, ` +
            `${d.years_on_team} yr on team`,
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
        color.domain([...new Set(rows.map(get))].sort());
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

      d3.select(`#${prefix}-colorBy`)
        .selectAll("option")
        .data(Object.entries(ATTENDANCE_COLOR_OPTIONS))
        .join("option")
        .attr("value", ([key]) => key)
        .text(([, opt]) => opt.label);
      d3.select(`#${prefix}-colorBy`).on("change", function () {
        colorBy = this.value;
        recolor();
      });

      recolor();
    })
    .catch((error) => console.error(`Error loading ${file}:`, error));
}

createAttendanceChart({
  file: "./data/attendance.json",
  prefix: "attendance",
  totalKey: "total_sessions",
  noun: "sessions",
});

createAttendanceChart({
  file: "./data/tournament-attendance.json",
  prefix: "tournament-attendance",
  totalKey: "total_tournaments",
  noun: "tournaments",
});

const SEASON_ORDER = { Spring: 0, Summer: 1, Fall: 2 };
const termKey = (t) => {
  const [season, year] = t.split(" ");
  return +year * 3 + (SEASON_ORDER[season] ?? 0);
};

function dateToTerm(date) {
  const [month, day, year] = date.split("/").map(Number);

  const season =
    month >= 1 && month <= 5
      ? "Spring"
      : month >= 6 && month <= 8
        ? "Summer"
        : "Fall";

  return `${season} ${year}`;
}

const COLOR_OPTIONS = {
  experience: { label: "Experience", get: (d) => d.status },
  gender: { label: "Gender", get: (d) => d.gender },
};

const ATTENDANCE_COLOR_OPTIONS = {
  experience: { label: "Experience", get: (d) => d.experience_level },
  years: { label: "Years on team", get: (d) => `${d.years_on_team} yr` },
};

/* =====================================================================
   Dumbell Chart to compare attendance and tournament attendance
   ===================================================================== */
function createComparisonChart() {
  Promise.all([
    d3.json("./data/attendance.json"),
    d3.json("./data/tournament-attendance.json"),
  ])
    .then(([practice, tourney]) => {
      // Merge on member id. Missing from a file means 0% for that event type
      // (because never-attenders were cut from the export).
      const byId = new Map();
      practice.forEach((d) =>
        byId.set(d.id, { ...d, practice: d.rate, tournament: 0 }),
      );
      tourney.forEach((d) => {
        if (byId.has(d.id)) byId.get(d.id).tournament = d.rate;
        else byId.set(d.id, { ...d, practice: 0, tournament: d.rate });
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
    })
    .catch((error) => console.error("Error loading comparison:", error));
}

createComparisonChart();

/* =====================================================================
   Force graph (used for the tournament pairings)
   mount:  selector of the div the SVG is drawn into
   ===================================================================== */
function createVis(data, { mount = "#vis", noun = "Tournaments" } = {}) {
  const $ = (id) => `#${id}`;

  // Copy nodes once so positions persist across filtering.
  const allNodes = data.nodes.map((d) => ({ ...d }));
  // Normalize tournament and practice links to the same format.
  const allLinks = data.links.map((d) => ({
    ...d,
    year: d.year || dateToTerm(d.date),
    label: d.tournament || d.date || d.year,
  }));
  // Sorted, de-duplicated list of terms (e.g. "Summer 2026", "Fall 2026").
  const terms = [
    ...new Set([...allLinks, ...(data.judging || [])].map((l) => l.year)),
  ].sort((a, b) => termKey(a) - termKey(b));
  const state = { colorBy: "experience", start: 0, end: terms.length - 1 };

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
    if (d.judged > 0) {
      tooltip.append("div").text(`Debated ${d.debated}, judged ${d.judged}`);
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
    color.domain([...new Set(allNodes.map(get))].sort());
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

    // Events debated per person in the selected window = their link events.
    // Judging in the window also counts, but never creates a link.
    const debated = new Map();
    links.forEach((l) => {
      [l.source, l.target].forEach((name) =>
        debated.set(name, (debated.get(name) || 0) + l.events.length),
      );
    });
    const judged = new Map();
    (data.judging || []).forEach((j) => {
      const k = termKey(j.year);
      if (k < lo || k > hi) return;
      judged.set(j.name, (judged.get(j.name) || 0) + 1);
    });
    const counts = new Map();
    new Set([...debated.keys(), ...judged.keys()]).forEach((name) =>
      counts.set(name, (debated.get(name) || 0) + (judged.get(name) || 0)),
    );

    // Line thickness grows with the number of pairings between two people.
    const maxLink = d3.max(links, (d) => d.events.length) || 1;
    const widthScale = d3
      .scaleLinear()
      .domain([1, Math.max(2, maxLink)])
      .range([1.5, 10]);

    // Show anyone with activity in the window (judges with no pairings
    // still appear, just unlinked).
    const nodes = allNodes.filter((n) => counts.has(n.name));
    nodes.forEach((n) => {
      n.debated = debated.get(n.name) || 0;
      n.judged = judged.get(n.name) || 0;
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
    nodes.forEach((n) => (n.count = counts.get(n.name)));
    const maxCount = d3.max(nodes, (n) => n.count) || 1;
    const radius = d3
      .scaleSqrt()
      .domain([1, Math.max(2, maxCount)])
      .range([5, 20]);
    node.attr("r", (d) => radius(d.count));
    nodes.forEach((n) => (n.r = radius(n.count)));

    // Stop bigger nodes from overlapping.
    simulation.force(
      "collide",
      d3.forceCollide().radius((d) => radius(d.count) + 2),
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
  d3.select($("colorBy"))
    .selectAll("option")
    .data(Object.entries(COLOR_OPTIONS))
    .join("option")
    .attr("value", ([key]) => key)
    .text(([, opt]) => opt.label);

  d3.select($("colorBy"))
    .property("value", state.colorBy)
    .on("change", function () {
      state.colorBy = this.value;
      recolor(); // no need to rebuild the graph, just recolor
    });

  // Time sliders (indexes into the sorted `terms` array)
  const startSlider = d3.select($("startRange"));
  const endSlider = d3.select($("endRange"));
  const max = terms.length - 1;

  [startSlider, endSlider].forEach((s) =>
    s.attr("min", 0).attr("max", max).attr("step", 1),
  );
  startSlider.property("value", state.start);
  endSlider.property("value", state.end);

  function updateTimeLabel() {
    const text =
      state.start === state.end
        ? terms[state.start]
        : `${terms[state.start]} to ${terms[state.end]}`;
    d3.select($("timeLabel")).text(text);
  }

  startSlider.on("input", function () {
    state.start = +this.value;
    if (state.start > state.end) {
      state.end = state.start; // push the other handle along
      endSlider.property("value", state.end);
    }
    updateTimeLabel();
    update();
  });

  endSlider.on("input", function () {
    state.end = +this.value;
    if (state.end < state.start) {
      state.start = state.end;
      startSlider.property("value", state.start);
    }
    updateTimeLabel();
    update();
  });

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

  // Count cross-level pairings and distinct practices attended.
  const counts = new Map(data.nodes.map((d) => [d.name, { pairings: 0 }]));

  const nodesByName = new Map(data.nodes.map((d) => [d.name, d]));

  // Get practice attendance directly from the attendance data.
  const attendanceByName = new Map(
    attendanceData.map((d) => [d.name, d.attended]),
  );

  data.links.forEach((link) => {
    const source = nodesByName.get(link.source);
    const target = nodesByName.get(link.target);

    if (!source || !target) return;

    // Count only novice-varsity pairings.
    if (source.status !== target.status) {
      counts.get(source.name).pairings++;
      counts.get(target.name).pairings++;
    }
  });

  const genderColor = d3
    .scaleOrdinal()
    .domain(["GM", "Non-GM"])
    .range(["#4F83CC", "#F39C35"]);

  function drawChart(selector, status) {
    const people = data.nodes
      .filter((d) => d.status === status)
      .map((d) => {
        const stats = counts.get(d.name);
        const attended = attendanceByName.get(d.name) || 0;

        return {
          ...d,
          pairings: stats.pairings,
          attended,
          ratio: attended > 0 ? stats.pairings / attended : 0,
        };
      });

    const svg = d3
      .select(selector)
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

    const circles = svg
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
    // Gender legend.
    const legend = svg.append("g").attr("transform", "translate(20, 25)");

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
      tooltip.append("div").text(`Gender: ${d.gender}`);
      tooltip.append("div").text(`Experience: ${d.status}`);
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

    circles
      .on("mouseover", showTooltip)
      .on("mousemove", moveTooltip)
      .on("mouseout", hideTooltip);
  }

  drawChart("#novice-pairings-vis", "Novice");
  drawChart("#varsity-pairings-vis", "Varsity");
}

/* =====================================================================
   Load both graphs
   ===================================================================== */

function init() {
  Promise.all([
    d3.json("./data/pairings.json"),
    d3.json("./data/practice-parings.json"),
    d3.json("./data/attendance.json"),
  ])
    .then(([tournamentData, pairingData, attendanceData]) => {
      // Tournament Pairings graph
      createVis(tournamentData);

      // Practice Pairings charts
      createPairingCharts(pairingData, attendanceData);
    })
    .catch((error) => console.error("Error loading pairing charts:", error));
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

/* Back button handling */
const pround_pairing = document.getElementById("pround-pairing");
if (pround_pairing) {
  pround_pairing.addEventListener("click", function () {
    window.location.href = "index.html";
  });
}
