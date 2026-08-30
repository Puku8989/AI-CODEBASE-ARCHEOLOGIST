import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import (
    Repository,
    AnalysisRun,
    FileRecord,
    SymbolRecord,
    ImportRecord,
    FunctionCallRecord,
    ClassInheritanceRecord
)
from app.services.repo_service import RepoService
from app.services.scanner_service import ScannerService
from app.parsers.python_parser import PythonASTParser


class AnalysisOrchestrator:
    def __init__(self, db: Optional[Session] = None):
        self.db_provided = db is not None
        self.db = db or SessionLocal()
        self.python_parser = PythonASTParser()

    def close(self):
        if not self.db_provided:
            self.db.close()

    def run_analysis(self, repository_id: str):
        """Execute full end-to-end repository analysis pipeline."""
        repo = self.db.query(Repository).filter(Repository.id == repository_id).first()
        if not repo:
            self.close()
            return

        run = self.db.query(AnalysisRun).filter(
            AnalysisRun.repository_id == repository_id
        ).order_by(AnalysisRun.started_at.desc()).first()

        if not run:
            run = AnalysisRun(repository_id=repository_id, status="QUEUED")
            self.db.add(run)
            self.db.commit()
            self.db.refresh(run)

        try:
            # 1. Ingestion / Cloning (0 -> 20%)
            self._update_progress(run, "CLONING", 10, "Fetching and verifying repository source...")
            repo_dir = Path(repo.local_path)

            if repo.url and (not repo_dir.exists() or not any(repo_dir.iterdir())):
                repo_storage = RepoService.prepare_repo_storage(repo.id)
                branch, commit = RepoService.clone_repository(repo.url, repo_storage)
                repo.local_path = str(repo_storage)
                repo.default_branch = branch
                repo.commit_hash = commit
                self.db.commit()
                repo_dir = repo_storage

            # 2. Scanning & Filtering (20 -> 40%)
            self._update_progress(run, "SCANNING", 25, "Scanning directory structure and applying ignore rules...")
            scanner = ScannerService()
            scanned_files, lang_breakdown = scanner.scan_directory(repo_dir)

            run.total_files = len(scanned_files)
            run.scanned_files = len(scanned_files)
            repo.detected_languages = lang_breakdown
            self.db.commit()

            # Clear old records if re-analyzing
            self.db.query(FileRecord).filter(FileRecord.repository_id == repo.id).delete()
            self.db.commit()

            # Insert file records
            file_record_map: Dict[str, FileRecord] = {}
            total_lines_count = 0

            for s_file in scanned_files:
                file_rec = FileRecord(
                    repository_id=repo.id,
                    path=s_file.path,
                    filename=s_file.filename,
                    extension=s_file.extension,
                    language=s_file.language,
                    size_bytes=s_file.size_bytes,
                    line_count=s_file.line_count,
                    analysis_status="pending" if s_file.is_supported else "unsupported"
                )
                self.db.add(file_rec)
                self.db.flush()
                file_record_map[s_file.path] = file_rec
                total_lines_count += s_file.line_count

            self.db.commit()

            # 3. Parsing & Code Extraction (40 -> 80%)
            self._update_progress(run, "PARSING", 45, "Extracting AST symbols, functions, classes, and imports...")
            supported_files = [f for f in scanned_files if f.is_supported]
            parsed_count = 0
            total_symbols_extracted = 0

            for idx, s_file in enumerate(supported_files):
                file_rec = file_record_map.get(s_file.path)
                if not file_rec:
                    continue

                try:
                    with open(s_file.full_path, "r", encoding="utf-8", errors="replace") as f:
                        content = f.read()

                    # Parse based on language
                    if s_file.language == "python":
                        parsed_res = self.python_parser.parse(s_file.path, content)
                    else:
                        parsed_res = None

                    if parsed_res and parsed_res.success:
                        file_rec.analysis_status = "analyzed"
                        
                        # Map symbols to persist
                        symbol_record_map: Dict[str, SymbolRecord] = {}
                        
                        # 1st pass: insert symbols
                        for sym in parsed_res.symbols:
                            sym_rec = SymbolRecord(
                                repository_id=repo.id,
                                file_id=file_rec.id,
                                name=sym.name,
                                qualified_name=sym.qualified_name,
                                symbol_type=sym.symbol_type,
                                start_line=sym.start_line,
                                end_line=sym.end_line,
                                start_col=sym.start_col,
                                end_col=sym.end_col,
                                docstring=sym.docstring,
                                signature=sym.signature,
                                cyclomatic_complexity=sym.cyclomatic_complexity,
                                raw_source=sym.raw_source,
                                is_async=sym.is_async,
                                is_exported=sym.is_exported
                            )
                            self.db.add(sym_rec)
                            self.db.flush()
                            symbol_record_map[sym.qualified_name] = sym_rec
                            total_symbols_extracted += 1

                        # Link parent symbols
                        for sym in parsed_res.symbols:
                            if sym.parent_name and sym.parent_name in symbol_record_map:
                                current_rec = symbol_record_map.get(sym.qualified_name)
                                parent_rec = symbol_record_map.get(sym.parent_name)
                                if current_rec and parent_rec:
                                    current_rec.parent_symbol_id = parent_rec.id

                        # Insert imports
                        for imp in parsed_res.imports:
                            imp_rec = ImportRecord(
                                repository_id=repo.id,
                                file_id=file_rec.id,
                                source_module=imp.source_module,
                                imported_name=imp.imported_name,
                                alias=imp.alias,
                                is_from_import=imp.is_from_import,
                                line_number=imp.line_number
                            )
                            self.db.add(imp_rec)

                        # Insert function calls
                        for call in parsed_res.calls:
                            caller_sym_id = None
                            if call.caller_name and call.caller_name in symbol_record_map:
                                caller_sym_id = symbol_record_map[call.caller_name].id

                            call_rec = FunctionCallRecord(
                                repository_id=repo.id,
                                file_id=file_rec.id,
                                caller_symbol_id=caller_sym_id,
                                callee_name=call.callee_name,
                                line_number=call.line_number,
                                confidence=call.confidence
                            )
                            self.db.add(call_rec)

                        # Insert inheritances
                        for inh in parsed_res.inheritances:
                            if inh.child_class_name in symbol_record_map:
                                inh_rec = ClassInheritanceRecord(
                                    repository_id=repo.id,
                                    child_symbol_id=symbol_record_map[inh.child_class_name].id,
                                    parent_class_name=inh.parent_class_name,
                                    line_number=inh.line_number
                                )
                                self.db.add(inh_rec)

                    elif parsed_res:
                        file_rec.analysis_status = "failed"
                        file_rec.error_detail = parsed_res.error_message
                    else:
                        file_rec.analysis_status = "unsupported"

                except Exception as e:
                    file_rec.analysis_status = "failed"
                    file_rec.error_detail = f"File read/parse exception: {str(e)}"

                parsed_count += 1
                if idx % 10 == 0 or idx == len(supported_files) - 1:
                    pct = 45 + int((idx + 1) / max(len(supported_files), 1) * 35)
                    self._update_progress(run, "PARSING", pct, f"Parsed {parsed_count}/{len(supported_files)} code files...")
                    self.db.commit()

            # 4. Finalizing statistics & records (80 -> 100%)
            self._update_progress(run, "BUILDING_GRAPH", 85, "Aggregating repository statistics and symbol indexes...")
            repo.total_files = len(scanned_files)
            repo.total_lines = total_lines_count
            repo.total_symbols = total_symbols_extracted
            now_utc = datetime.now(timezone.utc)
            repo.updated_at = now_utc

            run.parsed_files = parsed_count
            run.status = "COMPLETED"
            run.progress_pct = 100
            run.current_step = "Analysis completed successfully."
            run.completed_at = now_utc
            self.db.commit()

        except Exception as e:
            self.db.rollback()
            run.status = "FAILED"
            run.error_message = f"{str(e)}\n{traceback.format_exc()}"
            run.current_step = "Analysis failed."
            run.completed_at = datetime.now(timezone.utc)
            self.db.commit()
        finally:
            self.close()

    def _update_progress(self, run: AnalysisRun, status: str, pct: int, step_desc: str):
        run.status = status
        run.progress_pct = pct
        run.current_step = step_desc
        self.db.commit()
