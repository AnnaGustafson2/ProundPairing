/* ==========================================================
   Practice page
   ========================================================== */

/* ---------- Element references ---------- */
const memberInputBox = document.getElementById('member-names');
const currentNameEl = document.getElementById('current-name');

const neutralAdd = document.getElementById('neutral-add');
const govAdd = document.getElementById('gov-add');
const oppAdd = document.getElementById('opp-add');
const judgeAdd = document.getElementById('judge-add');
const noPrefAdd = document.getElementById('no-pref-add');
const addButtons = [neutralAdd, govAdd, oppAdd, judgeAdd, noPrefAdd];

const participantsContainer = document.querySelector('.participants-container');
const roundContainer = document.querySelector('.rounds-container');

const practiceSelect = document.getElementById('practice-select');
const practiceDateInput = document.getElementById('practice-date');
const practiceLabelInput = document.getElementById('practice-label');

/* ---------- State ---------- */
let currentQuery = '';
let timerID;
let searchRequestId = 0;
let currentSessionId = null;

const today = new Date().toISOString().slice(0, 10);
if (practiceDateInput) practiceDateInput.value = today;

/* Role stored in the DB <-> chip color class */
const roleToTag = {
    Debate: 'neutral-debater',
    Judge: 'judge-debater',
    Attendee: 'no-pref-debater',
};

/* ==========================================================
   Member search / input section
   ========================================================== */
function setAddButtonsOpacity(opacity) {
    addButtons.forEach((b) => { if (b) b.style.opacity = opacity; });
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

if (memberInputBox) {
    memberInputBox.addEventListener('input', () => {
        clearTimeout(timerID);
        currentQuery = memberInputBox.value.trim();
        const thisRequestId = ++searchRequestId;

        if (!currentQuery) {
            if (currentNameEl) currentNameEl.textContent = '';
            setAddButtonsOpacity('0.65');
            return;
        }

        timerID = setTimeout(() => {
            fetch(`/api/members/search?q=${encodeURIComponent(currentQuery)}`)
                .then((response) => response.json())
                .then((data) => {
                    // Ignore stale responses (newer keystroke or Add click happened)
                    if (thisRequestId === searchRequestId) {
                        if (currentNameEl) currentNameEl.textContent = data[0] || '';
                        setAddButtonsOpacity(data[0] ? '1' : '0.65');
                    }
                })
                .catch((err) => console.error(err));
        }, 300);
    });
}

/* ==========================================================
   Add buttons
   ========================================================== */
const hoverConfigs = [
    { element: neutralAdd, color: '#DDABDD' },
    { element: govAdd,     color: '#89CFF0' },
    { element: oppAdd,     color: '#FC968C' },
    { element: judgeAdd,   color: '#AFD9AE' },
    { element: noPrefAdd,  color: '#F2D4A3' },
];

hoverConfigs.forEach((config) => {
    if (!config.element) return;

    config.element.addEventListener('mouseenter', () => {
        if (currentNameEl && currentNameEl.textContent !== '') {
            currentNameEl.style.backgroundColor = config.color;
        }
    });

    config.element.addEventListener('mouseleave', () => {
        if (currentNameEl) currentNameEl.style.backgroundColor = '';
    });
});

function isAlreadyAdded(name) {
    return Array.from(document.querySelectorAll('.draggable-debater'))
        .some((el) => el.dataset.name === name);
}

function createChip(tag, name) {
    const chip = document.createElement('div');
    chip.classList.add(tag, 'draggable-debater');
    chip.setAttribute('draggable', 'true');
    chip.dataset.name = name;

    const label = document.createElement('span');
    label.textContent = name;

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = 'x';
    deleteButton.setAttribute('aria-label', `Remove ${name}`);
    deleteButton.addEventListener('click', () => chip.remove());

    chip.appendChild(label);
    chip.appendChild(deleteButton);
    return chip;
}

function addDebater(tag, memberName, silent = false) {
    setAddButtonsOpacity('0.65');

    if (isAlreadyAdded(memberName)) {
        if (!silent) alert(`${memberName} has already been added.`);
        clearNameInput();
        return;
    }

    participantsContainer.appendChild(createChip(tag, memberName));
    clearNameInput();
}

function getDebaterName() {
    const name = currentNameEl ? currentNameEl.textContent.trim() : '';
    if (name === '') {
        alert('Enter a Member Name!');
        return null;
    }
    return name;
}

[
    [neutralAdd, 'neutral-debater'],
    [govAdd,     'gov-debater'],
    [oppAdd,     'opp-debater'],
    [judgeAdd,   'judge-debater'],
    [noPrefAdd,  'no-pref-debater'],
].forEach(([button, tag]) => {
    if (!button) return;
    button.addEventListener('click', () => {
        const name = getDebaterName();
        if (name != null) addDebater(tag, name);
        if (currentNameEl) currentNameEl.style.backgroundColor = '';
    });
});

/* ==========================================================
   Drag and drop
   ========================================================== */
function isDraggableDebater(el) {
    return el.classList && el.classList.contains('draggable-debater');
}

function getLandingZone(el) {
    return el.closest ? el.closest('.debater-landing-zone') : null;
}

/* Chip color follows the box it is dropped into:
   judge box -> judge color; debater slot -> debater color
   (judge/attendee colors become neutral; gov/opp/neutral are kept). */
function syncChipToZone(chip, zone) {
    if (zone.classList.contains('judge-box')) {
        chip.classList.remove('neutral-debater', 'gov-debater', 'opp-debater', 'no-pref-debater');
        chip.classList.add('judge-debater');
    } else if (chip.classList.contains('judge-debater') || chip.classList.contains('no-pref-debater')) {
        chip.classList.remove('judge-debater', 'no-pref-debater');
        chip.classList.add('neutral-debater');
    }
}

document.addEventListener('dragstart', (e) => {
    if (isDraggableDebater(e.target)) e.target.classList.add('dragging');
});

document.addEventListener('dragend', (e) => {
    if (isDraggableDebater(e.target)) e.target.classList.remove('dragging');
});

if (roundContainer) {
    roundContainer.addEventListener('dragover', (e) => {
        if (getLandingZone(e.target)) e.preventDefault();
    });

    roundContainer.addEventListener('dragenter', (e) => {
        const zone = getLandingZone(e.target);
        if (zone) zone.classList.add('hover');
    });

    roundContainer.addEventListener('dragleave', (e) => {
        const zone = getLandingZone(e.target);
        // Ignore leaves that just move onto a child of the same zone
        if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('hover');
    });

    roundContainer.addEventListener('drop', (e) => {
        const zone = getLandingZone(e.target);
        if (!zone) return;

        e.preventDefault();
        zone.classList.remove('hover');

        const draggedItem = document.querySelector('.draggable-debater.dragging');
        if (!draggedItem) return;

        // Debater boxes hold one chip; the judge box can hold several
        if (!zone.classList.contains('judge-box')) {
            const existing = zone.querySelector('.draggable-debater');
            if (existing && existing !== draggedItem) {
                participantsContainer.appendChild(existing);
            }
        }

        zone.appendChild(draggedItem);
        syncChipToZone(draggedItem, zone);
    });
}

/* ==========================================================
   Rounds
   ========================================================== */
function removeRound(round) {
    // Return any debaters/judges in this round to the pool before removing it
    round.querySelectorAll('.draggable-debater').forEach((c) => participantsContainer.appendChild(c));
    round.remove();
}

function createRound() {
    const round = document.createElement('div');
    round.classList.add('round');

    const sideOne = document.createElement('div');
    sideOne.classList.add('side-one');
    const sideTwo = document.createElement('div');
    sideTwo.classList.add('side-two');
    const judgeZone = document.createElement('div');
    judgeZone.classList.add('debater-landing-zone', 'judge-box');

    for (let i = 0; i < 2; i++) {
        const a = document.createElement('div');
        a.classList.add('debater-landing-zone');
        sideOne.appendChild(a);

        const b = document.createElement('div');
        b.classList.add('debater-landing-zone');
        sideTwo.appendChild(b);
    }

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = 'x';
    deleteButton.setAttribute('aria-label', 'Remove Round');
    deleteButton.addEventListener('click', () => removeRound(round));

    round.appendChild(sideOne);
    round.appendChild(judgeZone);
    round.appendChild(sideTwo);
    round.appendChild(deleteButton);
    return round;
}

const roundAdd = document.getElementById('add-round');
if (roundAdd) {
    roundAdd.addEventListener('click', () => roundContainer.prepend(createRound()));
}

// Delete buttons for rounds that already exist in the HTML on page load
document.querySelectorAll('.delete-round-button').forEach((button) => {
    button.addEventListener('click', () => {
        const round = button.closest('.round');
        if (round) removeRound(round);
    });
});

function clearAllChips() {
    document.querySelectorAll('.draggable-debater').forEach((c) => c.remove());
}

function clearAllRounds() {
    document.querySelectorAll('.round').forEach((r) => r.remove());
}

/* ==========================================================
   Loading old practices
   ========================================================== */
async function loadPracticesList(selectedIdToKeep = null) {
    if (!practiceSelect) return;
    try {
        const res = await fetch('/api/attendance');
        if (!res.ok) return;
        const sessions = await res.json();

        practiceSelect.innerHTML = '<option value="">-- New Practice --</option>';
        sessions.forEach((s) => {
            const opt = document.createElement('option');
            opt.value = s.id;
            const details = [s.date];
            if (s.label) details.push(s.label);
            if (s.attendeeCount > 0) details.push(`${s.attendeeCount} attendees`);
            opt.textContent = details.join(' – ');
            practiceSelect.appendChild(opt);
        });

        if (selectedIdToKeep) practiceSelect.value = String(selectedIdToKeep);
    } catch (err) {
        console.error('Error loading practices list:', err);
    }
}
loadPracticesList();

if (practiceSelect) {
    practiceSelect.addEventListener('change', async () => {
        const selectedId = practiceSelect.value;
        clearAllChips();
        clearAllRounds();

        if (!selectedId) {
            currentSessionId = null;
            practiceDateInput.value = today;
            practiceLabelInput.value = '';
            return;
        }

        try {
            const res = await fetch(`/api/attendance/${selectedId}`);
            if (!res.ok) {
                alert('Could not load practice details.');
                return;
            }
            const data = await res.json();
            currentSessionId = data.id;
            practiceDateInput.value = data.date || today;
            practiceLabelInput.value = data.label || '';

            const roleByName = {};
            (data.attendees || []).forEach((m) => { roleByName[m.name] = m.role; });
            const placed = new Set();

            // Chip color is decided by the box it sits in
            const place = (zone, name) => {
                if (!zone || !name) return;
                const tag = zone.classList.contains('judge-box') ? 'judge-debater' : 'neutral-debater';
                zone.appendChild(createChip(tag, name));
                placed.add(name);
            };

            const layout = data.rounds || [];

            layout.forEach((r) => {
                const round = createRound();
                roundContainer.appendChild(round); // keep saved order
                const left = round.querySelectorAll('.side-one .debater-landing-zone');
                const right = round.querySelectorAll('.side-two .debater-landing-zone');
                const judgeZone = round.querySelector('.judge-box');

                (r.side1 || []).forEach((n, i) => place(left[i], n));
                (r.judges || []).forEach((n) => place(judgeZone, n));
                (r.side2 || []).forEach((n, i) => place(right[i], n));
            });

            // Anyone saved but not in a layout (e.g. older practices) goes to the pool
            (data.attendees || []).forEach((m) => {
                if (!placed.has(m.name)) {
                    addDebater(roleToTag[roleByName[m.name]] || 'no-pref-debater', m.name, true);
                }
            });
        } catch (err) {
            console.error('Error loading practice:', err);
            alert('Error loading practice: ' + err.message);
        }
    });
}

/* ==========================================================
   Saving attendance
   ========================================================== */
function chipName(zone) {
    const chip = zone.querySelector('.draggable-debater');
    return chip ? chip.dataset.name : null;
}

const saveAttendance = document.getElementById('save-attendance');

function serializeRounds() {
    return Array.from(roundContainer.querySelectorAll('.round')).map((round) => ({
        side1: Array.from(round.querySelectorAll('.side-one .debater-landing-zone')).map(chipName).filter(Boolean),
        judges: Array.from(round.querySelectorAll('.judge-box .draggable-debater')).map((c) => c.dataset.name),
        side2: Array.from(round.querySelectorAll('.side-two .debater-landing-zone')).map(chipName).filter(Boolean),
    }));
}

if (saveAttendance) {
    saveAttendance.addEventListener('click', async function () {
        const date = practiceDateInput.value.trim();
        const label = practiceLabelInput.value.trim() || null;
        if (!date) { alert('Please select a date.'); return; }

        // Ignore completely empty rounds
        const rounds = serializeRounds().filter((r) => r.side1.length || r.side2.length || r.judges.length);
        if (rounds.length === 0) {
            alert('Place at least one person in a round before saving.');
            return;
        }

        const problems = [];
        if (problems.length) { alert(problems.join('\n')); return; }

        const placed = new Set(rounds.flatMap((r) => [...r.side1, ...r.judges, ...r.side2]));
        const unplaced = participantsContainer.querySelectorAll('.draggable-debater').length;
        const verb = currentSessionId ? 'update' : 'save';
        let msg = `Are you sure you want to ${verb} attendance for ${date}? (${placed.size} in rounds)`;
        if (unplaced > 0) msg += `\n${unplaced} people not in a round will NOT be saved.`;
        if (!confirm(msg)) return;

        try {
            const res = await fetch('/api/attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: currentSessionId, date, label, rounds }),
            });
            const data = await res.json();

            if (!res.ok) {
                if (data.notFound && data.notFound.length > 0) {
                    alert('These names were not found in the roster: ' + data.notFound.join(', '));
                } else {
                    alert(data.message || 'Could not save attendance.');
                }
                return;
            }

            currentSessionId = data.sessionId;
            alert('Attendance saved!');
            await loadPracticesList(data.sessionId);
        } catch (err) {
            console.error(err);
            alert('Error saving attendance: ' + err.message);
        }
    });
}

/* ==========================================================
   Populating debaters from the spreadsheet
   ========================================================== */
const SHEET_ID = '1bYVDjQ8WVQDM46jdIwnqZqq0IzwBuDG7KlcGgeRw_UI';
const GID = '1616502481';
const SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

function levenshteinDistance(a, b) {
    a = a.toLowerCase().trim();
    b = b.toLowerCase().trim();

    const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));

    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    return matrix[a.length][b.length];
}

function findBestMatch(inputName, rosterNames) {
    let best = null;
    for (const rosterName of rosterNames) {
        const distance = levenshteinDistance(inputName, rosterName);
        if (best === null || distance < best.distance) {
            best = { name: rosterName, distance };
        }
    }
    // Allow roughly 1 typo per 2 characters, minimum of 2.
    const threshold = Math.max(2, Math.floor(inputName.length / 2));
    if (best && best.distance === 0) return { name: best.name, exact: true };
    if (best && best.distance <= threshold) return { name: best.name, exact: false };
    return null;
}

function parseCSV(text) {
    return text.split('\n').map((row) =>
        row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((cell) =>
            cell.replace(/^"|"$/g, '').trim()
        )
    );
}

async function getSheetData() {
    const response = await fetch(SPREADSHEET_URL);
    const text = await response.text();
    return parseCSV(text);
}

const populateMembers = document.getElementById('populate-add');
if (populateMembers) {
    populateMembers.addEventListener('click', async function () {
        const res = await fetch('/api/members');
        const roster = await res.json();
        const rosterNames = roster.map((m) => m.name);

        const data = await getSheetData();
        data.shift(); // header row

        const skipped = [];

        for (const member of data) {
            const importedName = member[1];
            if (!importedName) continue;

            const match = findBestMatch(importedName, rosterNames);
            let resolvedName;

            if (match && match.exact) {
                resolvedName = match.name;
            } else if (match) {
                const confirmed = confirm(
                    `No exact match for "${importedName}". Did you mean "${match.name}"?`
                );
                if (!confirmed) {
                    skipped.push(importedName);
                    continue;
                }
                resolvedName = match.name;
            } else {
                skipped.push(importedName);
                continue;
            }

            if (member[3] === 'Debate') {
                addDebater('neutral-debater', resolvedName, true);
            } else if (member[3] === 'Judge') {
                addDebater('judge-debater', resolvedName, true);
            } else {
                addDebater('no-pref-debater', resolvedName, true);
            }
        }

        if (skipped.length > 0) {
            alert('Skipped (no match found in roster):\n' + skipped.join('\n'));
        }
    });
}

/* ==========================================================
   Navigation
   ========================================================== */
const statistics = document.getElementById('statistics');
if (statistics) {
    statistics.addEventListener('click', () => { window.location.href = 'statistics.html'; });
}

const tournamentAttendance = document.getElementById('tournament-attendance');
if (tournamentAttendance) {
    tournamentAttendance.addEventListener('click', () => { window.location.href = 'tournament_attendance.html'; });
}