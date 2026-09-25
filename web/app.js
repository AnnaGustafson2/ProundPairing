/* The following deals with the Input Section */
const memberInputBox = document.getElementById('member-names');

let currentQuery = '';
let timerID;

memberInputBox.addEventListener('input', () => {
    clearTimeout(timerID);
    currentQuery = memberInputBox.value;

    // debouncing guard
    timerID = setTimeout(() => { 
        fetch(`/api/members/search?q=${currentQuery}`)
            .then(response => response.json())
            .then(data => {
                document.getElementById("current-name").textContent = data[0] || "";
            });
    }, 300);
});

/* The following handles the Add Button(s) */
const neutralAdd = document.getElementById('neutral-add');
const govAdd = document.getElementById('gov-add');
const oppAdd = document.getElementById('opp-add');
const judgeAdd = document.getElementById('judge-add');
const participantsContainer = document.querySelector('.participants-container');

function addDebater(tag, current_member_name) {
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
    
    deleteButton.addEventListener('click', () => {
        newDebater.remove();
    });
    
    newDebater.appendChild(name);
    newDebater.appendChild(deleteButton);

    participantsContainer.appendChild(newDebater);

    const current_member = document.getElementById("current-name");
    current_member.textContent = "";
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

neutralAdd.addEventListener('click', () => {
    const current_member_name = getDebaterName();
    if (current_member_name != null) {
        addDebater('neutral-debater', current_member_name);
    }
});

govAdd.addEventListener('click', () => {
    const current_member_name = getDebaterName();
    if (current_member_name != null) {
        addDebater('gov-debater', current_member_name);
    }
});

oppAdd.addEventListener('click', () => {
    const current_member_name = getDebaterName();
    if (current_member_name != null) {
        addDebater('opp-debater', current_member_name);
    }
});

judgeAdd.addEventListener('click', () => {
    const current_member_name = getDebaterName();
    if (current_member_name != null) {
        addDebater('judge-debater', current_member_name);
    }
});

/* The following handles the draggable drop events */
const draggingContainer = document.getElementById('dragging-container');

function isLandingZone(e1) {
    return e1.classList.contains('debater-landing-zone')
}

function isDraggableDebater(el) {
    return el.classList.contains('draggable-debater');
}

draggingContainer.addEventListener('dragstart', (e) => {
    if (isDraggableDebater(e.target)) {
        e.target.classList.add('dragging');
    }
});

draggingContainer.addEventListener('dragend', (e) => {
    if (isDraggableDebater(e.target)) {
        e.target.classList.remove('dragging');
    }
});

const roundContainer = document.querySelector('.rounds-container');
roundContainer.addEventListener('dragover', (e) => {
    if (isLandingZone(e.target)) {
        e.preventDefault();
    }
});

roundContainer.addEventListener('dragenter', (e) => {
    if (isLandingZone(e.target)) {
        e.target.classList.add('hover');
    }
});

roundContainer.addEventListener('dragleave', (e) => {
    if (isLandingZone(e.target)) {
        e.target.classList.remove('hover');
    }
});

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

/* The following handles adding and removing rounds */
const roundAdd = document.getElementById('add-round');
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
    
    deleteButton.addEventListener('click', () => {
        newRound.remove();
    });

    newRound.appendChild(deleteButton);
    
    roundContainer.prepend(newRound);
});

const button = document.querySelector('.delete-round-button');
const round = button.closest('.round');
button.addEventListener('click', function() {
  round.remove(); 
});

/* The following handles saving attendence */
const saveAttendence = document.getElementById('save-attendance');

saveAttendence.addEventListener('click', async function() {
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

/* The following handles populating the debaters from the spreadsheet */
const populateMembers = document.getElementById('populate-add');

populateMembers.addEventListener('click', async function() {
    const data = await getSheetData();
    data.shift();
    for (const member of data) {
        if (member[2] == "Debating") {
            addDebater('neutral-debater', member[1]);
        } else {
            addDebater('judge-debater', member[1]);
        } 
    }
});

async function getSheetData() {
  try {
    const response = await fetch(SPREADSHEET_URL);
    const csvText = await response.text();
    return parseCSV(csvText);
  } catch (error) {
    console.error('Error fetching the sheet:', error);
    return [];
  }
}

const SHEET_ID = '1RIo3Zv4hGx219aceSZw_Xyhhn_0w1y9gxJRP17H_n7c';
const GID = '1273919032';
const SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

function parseCSV(text) {
  return text.split('\n').map(row => {
    return row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(cell => 
      cell.replace(/^"|"$/g, '').trim()
    );
  });
}