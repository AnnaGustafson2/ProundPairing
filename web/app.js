/* The following deals with the Input Section */
const memberInputBox = document.getElementById('member-names');

let currentQuery = '';
let timerID;
let searchRequestId = 0;

const neutralAdd = document.getElementById('neutral-add');
const govAdd = document.getElementById('gov-add');
const oppAdd = document.getElementById('opp-add');
const judgeAdd = document.getElementById('judge-add');
const participantsContainer = document.querySelector('.participants-container');

if (memberInputBox) {
    memberInputBox.addEventListener('input', () => {
        clearTimeout(timerID);
        currentQuery = memberInputBox.value;
        const thisRequestId = ++searchRequestId;

        timerID = setTimeout(() => { 
            fetch(`/api/members/search?q=${currentQuery}`)
                .then(response => response.json())
                .then(data => {
                    // Only apply this result if nothing newer has happened since
                    // (another keystroke, or an Add click) while this was in flight.
                    if (thisRequestId === searchRequestId) {
                        document.getElementById("current-name").textContent = data[0] || "";
                        
                        const opacity = data[0] ? "1" : "0.65";

                        govAdd.style.opacity = opacity;
                        neutralAdd.style.opacity = opacity;
                        oppAdd.style.opacity = opacity;
                        judgeAdd.style.opacity = opacity;
                    }
                });
        }, 300);
    });
}

/* The following handles the Add Button(s) */

const hoverConfigs = [
  { element: neutralAdd, color: "#DDABDD" },
  { element: govAdd,     color: "#89CFF0" },
  { element: oppAdd,     color: "#FC968C" },
  { element: judgeAdd,     color: "#AFD9AE" },
];

hoverConfigs.forEach(config => {
  if (config.element) {
    config.element.addEventListener('mouseenter', () => {
        const currentNameEl = document.getElementById("current-name");
        if (currentNameEl && currentNameEl.textContent !== "") {
            currentNameEl.style.backgroundColor = config.color;
        }
    });

    config.element.addEventListener('mouseleave', () => {
        const currentNameEl = document.getElementById("current-name");
        if (currentNameEl) {
            document.getElementById("current-name").style.backgroundColor = "";
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

function clearNameInput() {
    searchRequestId++;
    clearTimeout(timerID);
    if (memberInputBox) memberInputBox.value = '';
    const current_member = document.getElementById("current-name");
    if (current_member) current_member.textContent = "";
}

function addDebater(tag, current_member_name, silent = false) {
    govAdd.style.opacity = "0.65"; 
    neutralAdd.style.opacity = "0.65"; 
    oppAdd.style.opacity = "0.65"; 
    judgeAdd.style.opacity = "0.65"; 

    if (isAlreadyAdded(current_member_name)) {
        if (!silent) {
            alert(`${current_member_name} has already been added.`);
        }
        clearNameInput();
        return;
    }

    const newDebater = document.createElement('div');
    newDebater.classList.add(tag, 'draggable-debater');
    newDebater.setAttribute('draggable', 'true');
    newDebater.dataset.name = current_member_name;

    const name = document.createElement('span');
    name.textContent = current_member_name;

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = 'x';
    deleteButton.setAttribute('aria-label', `Remove ${current_member_name}`);

    if (deleteButton) {
        deleteButton.addEventListener('click', () => {
            newDebater.remove();
        });
    }

    newDebater.appendChild(name);
    newDebater.appendChild(deleteButton);

    participantsContainer.appendChild(newDebater);

    clearNameInput();
}

function getDebaterName() {
    const current_member = document.getElementById("current-name")
    const current_member_name = current_member.textContent;
    if (current_member_name === "") {
        alert("Enter a Member Name!");
        return null;
    }
    else return current_member_name;
}

if (neutralAdd) {
    neutralAdd.addEventListener('click', () => {
        const current_member_name = getDebaterName();
        if (current_member_name != null) {
            addDebater('neutral-debater', current_member_name);
        }
        document.getElementById("current-name").style.backgroundColor = ""; 
    });
}

if (govAdd) {
    govAdd.addEventListener('click', () => {
        const current_member_name = getDebaterName();
        if (current_member_name != null) {
            addDebater('gov-debater', current_member_name);
        }
        document.getElementById("current-name").style.backgroundColor = ""; 
    });
}

if (oppAdd) {
    oppAdd.addEventListener('click', () => {
        const current_member_name = getDebaterName();
        if (current_member_name != null) {
            addDebater('opp-debater', current_member_name);
        }
        document.getElementById("current-name").style.backgroundColor = ""; 
    });
}

if (judgeAdd) {
    judgeAdd.addEventListener('click', () => {
        const current_member_name = getDebaterName();
        if (current_member_name != null) {
            addDebater('judge-debater', current_member_name);
        }
        document.getElementById("current-name").style.backgroundColor = ""; 
    });
}

/* The following handles the draggable drop events */
const draggingContainer = document.getElementById('dragging-container');

function isLandingZone(e1) {
    return e1.classList.contains('debater-landing-zone')
}

function isDraggableDebater(el) {
    return el.classList.contains('draggable-debater');
}

if (draggingContainer) {
    draggingContainer.addEventListener('dragstart', (e) => {
        if (isDraggableDebater(e.target)) {
            e.target.classList.add('dragging');
        }
    });
}

if (draggingContainer) {
    draggingContainer.addEventListener('dragend', (e) => {
        if (isDraggableDebater(e.target)) {
            e.target.classList.remove('dragging');
        }
    });
}

const roundContainer = document.querySelector('.rounds-container');

if (roundContainer) {
    roundContainer.addEventListener('dragover', (e) => {
        if (isLandingZone(e.target)) {
            e.preventDefault();
        }
    });
}

if (roundContainer) {
    roundContainer.addEventListener('dragenter', (e) => {
        if (isLandingZone(e.target)) {
            e.target.classList.add('hover');
        }
    });
}

if (roundContainer) {
    roundContainer.addEventListener('dragleave', (e) => {
        if (isLandingZone(e.target)) {
            e.target.classList.remove('hover');
        }
    });
}

if (roundContainer) {
    roundContainer.addEventListener('drop', (e) => {
        if (isLandingZone(e.target)) {
            e.preventDefault();
            e.target.classList.remove('hover');

            const draggedItem = document.querySelector('.draggable-debater.dragging');
            if (draggedItem) {
                e.target.appendChild(draggedItem);
            }
        }
    });
}

/* The following handles adding and removing rounds */
const roundAdd = document.getElementById('add-round');
if (roundAdd) {
    roundAdd.addEventListener('click', () => {
        const newRound = document.createElement('div');
        newRound.classList.add('round');

        const newSideOne = document.createElement('div');
        newSideOne.classList.add('side-one');
        const newSideTwo = document.createElement('div');
        newSideTwo.classList.add('side-two');

        for (let i = 0; i < 5; i++) {
            const newLandingZone = document.createElement('div');
            newLandingZone.classList.add('debater-landing-zone');

            if (i == 0 | i == 1) {
                newSideOne.appendChild(newLandingZone);
            } else if (i == 3 | i == 4) {
                newSideTwo.appendChild(newLandingZone);
            } else {
            newRound.appendChild(newSideOne);
            newLandingZone.classList.add('judge-box');
            newRound.appendChild(newLandingZone);
            newRound.appendChild(newSideTwo);
            }
        }
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.textContent = 'x';
        deleteButton.setAttribute('aria-label', 'Remove Round');
        
        if (deleteButton) {
            deleteButton.addEventListener('click', () => {
                newRound.remove();
            });
        }

        newRound.appendChild(deleteButton);
        
        roundContainer.prepend(newRound);
    });
}

const delete_round_button = document.querySelector('.delete-round-button');

if (delete_round_button) {
    const round = delete_round_button.closest('.round');
    delete_round_button.addEventListener('click', function() {
    if (round) {
        round.remove(); 
    }
    });
}

/* The following handles saving attendence */
const saveAttendence = document.getElementById('save-attendance');

if (saveAttendence) {
    saveAttendence.addEventListener('click', async function() {
        const confirmed = confirm('Are you sure you want to save attendance for today?');
        if (!confirmed) {
            return;
        }

        let attending = [];
        const debaters = roundContainer.querySelectorAll('.draggable-debater');
            for (const debater of debaters) {
                const name = debater.dataset.name;
                if (name) {
                    attending.push(name);
                }
            }

        const today = new Date().toISOString().slice(0, 10);

        try {
            const res = await fetch('/api/attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: today, label: null, names: attending })
            });

            const data = await res.json();

            if (!res.ok) {
                if (data.notFound && data.notFound.length > 0) {
                    alert('These names were not found in the roster: ' + data.notFound.join(', '));
                } else {
                    alert('Could not save attendance.');
                }
                return;
            }

            console.log('Attendance saved, session ID:', data.sessionId);
            alert('Attendance saved!');

        } catch (err) {
            console.error(err);
            alert('Error saving attendance: ' + err.message);
        }
    });
}

/* The following handles populating the debaters from the spreadsheet */
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
    // Threshold: allow roughly 1 typo per 2 characters, minimum of 2.
    const threshold = Math.max(2, Math.floor(inputName.length / 2));
    if (best && best.distance === 0) return { name: best.name, exact: true };
    if (best && best.distance <= threshold) return { name: best.name, exact: false };
    return null;
}

const populateMembers = document.getElementById('populate-add');
if (populateMembers) {
    populateMembers.addEventListener('click', async function() {
        const res = await fetch('/api/members');
        const roster = await res.json();
        const rosterNames = roster.map(m => m.name);

        const data = await getSheetData();
        data.shift();

        const skipped = [];

        for (const member of data) {
            const importedName = member[1];
            const match = findBestMatch(importedName, rosterNames);

            let resolvedName;

            if (match && match.exact) {
                resolvedName = match.name;
            } else if (match) {
                const confirmed = confirm(
                    `No exact match for "${importedName}". Did you mean "${match.name}"?`
                );
                if (confirmed) {
                    resolvedName = match.name;
                } else {
                    skipped.push(importedName);
                    continue;
                }
            } else {
                skipped.push(importedName);
                continue;
            }

            if (member[3] == "Debate") {
                addDebater('neutral-debater', resolvedName, true);
            } else {
                addDebater('judge-debater', resolvedName, true);
            }
        }

        if (skipped.length > 0) {
            alert('Skipped (no match found in roster):\n' + skipped.join('\n'));
        }
    });
}

async function getSheetData() {
    const response = await fetch(SPREADSHEET_URL);
    const text = await response.text();
    return parseCSV(text);
}

const SHEET_ID = '1bYVDjQ8WVQDM46jdIwnqZqq0IzwBuDG7KlcGgeRw_UI';
const GID = '1616502481';
const SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

function parseCSV(text) {
  return text.split('\n').map(row => {
    return row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(cell => 
      cell.replace(/^"|"$/g, '').trim()
    );
  });
}

const statistics = document.getElementById("statistics");
if (statistics) {
    statistics.addEventListener("click", function() {
        window.location.href = "statistics.html"; 
    });
}