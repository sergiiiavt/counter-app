const state = {
  counter: {
    id: "water",
    name: "Water",
    unit: "ml",
    dailyGoal: 2000,
    presets: [100, 250, 500],
  },
  total: 0,
  entries: [],
};

const elements = {
  total: document.querySelector("#total"),
  goalText: document.querySelector("#goalText"),
  progressBar: document.querySelector("#progressBar"),
  presets: document.querySelector("#presets"),
  customForm: document.querySelector("#customForm"),
  customAmount: document.querySelector("#customAmount"),
  formError: document.querySelector("#formError"),
  history: document.querySelector("#history"),
  emptyState: document.querySelector("#emptyState"),
  entryCount: document.querySelector("#entryCount"),
  status: document.querySelector("#status"),
  refreshButton: document.querySelector("#refreshButton"),
};

function todayLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(iso) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // Keep a useful generic error below.
  }

  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Request failed (${response.status})`);
  }
  return payload;
}

function render() {
  const goal = state.counter.dailyGoal || 0;
  elements.total.innerHTML = `${Math.round(state.total).toLocaleString()} <span>${state.counter.unit}</span>`;
  elements.goalText.textContent = goal
    ? `of ${goal.toLocaleString()} ${state.counter.unit}`
    : "No daily goal";

  const progress = goal ? Math.min((state.total / goal) * 100, 100) : 0;
  elements.progressBar.style.width = `${progress}%`;

  elements.entryCount.textContent = state.entries.length
    ? `${state.entries.length} ${state.entries.length === 1 ? "entry" : "entries"}`
    : "";
  elements.emptyState.hidden = state.entries.length > 0;

  elements.history.replaceChildren();
  for (const entry of state.entries) {
    const item = document.createElement("li");

    const amount = document.createElement("span");
    amount.className = "amount";
    amount.textContent = `+${Math.round(entry.amount)} ${state.counter.unit}`;

    const time = document.createElement("span");
    time.className = "time";
    time.textContent = formatTime(entry.occurredAt);

    const undo = document.createElement("button");
    undo.type = "button";
    undo.className = "undo";
    undo.textContent = "Undo";
    undo.addEventListener("click", () => deleteEntry(entry.id));

    item.append(amount, time, undo);
    elements.history.append(item);
  }
}

async function load() {
  elements.status.textContent = "Loading…";
  elements.refreshButton.disabled = true;

  try {
    const date = todayLocal();
    const [counterPayload, dailyPayload, entriesPayload] = await Promise.all([
      api("/api/counters"),
      api(`/api/daily?counterId=water&date=${encodeURIComponent(date)}`),
      api(`/api/entries?counterId=water&date=${encodeURIComponent(date)}`),
    ]);

    const water = counterPayload.counters.find((counter) => counter.id === "water");
    if (water) state.counter = water;
    state.total = dailyPayload.total;
    state.entries = entriesPayload.entries;
    elements.status.textContent = "";
    render();
  } catch (error) {
    elements.status.textContent = error.message;
  } finally {
    elements.refreshButton.disabled = false;
  }
}

async function addAmount(amount) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 10000) {
    elements.formError.textContent = "Enter an amount from 1 to 10,000 ml.";
    return;
  }

  elements.formError.textContent = "";
  elements.status.textContent = `Adding ${numericAmount} ml…`;

  try {
    await api("/api/entries", {
      method: "POST",
      body: JSON.stringify({
        id: crypto.randomUUID(),
        counterId: "water",
        amount: numericAmount,
        occurredAt: new Date().toISOString(),
        localDate: todayLocal(),
        source: "web",
      }),
    });
    elements.customAmount.value = "";
    await load();
  } catch (error) {
    elements.status.textContent = error.message;
  }
}

async function deleteEntry(id) {
  elements.status.textContent = "Removing entry…";
  try {
    await api(`/api/entries/${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  } catch (error) {
    elements.status.textContent = error.message;
  }
}

elements.presets.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-amount]");
  if (button) addAmount(button.dataset.amount);
});

elements.customForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addAmount(elements.customAmount.value);
});

elements.refreshButton.addEventListener("click", load);

load();
