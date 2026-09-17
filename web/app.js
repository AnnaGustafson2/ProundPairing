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
                document.getElementById("current-name").textContent = data[0];
            });
    }, 300);
});

/* The following handles the Add Button */
const neutralAdd = document.getElementById('neutral-add');
const participantsContainer = document.querySelector('.participants-container');
neutralAdd.addEventListener('click', () => {
    const current_member = document.getElementById("current-name").textContent;
    if (current_member === "") {
        alert("Enter a Member Name!");
        return;
    }
    const newDebater = document.createElement('div');
    newDebater.classList.add('neutral-debater');
    newDebater.classList.add('draggable-debater');
    newDebater.textContent = `${current_member}`;
    newDebater.setAttribute('draggable', 'true');
    participantsContainer.appendChild(newDebater);
    document.getElementById("current-name").textContent = "";
    memberInputBox.value = "";
});

/* The following handles the draggable drop events */
participantsContainer.addEventListener('dragstart', (e) => {
    if (e.target.classList.contains('draggable-debater')) {
        e.target.classList.add('dragging');
    }
});

participantsContainer.addEventListener('dragend', (e) => {
    if (e.target.classList.contains('draggable-debater')) {
        e.target.classList.remove('dragging');
    }
});

const roundContainer = document.querySelector('.rounds-container');

roundContainer.addEventListener('dragover', (e) => {
    if (e.target.classList.contains('debater-landing-zone')) {
        e.preventDefault();
    }
});

roundContainer.addEventListener('dragenter', (e) => {
    if (e.target.classList.contains('debater-landing-zone')) {
        e.target.classList.add('hover');
    }
});

roundContainer.addEventListener('dragleave', (e) => {
    if (e.target.classList.contains('debater-landing-zone')) {
        e.target.classList.remove('hover');
    }
});

roundContainer.addEventListener('drop', (e) => {
    if (e.target.classList.contains('debater-landing-zone')) {
        e.preventDefault();
        e.target.classList.remove('hover');

        const draggedItem = document.querySelector('.draggable-debater.dragging');
        if (draggedItem) {
            e.target.appendChild(draggedItem);
        }
    }
});

/* The following handles adding new rounds */
const roundAdd = document.getElementById('add-round');
roundAdd.addEventListener('click', () => {
    const newRound = document.createElement('div');
    const newLandingZone = document.createElement('div');
    newRound.classList.add('round');
    newLandingZone.classList.add('debater-landing-zone');
    newRound.appendChild(newLandingZone);
    roundContainer.appendChild(newRound);
});