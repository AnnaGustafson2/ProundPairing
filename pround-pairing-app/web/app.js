// All requests go to the Javalin server, which is serving this same page
// on http://localhost:7070, so relative paths work fine.

let allMembers = [];      // full roster, loaded once at startup
let currentSessionId = null;

const statusEl = document.getElementById('status-message');

function showStatus(msg, isError = false) {
    statusEl.textContent = msg;
    statusEl.style.color = isError ? 'crimson' : '';
}

// ---------- Step 1: load roster + build attendance checklist ----------

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
        label.appendChild(document.createTextNode(
            `${m.name}`
        ));
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

// ---------- Step 1 -> Step 2: create the session ----------

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
        populateConstraintDropdowns(attendeeIds);
        document.getElementById('constraints-section').classList.remove('hidden');
        document.getElementById('generate-section').classList.remove('hidden');

    } catch (err) {
        showStatus('Could not start session: ' + err.message, true);
    }
});

// ---------- Step 2: constraints ----------

function populateConstraintDropdowns(attendeeIds) {
    const attendees = allMembers.filter(m => attendeeIds.includes(m.id));
    const selectA = document.getElementById('member-a');
    const selectB = document.getElementById('member-b');

    [selectA, selectB].forEach(select => {
        select.innerHTML = '';
        attendees.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            select.appendChild(opt);
        });
    });
}

document.getElementById('add-constraint-btn').addEventListener('click', async () => {
    const type = document.getElementById('constraint-type').value;
    const memberAId = parseInt(document.getElementById('member-a').value, 10);
    const memberBId = parseInt(document.getElementById('member-b').value, 10);

    if (memberAId === memberBId) {
        showStatus('Pick two different people.', true);
        return;
    }

    try {
        const res = await fetch(`/api/sessions/${currentSessionId}/constraints`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, memberAId, memberBId })
        });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data = await res.json();

        addConstraintToList(data.constraintId, type, memberAId, memberBId);
        showStatus('Constraint added.');

    } catch (err) {
        showStatus('Could not add constraint: ' + err.message, true);
    }
});

function addConstraintToList(constraintId, type, memberAId, memberBId) {
    const nameOf = id => allMembers.find(m => m.id === id)?.name ?? `#${id}`;
    const li = document.createElement('li');
    const verb = type === 'PAIR' ? 'Pair' : 'Keep apart:';
    li.textContent = `${verb} ${nameOf(memberAId)} & ${nameOf(memberBId)} `;

    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.className = 'remove-btn';
    removeBtn.addEventListener('click', async () => {
        try {
            const res = await fetch(`/api/sessions/${currentSessionId}/constraints/${constraintId}`, {
                method: 'DELETE'
            });
            if (!res.ok && res.status !== 204) throw new Error(`Server returned ${res.status}`);
            li.remove();
        } catch (err) {
            showStatus('Could not remove constraint: ' + err.message, true);
        }
    });

    li.appendChild(removeBtn);
    document.getElementById('constraint-list').appendChild(li);
}

// ---------- Step 3: generate ----------

document.getElementById('generate-btn').addEventListener('click', async () => {
    const resultsEl = document.getElementById('results');
    resultsEl.innerHTML = '';

    try {
        const res = await fetch(`/api/sessions/${currentSessionId}/generate`, { method: 'POST' });

        if (res.status === 501) {
            resultsEl.innerHTML = '<p class="muted">Grouping algorithm is not implemented yet — this button is wired up and ready for it.</p>';
            return;
        }
        if (!res.ok) throw new Error(`Server returned ${res.status}`);

        const groups = await res.json();
        renderGroups(groups);

    } catch (err) {
        showStatus('Could not generate groups: ' + err.message, true);
    }
});

function renderGroups(groups) {
    const resultsEl = document.getElementById('results');
    resultsEl.innerHTML = '<pre>' + JSON.stringify(groups, null, 2) + '</pre>';
}

// ---------- Init ----------

loadMembers();