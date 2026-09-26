import { useAppStore } from '@/store/useAppStore';
import { Files, Code2, Box, Cpu, Network, FileCode } from 'lucide-react';

export function StatCards() {
  const activeRepo = useAppStore((s) => s.activeRepo);
  const files = useAppStore((s) => s.files);
  const symbols = useAppStore((s) => s.symbols);

  if (!activeRepo) return null;

  const totalFiles = activeRepo.total_files || files.length;
  const totalSymbols = activeRepo.total_symbols || symbols.length;
  const totalLines = activeRepo.total_lines || files.reduce((acc, f) => acc + (f.line_count || 0), 0);

  const classesCount = symbols.filter((s) => s.symbol_type === 'class').length;
  const functionsCount = symbols.filter((s) => ['function', 'method'].includes(s.symbol_type)).length;
  const apiRoutesCount = symbols.filter((s) => s.symbol_type === 'api_route').length;

  const stats = [
    {
      label: 'Files Analyzed',
      value: totalFiles.toLocaleString(),
      icon: Files,
      type: 'files',
    },
    {
      label: 'Extracted Symbols',
      value: totalSymbols.toLocaleString(),
      icon: Code2,
      type: 'symbols',
    },
    {
      label: 'Classes & Types',
      value: classesCount.toLocaleString(),
      icon: Box,
      type: 'classes',
    },
    {
      label: 'Functions & Methods',
      value: functionsCount.toLocaleString(),
      icon: Cpu,
      type: 'calls',
    },
    {
      label: 'API Endpoints',
      value: apiRoutesCount.toLocaleString(),
      icon: Network,
      type: 'routes',
    },
    {
      label: 'Lines of Code',
      value: totalLines.toLocaleString(),
      icon: FileCode,
      type: 'lines',
    },
  ];

  return (
    <div className="stat-grid">
      {stats.map((st) => {
        const IconComponent = st.icon;
        return (
          <div key={st.label} className="stat-card">
            <div className={`stat-icon ${st.type}`}>
              <IconComponent size={18} />
            </div>
            <div>
              <div className="stat-value">{st.value}</div>
              <div className="stat-label">{st.label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
