const WIDTH = 1200;
const HEIGHT = 800;

// Chronological order of terms inside a year. Add more seasons if you need them.
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

// What each option in the "Color by" dropdown reads from a node.
const COLOR_OPTIONS = {
  experience: { label: "Experience", get: (d) => d.status },
  gender: { label: "Gender", get: (d) => d.gender },
};

// Same idea for the attendance chart (rows come from the SQLite export).
const ATTENDANCE_COLOR_OPTIONS = {
  experience: { label: "Experience", get: (d) => d.experience_level },
  gender: { label: "Gender", get: (d) => d.gender || "Unknown" },
};

/* =====================================================================
   Force graph (used for both the tournament pairings and practice pairings)
   prefix: id prefix for this graph's controls ("" or "practice-")
   mount:  selector of the div the SVG is drawn into
   ===================================================================== */
function createVis(
  data,
  {
    prefix = "",
    mount = "#vis",
    noun = "Tournaments",
    unit = ["tournament", "tournaments"],
  } = {},
) {
  const $ = (id) => `#${prefix}${id}`; // e.g. $("legend") -> "#practice-legend"

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

  // ---------- Summary stats ----------
  function drawStats(nodes) {
    const sections = [
      {
        title: "Gender",
        get: (d) => d.gender,
        field: "debated",
        verb: "attended",
      },
      {
        title: "Experience",
        get: (d) => d.status,
        field: "debated",
        verb: "attended",
      },
      {
        title: "Judging by gender",
        get: (d) => d.gender,
        field: "judged",
        verb: "judged",
      },
      {
        title: "Judging by experience",
        get: (d) => d.status,
        field: "judged",
        verb: "judged",
      },
    ];

    const box = d3.select($("stats"));
    box.selectAll("*").remove();
    box
      .style("display", "flex")
      .style("flex-wrap", "wrap")
      .style("gap", "32px")
      .style("margin", "12px 0")
      .style("font", "14px/1.6 sans-serif");

    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const pct = (part, whole) =>
      whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%";

    sections.forEach(({ title, get, field, verb }) => {
      // Only count people who actually did this activity in the window.
      const active = nodes.filter((d) => d[field] > 0);
      const totals = d3.rollup(
        active,
        (v) => ({ people: v.length, tournaments: d3.sum(v, (d) => d[field]) }),
        get,
      );

      // Section-wide totals are the denominators for the percentages.
      const allPeople = d3.sum([...totals.values()], (v) => v.people);
      const allTournaments = d3.sum([...totals.values()], (v) => v.tournaments);

      const section = box.append("div");
      section
        .append("div")
        .style("font-weight", "600")
        .style("margin-bottom", "2px")
        .text(title);

      if (totals.size === 0) {
        section.append("div").style("opacity", 0.6).text("None in this window");
        return;
      }

      [...totals]
        .sort((a, b) => b[1].tournaments - a[1].tournaments)
        .forEach(([key, val]) => {
          const row = section.append("div");
          row.append("span").style("font-weight", "600").text(`${key}: `);
          row
            .append("span")
            .text(
              `${plural(val.people, "person", "people")} ` +
                `(${pct(val.people, allPeople)}) – ` +
                `${plural(val.tournaments, unit[0], unit[1])} ${verb} ` +
                `(${pct(val.tournaments, allTournaments)})`,
            );
        });
    });
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
    drawStats(nodes);
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
      .attr("fill", d =>
  highlightedNames.has(d.name) ? "#F39C35" : "#4F83CC"
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

function createNoviceVarsityBreakdown(data) {
  const novices = data.nodes.filter((d) => d.status === "Novice");
  const varsity = new Set(
    data.nodes
      .filter((d) => d.status === "Varsity")
      .map((d) => d.name),
  );

  // Map each novice to the varsity members they've paired with.
  const pairings = new Map(
    novices.map((d) => [d.name, new Map()]),
  );

  data.links.forEach((link) => {
    let novice;
    let varsityName;

    if (pairings.has(link.source) && varsity.has(link.target)) {
      novice = link.source;
      varsityName = link.target;
    } else if (pairings.has(link.target) && varsity.has(link.source)) {
      novice = link.target;
      varsityName = link.source;
    } else {
      return;
    }

    const partners = pairings.get(novice);
        partners.set(
        varsityName,
        (partners.get(varsityName) || 0) + 1,
    );
  });

  const container = d3.select("#novice-varsity-list");
  container.selectAll("*").remove();

  novices
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((novice) => {
      const partners = [...pairings.get(novice.name)]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

      const section = container.append("div").attr("class", "novice-pairing");

      section.append("h3").text(novice.name);

      if (partners.length === 0) {
        section.append("p").text("No varsity pairings");
        return;
      }

      const list = section.append("ul");

      partners.forEach(([name, count]) => {
        list.append("li").text(
          `${name}: ${count} ${count === 1 ? "link" : "links"}`,
        );
      });
    });
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
      createNoviceVarsityBreakdown(pairingData);
    })
    .catch((error) =>
      console.error("Error loading pairing charts:", error),
    );
}

window.addEventListener("load", init);

/* =====================================================================
   Attendance bar chart + breakdowns (from data/attendance.json)
   ===================================================================== */
d3.json("./data/attendance.json")
  .then((rows) => {
    const total = rows.length ? rows[0].total_sessions : 0;
    const margin = { top: 20, right: 30, bottom: 36, left: 150 };
    const width = 900;
    const height = rows.length * 22 + margin.top + margin.bottom;
    let colorBy = "experience";

    const svg = d3
      .select("#attendance-vis")
      .append("svg")
      .attr("viewBox", [0, 0, width, height])
      .attr("style", "max-width: 100%; height: auto;");

    // The axis runs 0 to total sessions, so bar length = share of sessions attended.
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
          `${d.name}\n${d.attended} of ${d.total_sessions} sessions ` +
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
      .text(`Sessions attended (out of ${total})`);

    function recolor() {
      const get = ATTENDANCE_COLOR_OPTIONS[colorBy].get;
      color.domain([...new Set(rows.map(get))].sort());
      bars.attr("fill", (d) => color(get(d)));

      const items = d3
        .select("#attendance-legend")
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

    d3.select("#attendance-colorBy")
      .selectAll("option")
      .data(Object.entries(ATTENDANCE_COLOR_OPTIONS))
      .join("option")
      .attr("value", ([key]) => key)
      .text(([, opt]) => opt.label);
    d3.select("#attendance-colorBy").on("change", function () {
      colorBy = this.value;
      recolor();
    });

    function drawAttendanceStats() {
      const groupings = [
        { label: "gender", get: (d) => d.gender || "Unknown" },
        { label: "experience", get: (d) => d.experience_level },
      ];
      const sections = [
        ...groupings.map((g) => ({
          title: `Club by ${g.label}`,
          get: g.get,
          kind: "club",
        })),
        ...groupings.map((g) => ({
          title: `Attendance by ${g.label}`,
          get: g.get,
          kind: "attendance",
        })),
        {
          title: "Novice attendance by gender",
          get: (d) => d.gender || "Unknown",
          kind: "attendance",
          filter: (d) => d.experience_level === "Novice",
        },
      ];

      const box = d3.select("#attendance-stats");
      box.selectAll("*").remove();
      box
        .style("display", "flex")
        .style("flex-wrap", "wrap")
        .style("gap", "32px")
        .style("margin", "12px 0")
        .style("font", "14px/1.6 sans-serif");

      const pct = (part, whole) =>
        whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%";
      const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

      sections.forEach(({ title, get, kind, filter }) => {
        // Optional filter limits the section to a subset, e.g. only novices.
        const subset = filter ? rows.filter(filter) : rows;
        const allPeople = subset.length;
        const allAttended = d3.sum(subset, (d) => d.attended);

        const groups = d3.rollup(
          subset,
          (v) => ({ people: v.length, attended: d3.sum(v, (d) => d.attended) }),
          get,
        );

        const section = box.append("div");
        section
          .append("div")
          .style("font-weight", "600")
          .style("margin-bottom", "2px")
          .text(title);

        if (groups.size === 0) {
          section.append("div").style("opacity", 0.6).text("No members");
          return;
        }

        const sortKey = kind === "club" ? "people" : "attended";
        [...groups]
          .sort((a, b) => b[1][sortKey] - a[1][sortKey])
          .forEach(([key, val]) => {
            const row = section.append("div");
            row.append("span").style("font-weight", "600").text(`${key}: `);
            const text =
              kind === "club"
                ? `${plural(val.people, "person", "people")} (${pct(val.people, allPeople)})`
                : `${plural(val.people, "person", "people")} – ` +
                  `${plural(val.attended, "session", "sessions")} attended ` +
                  `(${pct(val.attended, allAttended)} of all) – ` +
                  `${pct(val.attended, val.people * total)} average attendance`;
            row.append("span").text(text);
          });
      });
    }

    recolor();
    drawAttendanceStats();
  })
  .catch((error) => console.error("Error loading data:", error));

/* Back button handling */
const pround_pairing = document.getElementById("pround-pairing");
if (pround_pairing) {
  pround_pairing.addEventListener("click", function () {
    window.location.href = "index.html";
  });
}
