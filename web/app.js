// All requests go to the Javalin server, which is serving this same page
// on http://localhost:7070, so relative paths work fine.

let allMembers = [];      // full roster, loaded once at startup
let currentSessionId = null;

const statusEl = document.getElementById('status-message');

function showStatus(msg, isError = false) {
    statusEl.textContent = msg;
    statusEl.style.color = isError ? 'crimson' : '';
}

// ---------- load roster + build attendance checklist ----------

async function loadMembers() {
    try {
        const res = await fetch('/api/members');
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        allMembers = await res.json();
        renderChecklist();
    } catch (err) {
        showStatus('Could not load members: ' + err.message, true);
    }
}

function renderChecklist() {
    const container = document.getElementById('member-checklist');
    container.innerHTML = '';

    if (allMembers.length === 0) {
        container.innerHTML = '<p class="muted">No members found in roster.db.</p>';
        return;
    }

    allMembers.forEach(m => {
        const label = document.createElement('label');
        label.className = 'checklist-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = m.id;
        checkbox.addEventListener('change', updateStartButtonState);

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(`${m.name}`));
        container.appendChild(label);
    });
}

function getCheckedMemberIds() {
    return Array.from(document.querySelectorAll('#member-checklist input[type=checkbox]:checked'))
        .map(cb => parseInt(cb.value, 10));
}

function updateStartButtonState() {
    document.getElementById('start-session-btn').disabled = getCheckedMemberIds().length === 0;
}

// ---------- create the session ----------

document.getElementById('start-session-btn').addEventListener('click', async () => {
    const attendeeIds = getCheckedMemberIds();
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    try {
        const res = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: today, label: null, attendeeIds })
        });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data = await res.json();
        currentSessionId = data.sessionId;

        showStatus(`Session ${currentSessionId} started with ${attendeeIds.length} attendees.`);

    } catch (err) {
        showStatus('Could not start session: ' + err.message, true);
    }
});

// ---------- Init ----------

loadMembers();