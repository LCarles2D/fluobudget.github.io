// Configuración y Constantes
const BUDGET = 30.0;
const CAFE_UNIT = 0.35;
const STORAGE_PRODUCTS = 'custom_products_30';
const STORAGE_EXPENSES = 'astro_expenses_30';

const DEFAULT_PRODUCTS = [
  { id: 'p1', name: 'Pasaje Ida', price: 2.15, icon: '🚌' },
  { id: 'p2', name: 'Pasaje Vuelta', price: 1.90, icon: '🚌' },
  { id: 'p3', name: 'Cenas con Amigos', price: 1.70, icon: '🍽️' },
  { id: 'p4', name: 'Café Tarde', price: 0.35, icon: '☕' },
  { id: 'p5', name: 'Almuerzo Lunes', price: 2.00, icon: '🥗' },
  { id: 'p6', name: 'Súper Mercado', price: 8.50, icon: '🛒' },
  { id: 'p7', name: 'Salida Novia', price: 5.00, icon: '💑' },
];

let products = loadProducts();
let expenses = loadExpenses();
let selectedProduct = null;
let editingId = null;
let activeTabId = 'tabRegister';

// Instancias de Chart.js
let burnDownChartInstance = null;
let categoryChartInstance = null;
let cvTrendChartInstance = null;

if (typeof window !== 'undefined' && window.Chart) {
  window.Chart.defaults.font.family = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";
}

function refreshIcons() {
  if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function loadProducts() {
  try {
    const s = localStorage.getItem(STORAGE_PRODUCTS);
    if (!s) return JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
  }
}

function saveProducts() {
  try {
    localStorage.setItem(STORAGE_PRODUCTS, JSON.stringify(products));
  } catch (err) {
    console.error('Error guardando productos:', err);
  }
}

function loadExpenses() {
  try {
    const s = localStorage.getItem(STORAGE_EXPENSES);
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

function saveExpenses() {
  try {
    localStorage.setItem(STORAGE_EXPENSES, JSON.stringify(expenses));
  } catch (err) {
    console.error('Error guardando gastos:', err);
  }
}

function genId() {
  return Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

// Toast feedback
let toastTimer = null;
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  if (toastTimer) clearTimeout(toastTimer);

  toast.textContent = msg;
  toast.className = 'toast toast--' + type;
  toastTimer = setTimeout(() => {
    toast.className = 'toast hidden';
  }, 2800);
}

// ================= CONTROLADOR DE PESTAÑAS =================
function setupTabs() {
  const navButtons = document.querySelectorAll('.nav-btn');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      if (!targetTab || targetTab === activeTabId) return;

      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.tab-view').forEach(view => {
        view.classList.add('hidden');
      });

      const activeView = document.getElementById(targetTab);
      if (activeView) activeView.classList.remove('hidden');
      activeTabId = targetTab;

      if (targetTab === 'tabAnalytics') {
        requestAnimationFrame(() => {
          renderAnalyticsCharts();
          refreshIcons();
        });
      } else if (targetTab === 'tabHistory') {
        renderFullHistory();
        refreshIcons();
      } else {
        refreshIcons();
      }
    });
  });
}

// ================= CÁLCULO DE DASHBOARD EVM =================
function updateDashboard() {
  // 1. Total gastado real (AC - Actual Cost)
  const totalAC = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const remaining = BUDGET - totalAC;

  // 2. Control de categorías y presupuestos
  // Cada producto tiene un presupuesto semanal asignado (p.price).
  // Si en una categoría se gasta más de lo presupuestado, se genera un SOBRECOSTO real.
  // Si se gasta menos o igual, el gasto es un consumo parcial normal y NO genera un falso ahorro anticipado.
  let totalOverspending = 0;
  let totalCategoryBudget = 0;
  let totalEV = 0;

  products.forEach(p => {
    totalCategoryBudget += p.price;
    const spentOnP = expenses
      .filter(e => e.productId === p.id)
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    if (spentOnP > p.price) {
      const over = spentOnP - p.price;
      totalOverspending += over;
      totalEV += p.price; // Solo reconoce hasta el presupuesto asignado
    } else {
      totalEV += spentOnP; // Dentro de lo presupuestado
    }
  });

  // Gastos no asignados a ningún producto registrado
  const knownProductIds = new Set(products.map(p => p.id));
  const unassignedExpenses = expenses.filter(e => !e.productId || !knownProductIds.has(e.productId));
  const unassignedTotal = unassignedExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  totalOverspending += unassignedTotal;

  // CV (Cost Variance): 0 si vas dentro de presupuesto, negativo si te has excedido en alguna categoría
  const cv = -totalOverspending;
  const cpi = totalAC > 0 ? (totalEV / totalAC) : 1.0;

  setMetric('acValue', '$' + totalAC.toFixed(2));
  setMetric('remainingValue', '$' + remaining.toFixed(2), remaining < 5 ? 'negative' : remaining < 10 ? 'warn' : 'positive');

  if (Math.abs(cv) < 0.0001) {
    setMetric('cvValue', '$0.00', '');
  } else {
    setMetric('cvValue', '-$' + Math.abs(cv).toFixed(2), 'negative');
  }

  setMetric('cpiValue', cpi.toFixed(2), totalAC === 0 ? '' : cpi < 0.999 ? 'negative' : 'positive');

  // Valores de resumen en pestaña de análisis
  const summaryEV = document.getElementById('summaryEV');
  const summaryAC = document.getElementById('summaryAC');
  const summaryCV = document.getElementById('summaryCV');
  if (summaryEV) summaryEV.textContent = '$' + BUDGET.toFixed(2);
  if (summaryAC) summaryAC.textContent = '$' + totalAC.toFixed(2);
  if (summaryCV) {
    if (Math.abs(cv) < 0.0001) {
      summaryCV.textContent = '$0.00 (Al día)';
      summaryCV.style.color = 'var(--text)';
    } else {
      summaryCV.textContent = '-$' + Math.abs(cv).toFixed(2) + ' (Sobrecosto)';
      summaryCV.style.color = 'var(--danger)';
    }
  }

  const recBox = document.getElementById('recommendationBox');
  if (recBox) {
    const recIcon = recBox.querySelector('.rec-icon');
    const recText = recBox.querySelector('.rec-text');

    if (cv < -0.0001) {
      const deficit = Math.abs(cv).toFixed(2);
      const cafesToCut = Math.ceil(Math.abs(cv) / CAFE_UNIT);

      const overspentCats = products
        .map(p => {
          const spent = expenses.filter(e => e.productId === p.id).reduce((s, e) => s + (Number(e.amount) || 0), 0);
          return { name: p.name, over: spent - p.price };
        })
        .filter(c => c.over > 0.0001);

      let catNames = overspentCats.map(c => c.name + ' (+$' + c.over.toFixed(2) + ')').join(', ');
      if (!catNames && unassignedTotal > 0) catNames = 'Gastos adicionales sin categoría';

      if (recIcon) recIcon.innerHTML = '<i data-lucide="alert-triangle"></i>';
      if (recText) {
        recText.innerHTML = '<strong>Sobrecosto detectado (-$' + deficit + '):</strong> Te has excedido en: <em>' + catNames + '</em>.<br>👉 <em>Sugerencia de ahorro:</em> Recorta <strong>' + cafesToCut + ' café(s) ☕</strong> ($0.35 c/u) para volver a equilibrar tu semana.';
      }
      recBox.style.borderLeftColor = 'var(--danger)';
    } else if (totalAC > 0) {
      if (recIcon) recIcon.innerHTML = '<i data-lucide="check-circle-2"></i>';
      if (recText) {
        recText.innerHTML = '<strong>¡Vas al día!:</strong> Llevas gastados $' + totalAC.toFixed(2) + ' de tus $' + BUDGET.toFixed(2) + ' y todas tus categorías están dentro del presupuesto asignado.';
      }
      recBox.style.borderLeftColor = 'var(--success)';
    } else {
      if (recIcon) recIcon.innerHTML = '<i data-lucide="thumbs-up"></i>';
      if (recText) {
        recText.innerHTML = '<strong>Línea Base Lista:</strong> Presupuesto de $' + BUDGET.toFixed(2) + ' disponible para toda la semana. ¡Registra tus gastos conforme ocurran!';
      }
      recBox.style.borderLeftColor = 'var(--accent)';
    }
  }

  renderTodayExpenseLog();
  renderFullHistory();
  saveExpenses();
  refreshIcons();

  if (activeTabId === 'tabAnalytics') {
    renderAnalyticsCharts();
  }
}

function setMetric(id, value, className) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
  el.className = 'metric-value' + (className ? ' ' + className : '');
}

// ================= PRODUCT GRID =================
function renderProductGrid() {
  const grid = document.getElementById('productGrid');
  const badge = document.getElementById('productCount');
  if (!grid) return;
  if (badge) badge.textContent = products.length + ' producto' + (products.length !== 1 ? 's' : '');

  grid.innerHTML = products.map(p => {
    const spentOnProduct = expenses
      .filter(e => e.productId === p.id)
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const remainingCat = p.price - spentOnProduct;

    let statusClass = 'status--ok';
    let statusText = 'Restan $' + remainingCat.toFixed(2);

    if (remainingCat < 0) {
      statusClass = 'status--over';
      statusText = 'Excedido $' + Math.abs(remainingCat).toFixed(2);
    } else if (remainingCat === 0 && spentOnProduct > 0) {
      statusClass = 'status--zero';
      statusText = 'Restan $0.00';
    }

    return '<button class="product-card" data-id="' + p.id + '" role="listitem" aria-label="Registrar gasto para ' + p.name + '" type="button">' +
      '<span class="pc-icon">' + (p.icon || '🏷️') + '</span>' +
      '<span class="pc-name">' + p.name + '</span>' +
      '<span class="pc-base">Presupuesto: $' + p.price.toFixed(2) + '</span>' +
      '<span class="pc-status ' + statusClass + '">' + statusText + '</span>' +
      '</button>';
  }).join('');

  grid.querySelectorAll('.product-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const product = products.find(p => p.id === btn.dataset.id);
      if (product) openConfirmPanel(product);
    });
  });
}

// ================= CONFIRM PANEL =================
function openConfirmPanel(product) {
  selectedProduct = product;
  const iconEl = document.getElementById('confirmProductIcon');
  const nameEl = document.getElementById('confirmProductName');
  const baseEl = document.getElementById('confirmBasePrice');
  const amountInput = document.getElementById('confirmAmount');
  const panel = document.getElementById('confirmPanel');

  const alreadySpent = expenses
    .filter(e => e.productId === product.id)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const remainingCat = product.price - alreadySpent;

  if (iconEl) iconEl.textContent = product.icon || '🏷️';
  if (nameEl) nameEl.textContent = product.name;
  if (baseEl) {
    if (remainingCat >= 0) {
      baseEl.textContent = 'Presupuesto: $' + product.price.toFixed(2) + ' · Restan: $' + remainingCat.toFixed(2);
    } else {
      baseEl.textContent = 'Presupuesto: $' + product.price.toFixed(2) + ' · Excedido en: $' + Math.abs(remainingCat).toFixed(2);
    }
  }

  if (amountInput) {
    if (alreadySpent === 0) {
      amountInput.value = product.price.toFixed(2);
    } else if (remainingCat > 0) {
      amountInput.value = remainingCat.toFixed(2);
    } else {
      amountInput.value = '';
    }
    amountInput.placeholder = '0.00';
  }

  if (panel) {
    panel.classList.remove('hidden');
  }

  if (amountInput) {
    amountInput.focus();
    amountInput.select();
  }

  document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected'));
  const selCard = document.querySelector('.product-card[data-id="' + product.id + '"]');
  if (selCard) selCard.classList.add('selected');
}

function closeConfirmPanel() {
  const panel = document.getElementById('confirmPanel');
  if (panel) panel.classList.add('hidden');
  selectedProduct = null;
  document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected'));
}

// ================= HISTORIALES =================
function formatDayTitle(isoString) {
  const dt = new Date(isoString);
  return dt.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
}

function renderLogItemHTML(item) {
  const dt = new Date(item.date);
  const time = dt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const amount = Number(item.amount) || 0;

  const product = products.find(p => p.id === item.productId);
  const catBudget = product ? product.price : (Number(item.categoryBudget) || 0);

  const totalSpentInCat = expenses
    .filter(e => e.productId === item.productId)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const remainingInCat = catBudget - totalSpentInCat;

  let badgeHTML = '';
  let detailText = '';

  if (product) {
    if (remainingInCat < -0.0001) {
      badgeHTML = '<span class="diff diff--over">Excedido +$' + Math.abs(remainingInCat).toFixed(2) + '</span>';
      detailText = time + ' · Total ' + product.name + ': $' + totalSpentInCat.toFixed(2) + ' (Cupo: $' + catBudget.toFixed(2) + ')';
    } else {
      badgeHTML = '<span class="diff diff--exact">Restan $' + remainingInCat.toFixed(2) + '</span>';
      detailText = time + ' · Quedan $' + remainingInCat.toFixed(2) + ' de $' + catBudget.toFixed(2) + ' en ' + product.name;
    }
  } else {
    badgeHTML = '<span class="diff diff--exact">Registrado</span>';
    detailText = time + ' · Gasto de ' + item.productName;
  }

  return '<div class="log-item" data-id="' + item.id + '">' +
    '<span class="log-icon">' + (item.productIcon || '🏷️') + '</span>' +
    '<div class="log-info">' +
    '<div class="log-name-row">' +
    '<span class="log-name">' + item.productName + '</span>' +
    badgeHTML +
    '</div>' +
    '<span class="log-date">' + detailText + '</span>' +
    '</div>' +
    '<span class="log-amount">$' + amount.toFixed(2) + '</span>' +
    '<button class="delete-expense-btn" data-id="' + item.id + '" aria-label="Eliminar gasto ' + item.productName + '" type="button"><i data-lucide="trash-2"></i></button>' +
    '</div>';
}

// 1. Historial del Día Actual
function renderTodayExpenseLog() {
  const log = document.getElementById('todayExpenseLog');
  const badge = document.getElementById('todaySpentBadge');
  if (!log) return;

  const todayDateKey = new Date().toDateString();
  const todayItems = expenses.filter(item => new Date(item.date).toDateString() === todayDateKey);
  const totalToday = todayItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  if (badge) badge.textContent = 'Total hoy: $' + totalToday.toFixed(2);

  if (todayItems.length === 0) {
    log.innerHTML = '<p class="empty-state">Sin gastos registrados el día de hoy.</p>';
    return;
  }

  log.innerHTML = todayItems.slice().reverse().map(renderLogItemHTML).join('');
  attachDeleteEvents(log);
}

// 2. Historial Semanal Completo Agrupado por Días
function renderFullHistory() {
  const log = document.getElementById('fullExpenseLog');
  if (!log) return;

  if (expenses.length === 0) {
    log.innerHTML = '<p class="empty-state">Sin gastos registrados esta semana.</p>';
    return;
  }

  const groups = {};
  expenses.slice().reverse().forEach(item => {
    const dateObj = new Date(item.date);
    const dateKey = dateObj.getFullYear() + '-' + String(dateObj.getMonth() + 1).padStart(2, '0') + '-' + String(dateObj.getDate()).padStart(2, '0');
    if (!groups[dateKey]) {
      groups[dateKey] = {
        title: formatDayTitle(item.date),
        items: [],
        total: 0
      };
    }
    groups[dateKey].items.push(item);
    groups[dateKey].total += (Number(item.amount) || 0);
  });

  const sortedKeys = Object.keys(groups).sort().reverse();

  log.innerHTML = sortedKeys.map(k => {
    const group = groups[k];
    return '<div class="expense-day-group">' +
      '<div class="day-group-header">' +
      '<span class="day-group-title"><i data-lucide="calendar"></i> ' + group.title + '</span>' +
      '<span class="day-group-total">Subtotal: $' + group.total.toFixed(2) + '</span>' +
      '</div>' +
      '<div class="expense-log">' +
      group.items.map(renderLogItemHTML).join('') +
      '</div>' +
      '</div>';
  }).join('');

  attachDeleteEvents(log);
  refreshIcons();
}

function attachDeleteEvents(container) {
  container.querySelectorAll('.delete-expense-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      expenses = expenses.filter(item => item.id !== id);
      updateDashboard();
      renderProductGrid();
      showToast('Gasto eliminado', 'info');
    });
  });
}

// ================= DASHBOARD ANALÍTICO: CHART.JS =================
function renderAnalyticsCharts() {
  if (typeof window === 'undefined' || !window.Chart) return;
  renderBurnDownChart();
  renderCategoryComparisonChart();
  renderCvTrendChart();
}

// Agrupa gastos por día de la semana (Lunes = 0, Domingo = 6)
function getWeeklyDailyData() {
  const dailyAC = [0, 0, 0, 0, 0, 0, 0];

  expenses.forEach(item => {
    const dt = new Date(item.date);
    const dayIndex = (dt.getDay() + 6) % 7; // Lunes = 0 ... Domingo = 6
    const amount = Number(item.amount) || 0;
    dailyAC[dayIndex] += amount;
  });

  return { dailyAC };
}

// a) Gráfica Burn-Down (Línea): Presupuesto restante día a día
function renderBurnDownChart() {
  const ctx = document.getElementById('burnDownChart');
  if (!ctx || !window.Chart) return;

  const { dailyAC } = getWeeklyDailyData();

  let currentRemaining = BUDGET;
  const burnDownValues = [];

  for (let i = 0; i < 7; i++) {
    currentRemaining -= dailyAC[i];
    burnDownValues.push(Math.max(0, parseFloat(currentRemaining.toFixed(2))));
  }

  if (burnDownChartInstance) {
    burnDownChartInstance.destroy();
    burnDownChartInstance = null;
  }

  burnDownChartInstance = new window.Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
      datasets: [
        {
          label: 'Presupuesto Restante ($)',
          data: burnDownValues,
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.12)',
          fill: true,
          tension: 0.3,
          borderWidth: 3,
          pointBackgroundColor: '#38bdf8',
          pointRadius: 4,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => ' Restante: $' + c.parsed.y.toFixed(2)
          }
        }
      },
      scales: {
        y: {
          min: 0,
          max: BUDGET,
          ticks: {
            color: '#94a3b8',
            callback: (v) => '$' + Number(v).toFixed(2)
          },
          grid: { color: 'rgba(255, 255, 255, 0.06)' }
        },
        x: {
          ticks: { color: '#cbd5e1' },
          grid: { color: 'transparent' }
        }
      }
    }
  });
}

// b) Gráfico de Barras: Presupuesto Asignado vs Gasto Real por Categoría
function renderCategoryComparisonChart() {
  const ctx = document.getElementById('categoryComparisonChart');
  if (!ctx || !window.Chart) return;

  const catLabels = products.map(p => p.name);
  const evValues = products.map(p => p.price);
  const acValues = products.map(p => {
    return expenses
      .filter(e => e.productId === p.id)
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  });

  if (categoryChartInstance) {
    categoryChartInstance.destroy();
    categoryChartInstance = null;
  }

  categoryChartInstance = new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels: catLabels,
      datasets: [
        {
          label: 'Presupuestado',
          data: evValues,
          backgroundColor: 'rgba(99, 102, 241, 0.75)',
          borderColor: '#6366f1',
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: 'Gasto Real',
          data: acValues,
          backgroundColor: 'rgba(56, 189, 248, 0.75)',
          borderColor: '#38bdf8',
          borderWidth: 1,
          borderRadius: 4,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#cbd5e1', font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: (c) => ' ' + c.dataset.label + ': $' + c.parsed.y.toFixed(2)
          }
        }
      },
      scales: {
        y: {
          ticks: {
            color: '#94a3b8',
            callback: (v) => '$' + Number(v).toFixed(2)
          },
          grid: { color: 'rgba(255, 255, 255, 0.06)' }
        },
        x: {
          ticks: { color: '#cbd5e1', font: { size: 10 } },
          grid: { color: 'transparent' }
        }
      }
    }
  });
}

// c) Tendencia de Sobrecostos / Desviación Acumulada
function renderCvTrendChart() {
  const ctx = document.getElementById('cvTrendChart');
  if (!ctx || !window.Chart) return;

  // Calculamos para cada día de la semana si hubo sobrecostos acumulados
  const cvTrend = [];
  for (let day = 0; day < 7; day++) {
    const expensesUpToDay = expenses.filter(e => {
      const dt = new Date(e.date);
      const dayIdx = (dt.getDay() + 6) % 7;
      return dayIdx <= day;
    });

    let overspend = 0;
    products.forEach(p => {
      const spent = expensesUpToDay.filter(e => e.productId === p.id).reduce((s, e) => s + (Number(e.amount) || 0), 0);
      if (spent > p.price) overspend += (spent - p.price);
    });

    cvTrend.push(parseFloat((-overspend).toFixed(2)));
  }

  const badge = document.getElementById('cvTrendBadge');
  const lastCV = cvTrend[cvTrend.length - 1];
  if (badge) {
    if (Math.abs(lastCV) < 0.0001) {
      badge.textContent = 'Al día ($0.00)';
      badge.style.color = '#86efac';
    } else {
      badge.textContent = 'Sobrecosto: -$' + Math.abs(lastCV).toFixed(2);
      badge.style.color = '#fca5a5';
    }
  }

  if (cvTrendChartInstance) {
    cvTrendChartInstance.destroy();
    cvTrendChartInstance = null;
  }

  cvTrendChartInstance = new window.Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
      datasets: [
        {
          label: 'Desviación de Costo ($)',
          data: cvTrend,
          borderColor: lastCV < -0.0001 ? '#ef4444' : '#22c55e',
          backgroundColor: lastCV < -0.0001 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
          fill: true,
          tension: 0.3,
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: lastCV < -0.0001 ? '#ef4444' : '#22c55e'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => {
              const val = c.parsed.y;
              if (Math.abs(val) < 0.0001) return ' Estado: Al día ($0.00)';
              return ' Sobrecosto: -$' + Math.abs(val).toFixed(2);
            }
          }
        }
      },
      scales: {
        y: {
          suggestedMin: -5,
          suggestedMax: 0,
          ticks: {
            color: '#94a3b8',
            callback: (v) => {
              const num = Number(v);
              if (Math.abs(num) < 0.0001) return '$0.00';
              return '-$' + Math.abs(num).toFixed(2);
            }
          },
          grid: { color: 'rgba(255, 255, 255, 0.06)' }
        },
        x: {
          ticks: { color: '#cbd5e1' },
          grid: { color: 'transparent' }
        }
      }
    }
  });
}

// ================= MODAL ADMINISTRAR PRODUCTOS =================
function openProductsModal() {
  const modal = document.getElementById('productsModal');
  if (modal) modal.classList.remove('hidden');
  renderAdminList();
  resetProductForm();
}

function closeProductsModal() {
  const modal = document.getElementById('productsModal');
  if (modal) modal.classList.add('hidden');
  editingId = null;
}

function resetProductForm() {
  editingId = null;
  const nameInput = document.getElementById('pName');
  const priceInput = document.getElementById('pPrice');
  const iconInput = document.getElementById('pIcon');
  const title = document.getElementById('productFormTitle');
  const saveBtn = document.getElementById('saveProductBtn');
  const cancelBtn = document.getElementById('cancelEditBtn');

  if (nameInput) nameInput.value = '';
  if (priceInput) priceInput.value = '';
  if (iconInput) iconInput.value = '';
  if (title) title.innerHTML = '<i data-lucide="plus-circle"></i> Nuevo Producto / Categoría';
  if (saveBtn) saveBtn.textContent = 'Guardar';
  if (cancelBtn) cancelBtn.classList.add('hidden');
  refreshIcons();
}

function renderAdminList() {
  const list = document.getElementById('adminProductList');
  if (!list) return;

  if (products.length === 0) {
    list.innerHTML = '<p class="empty-state" style="padding:16px">No hay productos. Agrega uno arriba.</p>';
    return;
  }

  list.innerHTML = products.map(p =>
    '<div class="admin-item" role="listitem">' +
    '<span class="admin-icon">' + (p.icon || '🏷️') + '</span>' +
    '<div class="admin-info">' +
    '<span class="admin-name">' + p.name + '</span>' +
    '<span class="admin-price">Presupuesto: $' + p.price.toFixed(2) + '</span>' +
    '</div>' +
    '<div class="admin-actions">' +
    '<button class="icon-btn edit-product-btn" data-id="' + p.id + '" aria-label="Editar ' + p.name + '" type="button"><i data-lucide="pencil"></i></button>' +
    '<button class="icon-btn delete-product-btn" data-id="' + p.id + '" aria-label="Eliminar ' + p.name + '" type="button"><i data-lucide="trash-2"></i></button>' +
    '</div>' +
    '</div>'
  ).join('');

  list.querySelectorAll('.edit-product-btn').forEach(btn => {
    btn.addEventListener('click', () => startEditProduct(btn.dataset.id));
  });
  list.querySelectorAll('.delete-product-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteProduct(btn.dataset.id));
  });
  refreshIcons();
}

function startEditProduct(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;
  editingId = id;
  const nameInput = document.getElementById('pName');
  const priceInput = document.getElementById('pPrice');
  const iconInput = document.getElementById('pIcon');
  const title = document.getElementById('productFormTitle');
  const saveBtn = document.getElementById('saveProductBtn');
  const cancelBtn = document.getElementById('cancelEditBtn');
  const formWrapper = document.getElementById('productFormWrapper');

  if (nameInput) nameInput.value = product.name;
  if (priceInput) priceInput.value = product.price.toFixed(2);
  if (iconInput) iconInput.value = product.icon || '';
  if (title) title.innerHTML = '<i data-lucide="pencil"></i> Editar Producto';
  if (saveBtn) saveBtn.textContent = 'Actualizar';
  if (cancelBtn) cancelBtn.classList.remove('hidden');

  if (nameInput) nameInput.focus();
  if (formWrapper) formWrapper.scrollIntoView({ behavior: 'smooth' });
  refreshIcons();
}

function deleteProduct(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;
  if (confirm('¿Eliminar "' + product.name + '"?')) {
    products = products.filter(p => p.id !== id);
    saveProducts();
    renderAdminList();
    renderProductGrid();
    updateDashboard(); // Refresca resumen y gráficas
    showToast('"' + product.name + '" eliminado', 'info');
  }
}

// ================= INICIALIZACIÓN DE EVENTOS =================
function setupEventListeners() {
  // Confirm Panel buttons
  const cancelConfirmBtn = document.getElementById('cancelConfirmBtn');
  if (cancelConfirmBtn) cancelConfirmBtn.addEventListener('click', closeConfirmPanel);

  const addExpenseBtn = document.getElementById('addExpenseBtn');
  if (addExpenseBtn) {
    addExpenseBtn.addEventListener('click', () => {
      if (!selectedProduct) return;
      const amountInput = document.getElementById('confirmAmount');
      if (!amountInput) return;

      const rawVal = amountInput.value.replace(',', '.');
      const amount = parseFloat(rawVal);
      if (isNaN(amount) || amount <= 0) {
        showToast('Ingresa un monto válido mayor a $0', 'error');
        amountInput.focus();
        return;
      }

      expenses.push({
        id: genId(),
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        productIcon: selectedProduct.icon,
        categoryBudget: selectedProduct.price,
        amount: amount,
        date: new Date().toISOString(),
      });

      closeConfirmPanel();
      updateDashboard();
      renderProductGrid();
      showToast('Registrado: ' + selectedProduct.name + ' · $' + amount.toFixed(2));
    });
  }

  const confirmAmountInput = document.getElementById('confirmAmount');
  if (confirmAmountInput) {
    confirmAmountInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const btn = document.getElementById('addExpenseBtn');
        if (btn) btn.click();
      }
    });
  }

  // Reset semana
  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('¿Reiniciar el presupuesto semanal? Se borrarán todos los gastos de la semana.')) {
        expenses = [];
        updateDashboard();
        renderProductGrid();
        showToast('Semana reiniciada', 'info');
      }
    });
  }

  // Modal open/close
  const openProductsBtn = document.getElementById('openProductsBtn');
  if (openProductsBtn) openProductsBtn.addEventListener('click', openProductsModal);

  const closeProductsBtn = document.getElementById('closeProductsBtn');
  if (closeProductsBtn) closeProductsBtn.addEventListener('click', closeProductsModal);

  const modalOverlay = document.getElementById('productsModal');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target.id === 'productsModal') closeProductsModal();
    });
  }

  // Cancelar edición de producto
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  if (cancelEditBtn) cancelEditBtn.addEventListener('click', resetProductForm);

  // Guardar producto
  const saveProductBtn = document.getElementById('saveProductBtn');
  if (saveProductBtn) {
    saveProductBtn.addEventListener('click', () => {
      const nameInput = document.getElementById('pName');
      const priceInput = document.getElementById('pPrice');
      const iconInput = document.getElementById('pIcon');

      const name = nameInput ? nameInput.value.trim() : '';
      const rawPrice = priceInput ? priceInput.value.replace(',', '.') : '';
      const price = parseFloat(rawPrice);
      const icon = iconInput ? iconInput.value.trim() : '';

      if (!name) {
        showToast('El nombre es requerido', 'error');
        return;
      }
      if (isNaN(price) || price < 0) {
        showToast('Ingresa un precio válido', 'error');
        return;
      }

      if (editingId) {
        products = products.map(p => p.id === editingId ? { ...p, name, price, icon: icon || '🏷️' } : p);
        showToast('"' + name + '" actualizado');
      } else {
        products.push({ id: genId(), name, price, icon: icon || '🏷️' });
        showToast('"' + name + '" creado');
      }

      saveProducts();
      renderAdminList();
      renderProductGrid();
      updateDashboard();
      resetProductForm();
    });
  }

  // Restaurar por defecto
  const restoreDefaultsBtn = document.getElementById('restoreDefaultsBtn');
  if (restoreDefaultsBtn) {
    restoreDefaultsBtn.addEventListener('click', () => {
      if (confirm('¿Restaurar los 7 productos y presupuestos por defecto?')) {
        products = JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
        saveProducts();
        renderAdminList();
        renderProductGrid();
        updateDashboard();
        resetProductForm();
        showToast('Productos por defecto restaurados');
      }
    });
  }

  // Cerrar modal / panel con Escape
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('productsModal');
      if (modal && !modal.classList.contains('hidden')) {
        closeProductsModal();
        return;
      }
      const confirmPanel = document.getElementById('confirmPanel');
      if (confirmPanel && !confirmPanel.classList.contains('hidden')) {
        closeConfirmPanel();
      }
    }
  });
}

// ================= BOOTSTRAP =================
function initApp() {
  setupTabs();
  setupEventListeners();
  renderProductGrid();
  updateDashboard();
  refreshIcons();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}
