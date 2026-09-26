# 🏛️ AI Codebase Archaeologist

> **Excavate, map, and understand any codebase with deep AST parsing, dependency graph intelligence, and interactive visual archaeology.**

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![Vite](https://img.shields.io/badge/Vite-8.0+-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)
[![Tree-sitter](https://img.shields.io/badge/Tree--sitter-AST%20Parsing-orange?style=flat-square)](https://tree-sitter.github.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

---

## 📖 Overview

**AI Codebase Archaeologist** is a full-stack tool designed to unravel complex, legacy, or unfamiliar software repositories. By combining multi-language AST parsers (via **Tree-sitter** and native Python `ast`), directed graph network analysis (**NetworkX**), and a reactive graph exploration frontend (**React Flow** + **Monaco Editor**), it transforms raw code into actionable architectural maps.

---

## ✨ Key Features

### 🔍 1. Multi-Language AST Parsing & Symbol Extraction
- **Granular Symbol Recognition**: Automatically extracts classes, methods, functions, interfaces, types, global variables, imports, and function calls.
- **Tree-Sitter Language Engine**: Deep syntactic analysis across Python, TypeScript, JavaScript, Go, Rust, Java, C++, and more.
- **Hierarchical Scoping**: Tracks parent-child symbol relationships, line spans, docstrings, and signature definitions.

### 🕸️ 2. Architectural Dependency Graph Analysis
- **Directed Graph Engine**: Powered by NetworkX to model file-level, module-level, and symbol-level relations (`imports`, `calls`, `inherits`, `defines`).
- **Graph Metrics & Bottlenecks**:
  - **PageRank Centrality**: Identifies core foundational utilities and architectural hubs.
  - **Betweenness Centrality**: Pinpoints critical bridge modules and potential structural choke points.
  - **Cycle Detection**: Alerts on recursive import loops and tight coupling.
  - **Dead & Orphan Code Isolation**: Flags unreferenced symbols and disconnected modules.

### 🎨 3. Interactive Archaeology Dashboard
- **Interactive Graph Canvas**: Fluid zooming, panning, layout arrangements, node filtering, and dependency path highlights powered by `@xyflow/react`.
- **Integrated Monaco Code Viewer**: Embedded VS Code-grade code editor for instant preview of any file or symbol definition.
- **Health & Metric Overviews**: Real-time stats on files parsed, symbol counts, graph density, coupling metrics, and language breakdowns.
- **Repository Management**: Ingest from remote Git URLs (GitHub, GitLab, etc.) or scan local repository directories directly.

---

## 🏗️ Architecture & Tech Stack

```
AI-CODEBASE-ARCHEOLOGIST/
├── backend/                  # FastAPI Application & Graph Engine
│   ├── app/
│   │   ├── api/              # REST Endpoints (repos, files, symbols, graph)
│   │   ├── graph/            # NetworkX Graph Builder & Analyzers
│   │   ├── models/           # SQLAlchemy DB Models (Repo, File, Symbol, Edge)
│   │   ├── parsers/          # AST & Tree-Sitter parsing pipelines
│   │   ├── schemas/          # Pydantic Schemas & Validation
│   │   ├── services/         # Git ingestion, repository scanning, metrics
│   │   └── static/           # Compiled SPA distribution bundle
│   ├── tests/                # Pytest unit & integration test suite
│   └── requirements.txt      # Python dependencies
├── frontend/                 # React 19 + TypeScript SPA
│   ├── src/
│   │   ├── api/              # Axios API client
│   │   ├── components/       # Graph visualizer, Monaco editor, sidebars, metrics
│   │   ├── store/            # Zustand global state management
│   │   └── types/            # TypeScript schemas & contracts
│   └── package.json          # Node dependencies & build scripts
├── run.py                    # Root one-click backend/server launcher
└── .env.example              # Sample environment configuration
```

### Technology Breakdown

| Component | Technology | Description |
|---|---|---|
| **Backend Framework** | FastAPI (Python 3.11+) | Asynchronous, high-throughput REST API |
| **Parsing Engine** | Tree-sitter & Python AST | Multi-language syntactic analysis |
| **Graph Intelligence** | NetworkX | Topological sort, centrality, cycle detection |
| **Database** | SQLite / PostgreSQL | Relational graph metadata & symbol storage |
| **Frontend Framework** | React 19 + TypeScript + Vite | Ultra-responsive modern UI |
| **Graph UI** | @xyflow/react (React Flow) | Hardware-accelerated canvas visualization |
| **Code Editor** | @monaco-editor/react | In-browser syntax highlighted code reader |
| **State Management** | Zustand | Lightweight, high-performance client state |

---

## 🚀 Quick Start

### Prerequisites
- **Python 3.11+** installed
- **Node.js 18+** & npm installed
- **Git** installed

---

### 1. Clone & Setup Environment

```bash
git clone https://github.com/Puku8989/AI-CODEBASE-ARCHEOLOGIST.git
cd AI-CODEBASE-ARCHEOLOGIST

# Copy environment settings
cp .env.example .env
```

---

### 2. Backend Setup

```bash
# Create and activate a virtual environment
python -m venv .venv

# On Windows:
.venv\Scripts\activate
# On Linux / macOS:
source .venv/bin/activate

# Install backend dependencies
pip install -r backend/requirements.txt
```

---

### 3. Frontend Setup

```bash
cd frontend
npm install

# Build for production (bundles into backend static directory)
npm run build

# Or run the Vite dev server for live development
npm run dev
```

---

### 4. Run the Application

From the root directory:

```bash
# Start backend server (serves the SPA at http://localhost:8000)
python run.py
```

- 🌐 **Web Application UI**: [http://localhost:8000](http://localhost:8000)
- 📚 **Interactive Swagger API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- 🩺 **Health Check**: [http://localhost:8000/health](http://localhost:8000/health)

---

## 🧪 Running Tests

Ensure all unit and integration tests pass:

```bash
# Run pytest test suite
python -m pytest backend/tests
```

---

## 📡 REST API Overview

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/repositories/ingest` | Ingest a Git repository by URL or local path |
| `GET` | `/api/v1/repositories` | List all indexed repositories |
| `GET` | `/api/v1/repositories/{id}` | Get metadata and summary metrics for a repository |
| `GET` | `/api/v1/repositories/{id}/files` | Retrieve file tree and structural directory hierarchy |
| `GET` | `/api/v1/repositories/{id}/symbols` | Search and filter extracted symbols |
| `GET` | `/api/v1/repositories/{id}/graph` | Fetch dependency graph nodes, edges, and topology |
| `GET` | `/api/v1/repositories/{id}/metrics` | Compute PageRank, centrality, dead code, and cycles |
| `GET` | `/api/v1/files/{id}/content` | Get source file content for the code viewer |

---

## 🗺️ Roadmap & Future Horizons

- [x] **Phase 1**: Ingestion engine & local/git repository cloning.
- [x] **Phase 2**: Multi-language AST parsing & symbol extraction.
- [x] **Phase 3**: Dependency graph construction & NetworkX topological analysis.
- [x] **Phase 4**: Interactive React 19 graph dashboard & Monaco explorer.
- [ ] **Phase 5**: LLM-augmented code archaeology (natural language Q&A, refactoring assistant, architectural explanations via Ollama / OpenAI).
- [ ] **Phase 6**: Automated PR impact analysis & regression risk scoring.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/Puku8989/AI-CODEBASE-ARCHEOLOGIST/issues).

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'feat: add amazing archaeological feature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for more information.
