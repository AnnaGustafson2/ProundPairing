/* The following deals with the Tournament Details */
const tournamentSelect = document.getElementById('tournament-select');
const tournamentNameInput = document.getElementById('tournament-name');
const tournamentDateInput = document.getElementById('tournament-date');
const tournamentDescInput = document.getElementById('tournament-description');

const participantsContainer = document.getElementById('tournament-participants');
const teamsContainer = document.getElementById('tournament-teams');
const attendeeCountEl = document.getElementById('attendee-count');

let currentTournamentId = null;

// Initialize date to today (YYYY-MM-DD)
const today = new Date().toISOString().slice(0, 10);
if (tournamentDateInput) {
    tournamentDateInput.value = today;
}

async function loadTournamentsList(selectedIdToKeep = null) {
    try {
        const res = await fetch('/api/tournaments');
        if (!res.ok) return;
        const tournaments = await res.json();

        tournamentSelect.innerHTML = '<option value="">-- Create New Tournament --</option>';
        tournaments.forEach((t) => {
            const opt = document.createElement('option');
            opt.value = t.id;
            const details = [];
            if (t.date) details.push(t.date);
            if (t.attendeeCount > 0) details.push(`${t.attendeeCount} attendees`);
            opt.textContent = `${t.name} (${details.join(', ')})`;
            tournamentSelect.appendChild(opt);
        });

        if (selectedIdToKeep) {
            tournamentSelect.value = String(selectedIdToKeep);
        }
    } catch (err) {
        console.error('Error loading tournaments list:', err);
    }
}

loadTournamentsList();

function clearAllParticipantsAndTeams() {
    participantsContainer.innerHTML = '';
    teamsContainer.innerHTML = '';
    updateAttendeeCount();
    // Add default empty team card
    addNewTeamCard();
}

function populateTournamentData(data) {
    participantsContainer.innerHTML = '';
    teamsContainer.innerHTML = '';

    const pairedMembers = new Set();

    // Rebuild teams from pairs
    if (data.pairs && data.pairs.length > 0) {
        data.pairs.forEach((p, index) => {
            const teamCard = createTeamCard(index + 1);
            const slots = teamCard.querySelectorAll('.debater-landing-zone');

            if (p.partner1 && p.partner1.name) {
                slots[0].appendChild(createDebaterChip('neutral-debater', p.partner1.name, 'Debater'));
                pairedMembers.add(p.partner1.name);
            }

            if (p.partner2 && p.partner2.name) {
                slots[1].appendChild(createDebaterChip('neutral-debater', p.partner2.name, 'Debater'));
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
                participantsContainer.appendChild(createDebaterChip('no-pref-debater', m.name, 'Attendee'));
            }
        });
    }

    updateAttendeeCount();
    renumberTeams();
}

if (tournamentSelect) {
    tournamentSelect.addEventListener('change', async function() {
        const selectedId = tournamentSelect.value;
        if (!selectedId) {
            // Reset to new tournament mode
            currentTournamentId = null;
            tournamentNameInput.value = '';
            tournamentDateInput.value = today;
            tournamentDescInput.value = '';
            clearAllParticipantsAndTeams();
            return;
        }

        try {
            const res = await fetch(`/api/tournaments/${selectedId}`);
            if (!res.ok) {
                alert('Could not load tournament details.');
                return;
            }
            const data = await res.json();
            currentTournamentId = data.id;
            tournamentNameInput.value = data.name || '';
            tournamentDateInput.value = data.date || today;
            tournamentDescInput.value = data.description || '';

            populateTournamentData(data);
        } catch (err) {
            console.error('Error loading tournament:', err);
            alert('Error loading tournament details: ' + err.message);
        }
    });
}

/* The following deals with the Input Section */
const memberInputBox = document.getElementById('member-names');
const currentNameEl = document.getElementById('current-name');

let currentQuery = '';
let timerID;
let searchRequestId = 0;

const debaterAdd = document.getElementById('debater-add');
const judgeAdd = document.getElementById('judge-add');
const attendeeAdd = document.getElementById('attendee-add');
const clearMemberBtn = document.getElementById('clear-member');

function setAddButtonsOpacity(opacity) {
    if (debaterAdd) debaterAdd.style.opacity = opacity;
    if (judgeAdd) judgeAdd.style.opacity = opacity;
    if (attendeeAdd) attendeeAdd.style.opacity = opacity;
}

if (memberInputBox) {
    memberInputBox.addEventListener('input', () => {
        clearTimeout(timerID);
        currentQuery = memberInputBox.value.trim();
        const thisRequestId = ++searchRequestId;

        if (!currentQuery) {
            currentNameEl.textContent = '';
            setAddButtonsOpacity('0.65');
            return;
        }

        timerID = setTimeout(() => {
            fetch(`/api/members/search?q=${encodeURIComponent(currentQuery)}`)
                .then(response => response.json())
                .then(data => {
                    // Only apply this result if nothing newer has happened since
                    // (another keystroke, or an Add click) while this was in flight.
                    if (thisRequestId === searchRequestId) {
                        currentNameEl.textContent = data[0] || '';
                        setAddButtonsOpacity(data[0] ? '1' : '0.65');
                    }
                })
                .catch(err => console.error(err));
        }, 300);
    });
}

function clearNameInput() {
    searchRequestId++;
    clearTimeout(timerID);
    if (memberInputBox) memberInputBox.value = '';
    if (currentNameEl) {
        currentNameEl.textContent = '';
        currentNameEl.style.backgroundColor = '';
    }
    setAddButtonsOpacity('0.65');
}

if (clearMemberBtn) {
    clearMemberBtn.addEventListener('click', clearNameInput);
}

/* The following handles the Add Button(s) */

const hoverConfigs = [
  { element: debaterAdd,   color: "#DDABDD" },
  { element: judgeAdd,     color: "#AFD9AE" },
  { element: attendeeAdd,  color: "#F2D4A3" },
];

hoverConfigs.forEach(config => {
  if (config.element) {
    config.element.addEventListener('mouseenter', () => {
        if (currentNameEl && currentNameEl.textContent !== "") {
            currentNameEl.style.backgroundColor = config.color;
        }
    });

    config.element.addEventListener('mouseleave', () => {
        if (currentNameEl) {
            currentNameEl.style.backgroundColor = "";
        }
    });
  }
});

function isAlreadyAdded(name) {
    const everywhere = document.querySelectorAll('.draggable-debater');
    for (const el of everywhere) {
        if (el.dataset.name === name) {
            return true;
        }
    }
    return false;
}

function createDebaterChip(tag, current_member_name, roleLabel) {
    const newDebater = document.createElement('div');
    newDebater.classList.add('draggable-debater', tag);
    newDebater.setAttribute('draggable', 'true');
    newDebater.dataset.name = current_member_name;

    const name = document.createElement('span');
    name.textContent = current_member_name;
    newDebater.appendChild(name);

    if (roleLabel) {
        const roleTag = document.createElement('span');
        roleTag.classList.add('debater-tag');
        roleTag.textContent = `(${roleLabel})`;
        newDebater.appendChild(roleTag);
    }

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = 'x';
    deleteButton.setAttribute('aria-label', `Remove ${current_member_name}`);

    if (deleteButton) {
        deleteButton.addEventListener('click', () => {
            newDebater.remove();
            updateAttendeeCount();
        });
    }

    newDebater.appendChild(deleteButton);

    return newDebater;
}

function addDebater(tag, current_member_name, roleLabel) {
    if (isAlreadyAdded(current_member_name)) {
        alert(`${current_member_name} has already been added to this tournament.`);
        clearNameInput();
        return;
    }

    participantsContainer.appendChild(createDebaterChip(tag, current_member_name, roleLabel));

    clearNameInput();
    updateAttendeeCount();
}

function getDebaterName() {
    const current_member_name = currentNameEl ? currentNameEl.textContent.trim() : '';
    if (current_member_name === "") {
        alert("Please enter a valid member name first!");
        return null;
    }
    else return current_member_name;
}

function updateAttendeeCount() {
    if (attendeeCountEl) {
        const everywhere = document.querySelectorAll('.draggable-debater');
        const uniqueNames = new Set();
        everywhere.forEach((el) => el.dataset.name && uniqueNames.add(el.dataset.name));
        attendeeCountEl.textContent = String(uniqueNames.size);
    }
}

if (debaterAdd) {
    debaterAdd.addEventListener('click', () => {
        const current_member_name = getDebaterName();
        if (current_member_name != null) {
            addDebater('neutral-debater', current_member_name, 'Debater');
        }
        currentNameEl.style.backgroundColor = "";
    });
}

if (judgeAdd) {
    judgeAdd.addEventListener('click', () => {
        const current_member_name = getDebaterName();
        if (current_member_name != null) {
            addDebater('judge-debater', current_member_name, 'Judge');
        }
        currentNameEl.style.backgroundColor = "";
    });
}

if (attendeeAdd) {
    attendeeAdd.addEventListener('click', () => {
        const current_member_name = getDebaterName();
        if (current_member_name != null) {
            addDebater('no-pref-debater', current_member_name, 'Attendee');
        }
        currentNameEl.style.backgroundColor = "";
    });
}

/* The following handles the draggable drop events */
function getLandingZone(el) {
    return el.closest ? el.closest('.debater-landing-zone') : null;
}

function isDraggableDebater(el) {
    return el.classList && el.classList.contains('draggable-debater');
}

document.addEventListener('dragstart', (e) => {
    if (isDraggableDebater(e.target)) {
        e.target.classList.add('dragging');
        e.dataTransfer.setData('text/plain', e.target.dataset.name);
    }
});

document.addEventListener('dragend', (e) => {
    if (isDraggableDebater(e.target)) {
        e.target.classList.remove('dragging');
    }
});

// Team slots: each holds one chip; dropping onto a filled slot sends the old chip back to the pool
if (teamsContainer) {
    teamsContainer.addEventListener('dragover', (e) => {
        if (getLandingZone(e.target)) {
            e.preventDefault();
        }
    });

    teamsContainer.addEventListener('dragenter', (e) => {
        const zone = getLandingZone(e.target);
        if (zone) zone.classList.add('hover');
    });

    teamsContainer.addEventListener('dragleave', (e) => {
        const zone = getLandingZone(e.target);
        // Ignore leaves that just move onto a child of the same zone
        if (zone && !zone.contains(e.relatedTarget)) {
            zone.classList.remove('hover');
        }
    });

    teamsContainer.addEventListener('drop', (e) => {
        const zone = getLandingZone(e.target);
        if (!zone) return;

        e.preventDefault();
        zone.classList.remove('hover');

        const draggedItem = document.querySelector('.draggable-debater.dragging');
        if (!draggedItem) return;

        const existing = zone.querySelector('.draggable-debater');
        if (existing && existing !== draggedItem) {
            participantsContainer.appendChild(existing);
        }

        zone.appendChild(draggedItem);
        updateAttendeeCount();
    });
}

// Participants pool: accepts chips dragged back out of team slots
if (participantsContainer) {
    participantsContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    participantsContainer.addEventListener('dragenter', () => {
        participantsContainer.classList.add('hover');
    });

    participantsContainer.addEventListener('dragleave', (e) => {
        if (!participantsContainer.contains(e.relatedTarget)) {
            participantsContainer.classList.remove('hover');
        }
    });

    participantsContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        participantsContainer.classList.remove('hover');

        const draggedItem = document.querySelector('.draggable-debater.dragging');
        if (draggedItem) {
            participantsContainer.appendChild(draggedItem);
            updateAttendeeCount();
        }
    });
}

/* The following handles adding and removing teams */
function removeTeam(team) {
    // Return any debaters in this team to the pool before removing it
    const chips = team.querySelectorAll('.draggable-debater');
    chips.forEach((c) => participantsContainer.appendChild(c));
    team.remove();
    renumberTeams();
    updateAttendeeCount();
}

function renumberTeams() {
    const cards = teamsContainer.querySelectorAll('.team-card');
    cards.forEach((card, idx) => {
        const title = card.querySelector('.team-title');
        if (title) title.textContent = `Team ${idx + 1}`;
    });
}

function createTeamCard(teamNumber) {
    const newTeam = document.createElement('div');
    newTeam.classList.add('team-card');

    const header = document.createElement('div');
    header.classList.add('team-card-header');

    const title = document.createElement('span');
    title.classList.add('team-title');
    title.textContent = `Team ${teamNumber}`;
    header.appendChild(title);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.classList.add('delete-team-button');
    deleteButton.textContent = 'x';
    deleteButton.setAttribute('aria-label', 'Remove Team');

    if (deleteButton) {
        deleteButton.addEventListener('click', () => {
            removeTeam(newTeam);
        });
    }

    header.appendChild(deleteButton);
    newTeam.appendChild(header);

    const slotsContainer = document.createElement('div');
    slotsContainer.classList.add('team-card-slots');

    const slotOne = document.createElement('div');
    slotOne.classList.add('debater-landing-zone');
    slotOne.setAttribute('data-placeholder', 'Partner 1');
    slotsContainer.appendChild(slotOne);

    const slotTwo = document.createElement('div');
    slotTwo.classList.add('debater-landing-zone');
    slotTwo.setAttribute('data-placeholder', 'Partner 2');
    slotsContainer.appendChild(slotTwo);

    newTeam.appendChild(slotsContainer);
    return newTeam;
}

function addNewTeamCard() {
    const count = teamsContainer.querySelectorAll('.team-card').length;
    teamsContainer.appendChild(createTeamCard(count + 1));
}

const addTeamBtn = document.getElementById('add-team');
if (addTeamBtn) {
    addTeamBtn.addEventListener('click', addNewTeamCard);
}

// Delete buttons that already exist in the HTML on page load
document.querySelectorAll('.delete-team-button').forEach((button) => {
    button.addEventListener('click', () => {
        const team = button.closest('.team-card');
        if (team) removeTeam(team);
    });
});

/* The following handles saving the tournament */
const saveTournament = document.getElementById('save-tournament');

if (saveTournament) {
    saveTournament.addEventListener('click', async function() {
        const tournamentName = tournamentNameInput ? tournamentNameInput.value.trim() : '';
        const tournamentDate = tournamentDateInput ? tournamentDateInput.value.trim() : '';
        const description = tournamentDescInput ? tournamentDescInput.value.trim() : '';

        if (!tournamentName) {
            alert('Please enter a Tournament Name.');
            if (tournamentNameInput) tournamentNameInput.focus();
            return;
        }

        if (!tournamentDate) {
            alert('Please select a Tournament Date.');
            if (tournamentDateInput) tournamentDateInput.focus();
            return;
        }

        // Gather attendees
        let attendees = [];
        const debaters = document.querySelectorAll('.draggable-debater');
        for (const debater of debaters) {
            const name = debater.dataset.name;
            if (name && !attendees.includes(name)) {
                attendees.push(name);
            }
        }

        // Gather pairs
        let pairs = [];
        const teamCards = teamsContainer.querySelectorAll('.team-card');
        for (const card of teamCards) {
            const slots = card.querySelectorAll('.debater-landing-zone');
            const p1Chip = slots[0] ? slots[0].querySelector('.draggable-debater') : null;
            const p2Chip = slots[1] ? slots[1].querySelector('.draggable-debater') : null;

            let p1Name = p1Chip ? p1Chip.dataset.name : null;
            let p2Name = p2Chip ? p2Chip.dataset.name : null;

            // If only partner 2 was filled, treat as partner 1
            if (!p1Name && p2Name) {
                p1Name = p2Name;
                p2Name = null;
            }

            if (p1Name) {
                pairs.push({ partner1: p1Name, partner2: p2Name || null });
            }
        }

        const confirmed = confirm(
            `Are you sure you want to save tournament attendance and pairings for "${tournamentName}" on ${tournamentDate}?\n` +
            `Total attendees: ${attendees.length}\n` +
            `Total teams: ${pairs.length}`
        );
        if (!confirmed) {
            return;
        }

        try {
            const res = await fetch('/api/tournaments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: currentTournamentId,
                    name: tournamentName,
                    date: tournamentDate,
                    description: description,
                    attendees: attendees,
                    pairs: pairs
                })
            });

            const data = await res.json();

            if (!res.ok) {
                if (data.notFound && data.notFound.length > 0) {
                    alert('These names were not found in the roster:\n' + data.notFound.join(', '));
                } else {
                    alert('Error saving tournament: ' + (data.message || data.error || 'Server error'));
                }
                return;
            }

            alert('Tournament attendance and pairings saved successfully!');
            currentTournamentId = data.tournamentId;

            // Reload dropdown and select the saved tournament
            await loadTournamentsList(data.tournamentId);

        } catch (err) {
            console.error('Save error:', err);
            alert('Failed to save tournament: ' + err.message);
        }
    });
}

/* The following handles navigation */
const proundPairing = document.getElementById('pround-pairing');
if (proundPairing) {
    proundPairing.addEventListener('click', function() {
        window.location.href = 'index.html';
    });
}

const statistics = document.getElementById('statistics');
if (statistics) {
    statistics.addEventListener('click', function() {
        window.location.href = 'statistics.html';
    });
}