// ==========================================================================
// AI CODEBASE ARCHAEOLOGIST - CLIENT DASHBOARD LOGIC
// ==========================================================================

const API_BASE = '/api';

const state = {
  repositories: [],
  activeRepoId: null,
  activeRepo: null,
  files: [],
  symbols: [],
  imports: [],
  calls: [],
  selectedFileId: null,
  activeTab: 'overview',
  symbolFilter: 'all',
  searchQuery: '',
  pollInterval: null
};

// DOM Elements
const elements = {
  repoList: document.getElementById('repo-list'),
  activeRepoName: document.getElementById('active-repo-name'),
  activeRepoPath: document.getElementById('active-repo-path'),
  repoActions: document.getElementById('repo-actions'),
  progressBarContainer: document.getElementById('progress-bar-container'),
  progressStepText: document.getElementById('progress-step-text'),
  progressFill: document.getElementById('progress-fill'),
  
  // Stat counters
  statFiles: document.getElementById('stat-files'),
  statSymbols: document.getElementById('stat-symbols'),
  statClasses: document.getElementById('stat-classes'),
  statRoutes: document.getElementById('stat-routes'),
  statCalls: document.getElementById('stat-calls'),
  
  // Tabs & panels
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabPanels: document.querySelectorAll('.tab-panel'),
  
  // Overview Tab
  overviewCard: document.getElementById('overview-content'),
  
  // Files Tab
  fileList: document.getElementById('file-list'),
  fileSearch: document.getElementById('file-search'),
  codeViewer: document.getElementById('code-viewer'),
  codeFilename: document.getElementById('code-filename'),
  copyCodeBtn: document.getElementById('copy-code-btn'),
  
  // Symbols Tab
  symbolsGrid: document.getElementById('symbols-grid'),
  symbolSearch: document.getElementById('symbol-search'),
  pillBtns: document.querySelectorAll('.pill-btn'),
  
  // Routes Tab
  routesList: document.getElementById('routes-list'),
  
  // Graphs Tab
  importsList: document.getElementById('imports-list'),
  callsList: document.getElementById('calls-list'),
  
  // Ingest Modal
  ingestModal: document.getElementById('ingest-modal'),
  openIngestBtn: document.getElementById('open-ingest-btn'),
  closeIngestBtn: document.getElementById('close-ingest-btn'),
  cancelIngestBtn: document.getElementById('cancel-ingest-btn'),
  submitIngestBtn: document.getElementById('submit-ingest-btn'),
  ingestNameInput: document.getElementById('ingest-name'),
  ingestPathInput: document.getElementById('ingest-path'),
  ingestUrlInput: document.getElementById('ingest-url'),
  presetButtons: document.querySelectorAll('.preset-btn')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  loadRepositories();
});

function initEventListeners() {
  // Navigation tabs
  elements.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      switchTab(tabName);
    });
  });

  // Modal open / close
  elements.openIngestBtn.addEventListener('click', () => {
    elements.ingestModal.classList.add('open');
  });
  elements.closeIngestBtn.addEventListener('click', () => elements.ingestModal.classList.remove('open'));
  elements.cancelIngestBtn.addEventListener('click', () => elements.ingestModal.classList.remove('open'));

  // Preset Buttons
  elements.presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const path = btn.dataset.path;
      const name = btn.dataset.name;
      elements.ingestPathInput.value = path;
      elements.ingestNameInput.value = name;
      elements.ingestUrlInput.value = '';
    });
  });

  // Submit Ingest
  elements.submitIngestBtn.addEventListener('click', handleIngestRepository);

  // File search filter
  elements.fileSearch.addEventListener('input', (e) => {
    filterFiles(e.target.value);
  });

  // Symbol search & pill filters
  elements.symbolSearch.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase();
    renderSymbols();
  });

  elements.pillBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.pillBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.symbolFilter = btn.dataset.filter;
      renderSymbols();
    });
  });

  // Copy code
  elements.copyCodeBtn.addEventListener('click', () => {
    const code = elements.codeViewer.textContent;
    if (code) {
      navigator.clipboard.writeText(code);
      elements.copyCodeBtn.textContent = 'Copied!';
      setTimeout(() => elements.copyCodeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy`, 1500);
    }
  });
}

function switchTab(tabName) {
  state.activeTab = tabName;
  elements.tabBtns.forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });
  elements.tabPanels.forEach(p => {
    p.classList.toggle('active', p.id === `tab-${tabName}`);
  });
}

// --------------------------------------------------------------------------
// API CALLS & REPO MANAGEMENT
// --------------------------------------------------------------------------

async function loadRepositories() {
  try {
    const res = await fetch(`${API_BASE}/repositories`);
    if (!res.ok) throw new Error('Failed to load repositories');
    state.repositories = await res.json();
    renderRepositoryList();

    if (state.repositories.length > 0) {
      if (!state.activeRepoId || !state.repositories.some(r => r.id === state.activeRepoId)) {
        selectRepository(state.repositories[0].id);
      } else {
        selectRepository(state.activeRepoId);
      }
    } else {
      renderEmptyState();
    }
  } catch (err) {
    console.error('Error fetching repositories:', err);
  }
}

function renderRepositoryList() {
  elements.repoList.innerHTML = '';
  state.repositories.forEach(repo => {
    const item = document.createElement('div');
    item.className = `repo-item ${repo.id === state.activeRepoId ? 'active' : ''}`;
    item.onclick = () => selectRepository(repo.id);

    const statusBadge = repo.latest_analysis ? repo.latest_analysis.status : 'UNKNOWN';
    const statusColor = statusBadge === 'COMPLETED' ? '#4AAD8B' : statusBadge === 'IN_PROGRESS' || statusBadge === 'QUEUED' ? '#3BA7C9' : '#D45A6E';

    item.innerHTML = `
      <div class="repo-item-header">
        <span class="repo-name" title="${escapeHtml(repo.name)}">${escapeHtml(repo.name)}</span>
        <span style="font-size: 0.7rem; color: ${statusColor}; font-weight: 600;">${statusBadge}</span>
      </div>
      <div class="repo-meta">
        <span>${repo.url ? 'GitHub' : 'Local Disk'}</span>
        <span>•</span>
        <span>${new Date(repo.created_at).toLocaleDateString()}</span>
      </div>
    `;
    elements.repoList.appendChild(item);
  });
}

async function selectRepository(repoId) {
  state.activeRepoId = repoId;
  state.activeRepo = state.repositories.find(r => r.id === repoId);
  renderRepositoryList();

  if (!state.activeRepo) return;

  elements.activeRepoName.textContent = state.activeRepo.name;
  elements.activeRepoPath.textContent = state.activeRepo.url || state.activeRepo.local_path || 'No path specified';

  renderRepoActions();
  checkAnalysisStatus();
  await loadRepoDetails(repoId);
}

function renderRepoActions() {
  elements.repoActions.innerHTML = `
    <button class="btn btn-secondary btn-sm" id="reanalyze-btn" onclick="handleReanalyze('${state.activeRepoId}')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
      Re-analyze
    </button>
    <button class="btn btn-danger btn-sm" id="delete-repo-btn" onclick="handleDeleteRepo('${state.activeRepoId}')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      Delete
    </button>
  `;
}

async function handleIngestRepository() {
  const name = elements.ingestNameInput.value.trim();
  const local_path = elements.ingestPathInput.value.trim();
  const url = elements.ingestUrlInput.value.trim();

  if (!local_path && !url) {
    alert('Please provide either a local folder path or a GitHub repository URL.');
    return;
  }

  elements.submitIngestBtn.disabled = true;
  elements.submitIngestBtn.textContent = 'Ingesting...';

  try {
    const payload = {};
    if (name) payload.name = name;
    if (local_path) payload.local_path = local_path;
    if (url) payload.url = url;

    const res = await fetch(`${API_BASE}/repositories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to ingest repository');
    }

    const newRepo = await res.json();
    elements.ingestModal.classList.remove('open');
    elements.ingestPathInput.value = '';
    elements.ingestUrlInput.value = '';
    elements.ingestNameInput.value = '';

    await loadRepositories();
    selectRepository(newRepo.id);
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    elements.submitIngestBtn.disabled = false;
    elements.submitIngestBtn.textContent = 'Ingest & Analyze';
  }
}

async function handleReanalyze(repoId) {
  try {
    const res = await fetch(`${API_BASE}/repositories/${repoId}/analyze`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to start analysis');
    checkAnalysisStatus();
  } catch (err) {
    alert(`Re-analysis error: ${err.message}`);
  }
}

async function handleDeleteRepo(repoId) {
  if (!confirm(`Are you sure you want to delete this repository from the catalog?`)) return;
  try {
    const res = await fetch(`${API_BASE}/repositories/${repoId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete repository');
    state.activeRepoId = null;
    await loadRepositories();
  } catch (err) {
    alert(`Delete error: ${err.message}`);
  }
}

// --------------------------------------------------------------------------
// REAL-TIME STATUS POLLING
// --------------------------------------------------------------------------

function checkAnalysisStatus() {
  if (state.pollInterval) clearInterval(state.pollInterval);

  async function poll() {
    if (!state.activeRepoId) return;
    try {
      const res = await fetch(`${API_BASE}/repositories/${state.activeRepoId}/analysis-status`);
      if (!res.ok) return;
      const status = await res.json();

      if (status.status === 'QUEUED' || status.status === 'IN_PROGRESS') {
        elements.progressBarContainer.classList.add('visible');
        elements.progressStepText.textContent = `${status.status}: ${status.current_step || 'Processing...'}`;
        elements.progressFill.style.width = '65%';
      } else {
        elements.progressBarContainer.classList.remove('visible');
        clearInterval(state.pollInterval);
        state.pollInterval = null;
        loadRepoDetails(state.activeRepoId);
      }
    } catch (err) {
      console.warn('Poll status error:', err);
    }
  }

  poll();
  state.pollInterval = setInterval(poll, 2000);
}

// --------------------------------------------------------------------------
// LOAD METRICS & ARTIFACTS
// --------------------------------------------------------------------------

async function loadRepoDetails(repoId) {
  try {
    const [filesRes, symbolsRes, importsRes, callsRes] = await Promise.all([
      fetch(`${API_BASE}/repositories/${repoId}/files`),
      fetch(`${API_BASE}/repositories/${repoId}/symbols`),
      fetch(`${API_BASE}/repositories/${repoId}/imports`),
      fetch(`${API_BASE}/repositories/${repoId}/calls`)
    ]);

    state.files = filesRes.ok ? await filesRes.json() : [];
    state.symbols = symbolsRes.ok ? await symbolsRes.json() : [];
    state.imports = importsRes.ok ? await importsRes.json() : [];
    state.calls = callsRes.ok ? await callsRes.json() : [];

    updateStats();
    renderOverviewTab();
    renderFileList();
    renderSymbols();
    renderRoutesTab();
    renderGraphTab();
  } catch (err) {
    console.error('Error loading repository details:', err);
  }
}

function updateStats() {
  const classes = state.symbols.filter(s => s.symbol_type === 'class').length;
  const routes = state.symbols.filter(s => s.symbol_type === 'api_route').length;

  elements.statFiles.textContent = state.files.length;
  elements.statSymbols.textContent = state.symbols.length;
  elements.statClasses.textContent = classes;
  elements.statRoutes.textContent = routes;
  elements.statCalls.textContent = state.calls.length;
}

// --------------------------------------------------------------------------
// TAB RENDERING
// --------------------------------------------------------------------------

function renderOverviewTab() {
  const languages = {};
  state.files.forEach(f => {
    if (f.language) {
      languages[f.language] = (languages[f.language] || 0) + 1;
    }
  });

  const langBadges = Object.entries(languages).map(([lang, count]) => `
    <span class="status-badge" style="background: rgba(59, 167, 201, 0.08); color: var(--accent-cyan); border-color: rgba(59,167,201,0.15);">
      ${lang}: ${count} file${count > 1 ? 's' : ''}
    </span>
  `).join('');

  elements.overviewCard.innerHTML = `
    <div style="padding: 20px; display: flex; flex-direction: column; gap: 14px;">
      <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 20px;">
        <h3 style="margin-bottom: 10px; font-size: 1rem; font-weight: 600; color: var(--text-primary);">Codebase Knowledge Summary</h3>
        <p style="color: var(--text-secondary); line-height: 1.6; font-size: 0.85rem;">
          This repository has been fully scanned and indexed into AST knowledge models. You can explore extracted symbol structures, API endpoints, module dependencies, and code call graphs.
        </p>
        
        <div style="margin-top: 14px; display: flex; flex-wrap: wrap; gap: 6px;">
          ${langBadges || '<span style="color: var(--text-muted);">No languages detected</span>'}
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px;">
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px;">
          <h4 style="color: var(--text-primary); font-size: 0.88rem; font-weight: 600; margin-bottom: 6px;">📁 Files Manifest</h4>
          <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.5;">${state.files.length} source code files parsed with line counts and syntax verification.</p>
          <button class="btn btn-secondary btn-sm" style="margin-top: 10px;" onclick="switchTab('files')">Open File Explorer →</button>
        </div>

        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px;">
          <h4 style="color: var(--text-primary); font-size: 0.88rem; font-weight: 600; margin-bottom: 6px;">🔍 AST Symbol Engine</h4>
          <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.5;">${state.symbols.length} functions, classes, and models indexed with parameters & docstrings.</p>
          <button class="btn btn-secondary btn-sm" style="margin-top: 10px;" onclick="switchTab('symbols')">Inspect AST Symbols →</button>
        </div>

        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px;">
          <h4 style="color: var(--text-primary); font-size: 0.88rem; font-weight: 600; margin-bottom: 6px;">⚡ API Endpoint Registry</h4>
          <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.5;">${state.symbols.filter(s => s.symbol_type === 'api_route').length} detected REST endpoints ready for architecture exploration.</p>
          <button class="btn btn-secondary btn-sm" style="margin-top: 10px;" onclick="switchTab('routes')">View API Routes →</button>
        </div>
      </div>
    </div>
  `;
}

// ---------------- Files Tab ----------------
function renderFileList(filteredFiles = null) {
  const list = filteredFiles || state.files;
  elements.fileList.innerHTML = '';

  if (list.length === 0) {
    elements.fileList.innerHTML = '<div style="padding: 16px; color: var(--text-muted); font-size: 0.85rem;">No files found</div>';
    return;
  }

  list.forEach(file => {
    const item = document.createElement('div');
    item.className = `file-list-item ${file.id === state.selectedFileId ? 'active' : ''}`;
    item.onclick = () => selectFile(file);
    item.innerHTML = `
      <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(file.path)}">${escapeHtml(file.path)}</span>
      <span style="font-size: 0.72rem; color: var(--text-muted);">${file.line_count || 0} lines</span>
    `;
    elements.fileList.appendChild(item);
  });

  if (!state.selectedFileId && list.length > 0) {
    selectFile(list[0]);
  }
}

function filterFiles(query) {
  const q = query.toLowerCase();
  const filtered = state.files.filter(f => f.path.toLowerCase().includes(q));
  renderFileList(filtered);
}

async function selectFile(file) {
  state.selectedFileId = file.id;
  elements.codeFilename.textContent = file.path;
  renderFileList();

  try {
    const res = await fetch(`${API_BASE}/repositories/${state.activeRepoId}/files/${file.id}`);
    if (!res.ok) throw new Error('Failed to load file content');
    const data = await res.json();
    elements.codeViewer.textContent = data.content || '// (Empty file)';
  } catch (err) {
    elements.codeViewer.textContent = `// Error reading file: ${err.message}`;
  }
}

// ---------------- Symbols Tab ----------------
function renderSymbols() {
  let list = state.symbols;

  if (state.symbolFilter !== 'all') {
    list = list.filter(s => s.symbol_type === state.symbolFilter);
  }

  if (state.searchQuery) {
    list = list.filter(s => 
      s.name.toLowerCase().includes(state.searchQuery) ||
      (s.qualified_name && s.qualified_name.toLowerCase().includes(state.searchQuery)) ||
      (s.file_path && s.file_path.toLowerCase().includes(state.searchQuery))
    );
  }

  elements.symbolsGrid.innerHTML = '';
  if (list.length === 0) {
    elements.symbolsGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">🔍</div>
        <p>No symbols match the current filter</p>
      </div>
    `;
    return;
  }

  list.forEach(sym => {
    const card = document.createElement('div');
    card.className = 'symbol-card';
    
    let paramsStr = '';
    if (sym.parameters && Array.isArray(sym.parameters)) {
      paramsStr = sym.parameters.map(p => p.name + (p.type_annotation ? `: ${p.type_annotation}` : '')).join(', ');
    }

    card.innerHTML = `
      <div class="symbol-header">
        <span class="symbol-type-tag ${sym.symbol_type}">${sym.symbol_type}</span>
        <span class="symbol-loc">L${sym.start_line} - L${sym.end_line}</span>
      </div>
      <div class="symbol-name">${escapeHtml(sym.name)}${sym.symbol_type === 'function' || sym.symbol_type === 'method' || sym.symbol_type === 'api_route' ? `(${escapeHtml(paramsStr)})` : ''}</div>
      <div style="font-size: 0.78rem; color: var(--text-muted); font-family: monospace;">📁 ${escapeHtml(sym.file_path || 'unknown file')}</div>
      ${sym.docstring ? `<div class="symbol-docstring">${escapeHtml(sym.docstring)}</div>` : ''}
    `;
    elements.symbolsGrid.appendChild(card);
  });
}

// ---------------- Routes Hub Tab ----------------
function renderRoutesTab() {
  const routes = state.symbols.filter(s => s.symbol_type === 'api_route');
  elements.routesList.innerHTML = '';

  if (routes.length === 0) {
    elements.routesList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚡</div>
        <p>No REST API endpoints detected in this repository</p>
      </div>
    `;
    return;
  }

  routes.forEach(route => {
    const method = (route.metadata_json && route.metadata_json.http_method) ? route.metadata_json.http_method.toLowerCase() : 'get';
    const path = (route.metadata_json && route.metadata_json.route_path) ? route.metadata_json.route_path : `/${route.name}`;

    const card = document.createElement('div');
    card.className = 'route-card';
    card.innerHTML = `
      <span class="http-method ${method}">${method.toUpperCase()}</span>
      <span class="route-path">${escapeHtml(path)}</span>
      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
        <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.78rem; color: var(--accent-cyan);">${escapeHtml(route.name)}()</span>
        <span style="font-size: 0.74rem; color: var(--text-muted);">${escapeHtml(route.file_path || '')}:L${route.start_line}</span>
      </div>
    `;
    elements.routesList.appendChild(card);
  });
}

// ---------------- Graph & Dependencies Tab ----------------
function renderGraphTab() {
  elements.importsList.innerHTML = '';
  elements.callsList.innerHTML = '';

  if (state.imports.length === 0) {
    elements.importsList.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 0.85rem;">No module imports recorded</div>';
  } else {
    state.imports.forEach(imp => {
      const card = document.createElement('div');
      card.className = 'graph-item-card';
      card.innerHTML = `
        <div style="font-weight: 500; color: var(--accent-cyan); font-family: 'JetBrains Mono', monospace; font-size: 0.82rem;">
          import ${escapeHtml(imp.source_module)}${imp.imported_symbol ? ` (${imp.imported_symbol})` : ''}
        </div>
        <div style="font-size: 0.74rem; color: var(--text-muted);">Line ${imp.line_number}</div>
      `;
      elements.importsList.appendChild(card);
    });
  }

  if (state.calls.length === 0) {
    elements.callsList.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 0.85rem;">No function calls recorded</div>';
  } else {
    state.calls.forEach(call => {
      const card = document.createElement('div');
      card.className = 'graph-item-card';
      card.innerHTML = `
        <div style="font-weight: 500; color: var(--accent-amber); font-family: 'JetBrains Mono', monospace; font-size: 0.82rem;">
          → ${escapeHtml(call.callee_name)}()
        </div>
        <div style="font-size: 0.74rem; color: var(--text-muted);">Line ${call.line_number}</div>
      `;
      elements.callsList.appendChild(card);
    });
  }
}

// ---------------- Helpers ----------------
function renderEmptyState() {
  elements.activeRepoName.textContent = 'No Repositories Loaded';
  elements.activeRepoPath.textContent = 'Ingest a repository to begin analysis';
  elements.repoActions.innerHTML = '';
  elements.statFiles.textContent = '0';
  elements.statSymbols.textContent = '0';
  elements.statClasses.textContent = '0';
  elements.statRoutes.textContent = '0';
  elements.statCalls.textContent = '0';
  elements.overviewCard.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">🏛️</div>
      <h3 style="font-size: 1.2rem; margin-bottom: 8px;">Welcome to AI Codebase Archaeologist</h3>
      <p style="max-width: 450px; line-height: 1.6;">Ingest any local directory or GitHub repository to extract AST knowledge graphs, explore code symbols, and analyze architecture.</p>
      <button class="btn btn-primary" style="margin-top: 16px;" onclick="document.getElementById('ingest-modal').classList.add('open')">
        + Ingest First Codebase
      </button>
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
