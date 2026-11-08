/* =====================================================================
   MDS Tournament Attendance & Pairings Management
   ===================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const tournamentSelect = document.getElementById("tournament-select");
  const tournamentNameInput = document.getElementById("tournament-name");
  const tournamentDateInput = document.getElementById("tournament-date");
  const tournamentDescInput = document.getElementById("tournament-description");

  const memberInputBox = document.getElementById("member-names");
  const currentNameEl = document.getElementById("current-name");
  const debaterAdd = document.getElementById("debater-add");
  const judgeAdd = document.getElementById("judge-add");
  const attendeeAdd = document.getElementById("attendee-add");
  const clearMemberBtn = document.getElementById("clear-member");

  const participantsContainer = document.getElementById("tournament-participants");
  const teamsContainer = document.getElementById("tournament-teams");
  const addTeamBtn = document.getElementById("add-team");
  const saveTournamentBtn = document.getElementById("save-tournament");
  const attendeeCountEl = document.getElementById("attendee-count");

  const proundPairingBtn = document.getElementById("pround-pairing");
  const statisticsBtn = document.getElementById("statistics");

  // State
  let currentTournamentId = null;
  let searchTimer = null;
  let searchRequestId = 0;

  // Initialize date to today (YYYY-MM-DD)
  const today = new Date().toISOString().slice(0, 10);
  if (tournamentDateInput) {
    tournamentDateInput.value = today;
  }

  // Navigation
  if (proundPairingBtn) {
    proundPairingBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }
  if (statisticsBtn) {
    statisticsBtn.addEventListener("click", () => {
      window.location.href = "statistics.html";
    });
  }

  // Load existing tournaments for dropdown
  async function loadTournamentsList(selectedIdToKeep = null) {
    try {
      const res = await fetch("/api/tournaments");
      if (!res.ok) return;
      const tournaments = await res.json();

      tournamentSelect.innerHTML = '<option value="">-- Create New Tournament --</option>';
      tournaments.forEach((t) => {
        const opt = document.createElement("option");
        opt.value = t.id;
        const details = [];
        if (t.date) details.push(t.date);
        if (t.attendeeCount > 0) details.push(`${t.attendeeCount} attendees`);
        opt.textContent = `${t.name} (${details.join(", ")})`;
        tournamentSelect.appendChild(opt);
      });

      if (selectedIdToKeep) {
        tournamentSelect.value = String(selectedIdToKeep);
      }
    } catch (err) {
      console.error("Error loading tournaments list:", err);
    }
  }

  loadTournamentsList();

  // Load a tournament's details when selected
  if (tournamentSelect) {
    tournamentSelect.addEventListener("change", async () => {
      const selectedId = tournamentSelect.value;
      if (!selectedId) {
        // Reset to new tournament mode
        currentTournamentId = null;
        tournamentNameInput.value = "";
        tournamentDateInput.value = today;
        tournamentDescInput.value = "";
        clearAllParticipantsAndTeams();
        return;
      }

      try {
        const res = await fetch(`/api/tournaments/${selectedId}`);
        if (!res.ok) {
          alert("Could not load tournament details.");
          return;
        }
        const data = await res.json();
        currentTournamentId = data.id;
        tournamentNameInput.value = data.name || "";
        tournamentDateInput.value = data.date || today;
        tournamentDescInput.value = data.description || "";

        // Populate attendees and pairs
        populateTournamentData(data);
      } catch (err) {
        console.error("Error loading tournament:", err);
        alert("Error loading tournament details: " + err.message);
      }
    });
  }

  function clearAllParticipantsAndTeams() {
    participantsContainer.innerHTML = "";
    teamsContainer.innerHTML = "";
    updateAttendeeCount();
    // Add default empty team card
    addNewTeamCard();
  }

  function populateTournamentData(data) {
    participantsContainer.innerHTML = "";
    teamsContainer.innerHTML = "";

    const pairedMembers = new Set();

    // Rebuild teams from pairs
    if (data.pairs && data.pairs.length > 0) {
      data.pairs.forEach((p, index) => {
        const teamCard = createTeamCard(index + 1);
        const slots = teamCard.querySelectorAll(".debater-landing-zone");

        if (p.partner1 && p.partner1.name) {
          const chip1 = createDebaterChip("neutral-debater", p.partner1.name, "Debater");
          slots[0].appendChild(chip1);
          pairedMembers.add(p.partner1.name);
        }

        if (p.partner2 && p.partner2.name) {
          const chip2 = createDebaterChip("neutral-debater", p.partner2.name, "Debater");
          slots[1].appendChild(chip2);
          pairedMembers.add(p.partner2.name);
        }

        teamsContainer.appendChild(teamCard);
      });
    } else {
      addNewTeamCard();
    }

    // Populate attendees who are not already slotted in teams
    if (data.attendees) {
      data.attendees.forEach((m) => {
        if (!pairedMembers.has(m.name)) {
          const chip = createDebaterChip("no-pref-debater", m.name, "Attendee");
          participantsContainer.appendChild(chip);
        }
      });
    }

    updateAttendeeCount();
    renumberTeams();
  }

  // Member search
  if (memberInputBox) {
    memberInputBox.addEventListener("input", () => {
      clearTimeout(searchTimer);
      const query = memberInputBox.value.trim();
      const thisRequestId = ++searchRequestId;

      if (!query) {
        currentNameEl.textContent = "";
        setAddButtonsOpacity("0.65");
        return;
      }

      searchTimer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/members/search?q=${encodeURIComponent(query)}`);
          const data = await res.json();
          if (thisRequestId === searchRequestId) {
            currentNameEl.textContent = data[0] || "";
            setAddButtonsOpacity(data[0] ? "1" : "0.65");
          }
        } catch (e) {
          console.error(e);
        }
      }, 300);
    });
  }

  function setAddButtonsOpacity(op) {
    [debaterAdd, judgeAdd, attendeeAdd].forEach((btn) => {
      if (btn) btn.style.opacity = op;
    });
  }

  // Button hover effects on #current-name
  const hoverConfigs = [
    { element: debaterAdd, color: "#DDABDD" },
    { element: judgeAdd, color: "#AFD9AE" },
    { element: attendeeAdd, color: "#F2D4A3" },
  ];

  hoverConfigs.forEach((cfg) => {
    if (cfg.element) {
      cfg.element.addEventListener("mouseenter", () => {
        if (currentNameEl && currentNameEl.textContent !== "") {
          currentNameEl.style.backgroundColor = cfg.color;
        }
      });
      cfg.element.addEventListener("mouseleave", () => {
        if (currentNameEl) {
          currentNameEl.style.backgroundColor = "";
        }
      });
    }
  });

  function clearNameInput() {
    searchRequestId++;
    clearTimeout(searchTimer);
    if (memberInputBox) memberInputBox.value = "";
    if (currentNameEl) {
      currentNameEl.textContent = "";
      currentNameEl.style.backgroundColor = "";
    }
    setAddButtonsOpacity("0.65");
  }

  if (clearMemberBtn) {
    clearMemberBtn.addEventListener("click", clearNameInput);
  }

  function isAlreadyAdded(name) {
    const allChips = document.querySelectorAll(".draggable-debater");
    for (const chip of allChips) {
      if (chip.dataset.name === name) return true;
    }
    return false;
  }

  function getActiveMemberName() {
    const name = currentNameEl ? currentNameEl.textContent.trim() : "";
    if (!name) {
      alert("Please enter a valid member name first!");
      return null;
    }
    return name;
  }

  function createDebaterChip(roleClass, name, roleLabel) {
    const chip = document.createElement("div");
    chip.classList.add("draggable-debater", roleClass);
    chip.setAttribute("draggable", "true");
    chip.dataset.name = name;

    const nameSpan = document.createElement("span");
    nameSpan.textContent = name;
    chip.appendChild(nameSpan);

    if (roleLabel) {
      const tag = document.createElement("span");
      tag.classList.add("debater-tag");
      tag.textContent = `(${roleLabel})`;
      chip.appendChild(tag);
    }

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "x";
    delBtn.setAttribute("aria-label", `Remove ${name}`);
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      chip.remove();
      updateAttendeeCount();
    });
    chip.appendChild(delBtn);

    // Drag events
    chip.addEventListener("dragstart", (e) => {
      chip.classList.add("dragging");
      e.dataTransfer.setData("text/plain", name);
    });

    chip.addEventListener("dragend", () => {
      chip.classList.remove("dragging");
    });

    return chip;
  }

  function addMemberToTournament(roleClass, roleLabel) {
    const name = getActiveMemberName();
    if (!name) return;

    if (isAlreadyAdded(name)) {
      alert(`${name} has already been added to this tournament.`);
      clearNameInput();
      return;
    }

    const chip = createDebaterChip(roleClass, name, roleLabel);
    participantsContainer.appendChild(chip);
    clearNameInput();
    updateAttendeeCount();
  }

  if (debaterAdd) {
    debaterAdd.addEventListener("click", () => addMemberToTournament("neutral-debater", "Debater"));
  }
  if (judgeAdd) {
    judgeAdd.addEventListener("click", () => addMemberToTournament("judge-debater", "Judge"));
  }
  if (attendeeAdd) {
    attendeeAdd.addEventListener("click", () => addMemberToTournament("no-pref-debater", "Attendee"));
  }

  function updateAttendeeCount() {
    if (attendeeCountEl) {
      const allChips = document.querySelectorAll(".draggable-debater");
      const uniqueNames = new Set();
      allChips.forEach((c) => c.dataset.name && uniqueNames.add(c.dataset.name));
      attendeeCountEl.textContent = String(uniqueNames.size);
    }
  }

  // Drag and drop zones
  function wireLandingZone(zone) {
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
    });

    zone.addEventListener("dragenter", (e) => {
      e.preventDefault();
      zone.classList.add("hover");
    });

    zone.addEventListener("dragleave", () => {
      zone.classList.remove("hover");
    });

    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("hover");

      const draggedItem = document.querySelector(".draggable-debater.dragging");
      if (!draggedItem) return;

      // If landing zone already has a chip, send the existing chip back to attendees pool
      const existing = zone.querySelector(".draggable-debater");
      if (existing && existing !== draggedItem) {
        participantsContainer.appendChild(existing);
      }

      zone.appendChild(draggedItem);
      updateAttendeeCount();
    });
  }

  // Also wire participantsContainer to accept chips dragged back out of team slots
  if (participantsContainer) {
    participantsContainer.addEventListener("dragover", (e) => e.preventDefault());
    participantsContainer.addEventListener("dragenter", () => participantsContainer.classList.add("hover"));
    participantsContainer.addEventListener("dragleave", () => participantsContainer.classList.remove("hover"));
    participantsContainer.addEventListener("drop", (e) => {
      e.preventDefault();
      participantsContainer.classList.remove("hover");
      const draggedItem = document.querySelector(".draggable-debater.dragging");
      if (draggedItem) {
        participantsContainer.appendChild(draggedItem);
        updateAttendeeCount();
      }
    });
  }

  // Teams Management
  function createTeamCard(teamNumber) {
    const card = document.createElement("div");
    card.classList.add("team-card");

    const header = document.createElement("div");
    header.classList.add("team-card-header");

    const title = document.createElement("span");
    title.classList.add("team-title");
    title.textContent = `Team ${teamNumber}`;
    header.appendChild(title);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.classList.add("delete-team-button");
    delBtn.textContent = "x";
    delBtn.setAttribute("aria-label", "Remove Team");
    delBtn.addEventListener("click", () => {
      // Return any debaters back to pool before removing
      const chips = card.querySelectorAll(".draggable-debater");
      chips.forEach((c) => participantsContainer.appendChild(c));
      card.remove();
      renumberTeams();
      updateAttendeeCount();
    });
    header.appendChild(delBtn);
    card.appendChild(header);

    const slotsContainer = document.createElement("div");
    slotsContainer.classList.add("team-card-slots");

    const slot1 = document.createElement("div");
    slot1.classList.add("debater-landing-zone");
    slot1.setAttribute("data-placeholder", "Partner 1");
    wireLandingZone(slot1);
    slotsContainer.appendChild(slot1);

    const slot2 = document.createElement("div");
    slot2.classList.add("debater-landing-zone");
    slot2.setAttribute("data-placeholder", "Partner 2");
    wireLandingZone(slot2);
    slotsContainer.appendChild(slot2);

    card.appendChild(slotsContainer);
    return card;
  }

  function renumberTeams() {
    const cards = teamsContainer.querySelectorAll(".team-card");
    cards.forEach((card, idx) => {
      const title = card.querySelector(".team-title");
      if (title) title.textContent = `Team ${idx + 1}`;
    });
  }

  function addNewTeamCard() {
    const count = teamsContainer.querySelectorAll(".team-card").length;
    const card = createTeamCard(count + 1);
    teamsContainer.appendChild(card);
  }

  if (addTeamBtn) {
    addTeamBtn.addEventListener("click", addNewTeamCard);
  }

  // Initialize existing landing zones on initial page load
  document.querySelectorAll(".debater-landing-zone").forEach(wireLandingZone);
  document.querySelectorAll(".delete-team-button").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const card = e.target.closest(".team-card");
      if (card) {
        card.querySelectorAll(".draggable-debater").forEach((c) => participantsContainer.appendChild(c));
        card.remove();
        renumberTeams();
        updateAttendeeCount();
      }
    });
  });

  // Save Tournament Data
  if (saveTournamentBtn) {
    saveTournamentBtn.addEventListener("click", async () => {
      const name = tournamentNameInput ? tournamentNameInput.value.trim() : "";
      const date = tournamentDateInput ? tournamentDateInput.value.trim() : "";
      const description = tournamentDescInput ? tournamentDescInput.value.trim() : "";

      if (!name) {
        alert("Please enter a Tournament Name.");
        if (tournamentNameInput) tournamentNameInput.focus();
        return;
      }

      if (!date) {
        alert("Please select a Tournament Date.");
        if (tournamentDateInput) tournamentDateInput.focus();
        return;
      }

      // Gather attendees
      const attendeeNamesSet = new Set();
      document.querySelectorAll(".draggable-debater").forEach((chip) => {
        if (chip.dataset.name) attendeeNamesSet.add(chip.dataset.name);
      });
      const attendees = Array.from(attendeeNamesSet);

      // Gather pairs
      const pairs = [];
      const teamCards = teamsContainer.querySelectorAll(".team-card");
      for (const card of teamCards) {
        const slots = card.querySelectorAll(".debater-landing-zone");
        const p1Chip = slots[0] ? slots[0].querySelector(".draggable-debater") : null;
        const p2Chip = slots[1] ? slots[1].querySelector(".draggable-debater") : null;

        let p1Name = p1Chip ? p1Chip.dataset.name : null;
        let p2Name = p2Chip ? p2Chip.dataset.name : null;

        // If only partner 2 was filled, treat as partner 1
        if (!p1Name && p2Name) {
          p1Name = p2Name;
          p2Name = null;
        }

        if (p1Name) {
          pairs.push({
            partner1: p1Name,
            partner2: p2Name || null,
          });
        }
      }

      const confirmed = confirm(
        `Are you sure you want to save tournament attendance and pairings for "${name}" on ${date}?\n` +
        `Total attendees: ${attendees.length}\n` +
        `Total teams: ${pairs.length}`
      );
      if (!confirmed) return;

      const payload = {
        id: currentTournamentId,
        name: name,
        date: date,
        description: description,
        attendees: attendees,
        pairs: pairs,
      };

      try {
        const res = await fetch("/api/tournaments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (!res.ok) {
          if (data.notFound && data.notFound.length > 0) {
            alert("These names were not found in the roster:\n" + data.notFound.join(", "));
          } else {
            alert("Error saving tournament: " + (data.message || data.error || "Server error"));
          }
          return;
        }

        alert("Tournament attendance and pairings saved successfully!");
        currentTournamentId = data.tournamentId;

        // Reload dropdown and select the saved tournament
        await loadTournamentsList(data.tournamentId);

      } catch (err) {
        console.error("Save error:", err);
        alert("Failed to save tournament: " + err.message);
      }
    });
  }
});
