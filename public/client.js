const socket = io();
let currentView = 'dashboard';
let latestSummary = [];
let chart = null;

// UI Elements
const dashboardView = document.getElementById('dashboard-view');
const summaryView = document.getElementById('summary-view');
const btnSummary = document.getElementById('btn-summary');
const btnBack = document.getElementById('btn-back');

async function fetchMonitors() {
  const res = await fetch('/api/monitors');
  return res.json();
}

function showView(view) {
  currentView = view;
  if (view === 'dashboard') {
    dashboardView.classList.remove('hidden');
    summaryView.classList.add('hidden');
    btnSummary.classList.remove('hidden');
  } else {
    dashboardView.classList.add('hidden');
    summaryView.classList.remove('hidden');
    btnSummary.classList.add('hidden');
    renderCharts(latestSummary);
  }
}

function renderList(monitors) {
  const container = document.getElementById('list');
  container.innerHTML = '';
  for (const m of monitors) {
    const el = document.createElement('div');
    el.id = `mon-${m.id}`;
    el.className = 'flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-gray-100';
    el.innerHTML = `
      <div class="flex items-center gap-4">
        <div class="w-4 h-4 rounded-full bg-gray-300 shadow-inner" data-dot></div>
        <div>
          <div class="font-bold text-gray-800">${m.name}</div>
          <div class="text-xs text-gray-500 font-mono">${m.url}</div>
        </div>
      </div>
      <div class="text-right">
        <div class="text-sm font-bold text-gray-700" data-latency>—</div>
        <div class="text-[10px] uppercase font-semibold text-gray-400 tracking-tight" data-ts></div>
      </div>
    `;
    container.appendChild(el);
  }
}

function updateMonitor(result) {
  const el = document.getElementById(`mon-${result.id}`);
  if (!el) return;
  const dot = el.querySelector('[data-dot]');
  const lat = el.querySelector('[data-latency]');
  const ts = el.querySelector('[data-ts]');
  
  if (result.status === 'UP') {
    dot.className = 'w-4 h-4 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]';
    if (result.latency > 500) {
      dot.className = 'w-4 h-4 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]';
    }
  } else {
    dot.className = 'w-4 h-4 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]';
  }

  lat.textContent = result.latency != null ? `${result.latency} ms` : 'Offline';
  ts.textContent = new Date(result.timestamp).toLocaleTimeString();
}

function renderCharts(data) {
  const ctx = document.getElementById('latencyChart').getContext('2d');
  
  if (chart) chart.destroy();

  const labels = data.map(r => {
    const mon = document.getElementById(`mon-${r.id}`);
    return mon ? mon.querySelector('.font-bold').textContent : `ID ${r.id}`;
  });
  
  const latencies = data.map(r => r.latency || 0);
  const colors = data.map(r => r.status === 'UP' ? (r.latency > 500 ? '#f59e0b' : '#22c55e') : '#ef4444');

  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Latency (ms)',
        data: latencies,
        backgroundColor: colors,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: '#f3f4f6' } },
        x: { grid: { display: false } }
      }
    }
  });
}

// Event Listeners
btnSummary.addEventListener('click', () => showView('summary'));
btnBack.addEventListener('click', () => showView('dashboard'));

socket.on('connect', () => console.log('connected to socket'));

socket.on('url-update', (r) => {
  updateMonitor(r);
  // Optional: incremental update for chart if in view
});

socket.on('summary-update', (arr) => {
  latestSummary = arr;
  document.getElementById('summary').textContent = JSON.stringify(arr, null, 2);
  for (const r of arr) updateMonitor(r);
  
  if (currentView === 'summary') {
    renderCharts(arr);
  }
});

// init
fetchMonitors().then(renderList).catch(console.error);
