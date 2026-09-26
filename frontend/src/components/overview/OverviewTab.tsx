import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import * as api from '@/api/client';
import type { CouplingMetric, CycleNode } from '@/types';
import { Code, AlertTriangle, ShieldCheck, Activity, Layers } from 'lucide-react';

export function OverviewTab() {
  const activeRepo = useAppStore((s) => s.activeRepo);
  const [coupling, setCoupling] = useState<CouplingMetric[]>([]);
  const [cycles, setCycles] = useState<CycleNode[][]>([]);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  useEffect(() => {
    if (!activeRepo) return;
    let isMounted = true;
    setLoadingMetrics(true);

    Promise.all([
      api.getCoupling(activeRepo.id).catch(() => ({ modules: [] })),
      api.getCycles(activeRepo.id).catch(() => ({ total_cycles: 0, cycles: [] })),
    ]).then(([couplingRes, cyclesRes]) => {
      if (isMounted) {
        setCoupling(couplingRes.modules || []);
        setCycles(cyclesRes.cycles || []);
        setLoadingMetrics(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [activeRepo?.id]);

  if (!activeRepo) return null;

  // Language calculation
  const rawLangs: Record<string, number> = activeRepo.detected_languages || {};
  const totalLangCount = (Object.values(rawLangs) as number[]).reduce((acc: number, c: number) => acc + c, 0) || 1;
  const langEntries = (Object.entries(rawLangs) as [string, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([lang, count]) => ({
      name: lang,
      count,
      pct: Math.round((count / totalLangCount) * 100),
    }));

  const langColors: Record<string, string> = {
    python: '#3572A5',
    typescript: '#3178c6',
    javascript: '#f7df1e',
    html: '#e34c26',
    css: '#563d7c',
    json: '#cbcb41',
    markdown: '#083fa1',
    shell: '#89e051',
  };

  return (
    <div className="overview-content">
      {/* Top Architecture Health Summary */}
      <div className="overview-section">
        <h3 className="overview-section-title">
          <Activity size={16} style={{ color: 'var(--accent-secondary)' }} />
          Architectural Health & Stability
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {/* Cycle detection card */}
          <div
            style={{
              padding: 16,
              background: cycles.length > 0 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(34, 197, 94, 0.08)',
              border: `1px solid ${cycles.length > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'}`,
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              {cycles.length > 0 ? (
                <AlertTriangle size={20} style={{ color: 'var(--color-error)' }} />
              ) : (
                <ShieldCheck size={20} style={{ color: 'var(--color-success)' }} />
              )}
              <h4 style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                {cycles.length > 0 ? `${cycles.length} Circular Dependencies Detected` : 'Zero Circular Dependencies'}
              </h4>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {cycles.length > 0
                ? 'These import cycles break encapsulation and create tight architectural coupling.'
                : 'Clean Directed Acyclic Graph (DAG) structure maintained across module imports.'}
            </p>

            {cycles.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cycles.slice(0, 3).map((cycle, idx) => (
                  <div
                    key={idx}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.68rem',
                      background: 'var(--bg-elevated)',
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {cycle.map((c) => c.label).join(' ➔ ')} ➔ {cycle[0]?.label}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hub & Coupling Summary */}
          <div
            style={{
              padding: 16,
              background: 'var(--glass-bg)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Layers size={20} style={{ color: 'var(--accent-secondary)' }} />
              <h4 style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                Module Coupling & Instability Index
              </h4>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {coupling.filter((m) => m.is_hub).length} critical hub modules detected (high fan-in afferent coupling).
              Average Martin Instability metric: {coupling.length > 0 ? (coupling.reduce((acc, c) => acc + c.instability, 0) / coupling.length).toFixed(2) : '0.00'}.
            </p>
          </div>
        </div>
      </div>

      {/* Language Breakdown */}
      <div className="overview-section">
        <h3 className="overview-section-title">
          <Code size={16} style={{ color: 'var(--accent-secondary)' }} />
          Detected Polyglot Composition
        </h3>

        {langEntries.length === 0 ? (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No language breakdown available yet.</p>
        ) : (
          <div className="language-bars" style={{ maxWidth: 650 }}>
            {langEntries.map((l) => {
              const color = langColors[l.name.toLowerCase()] || 'var(--accent-primary)';
              return (
                <div key={l.name} className="language-bar">
                  <div className="language-bar-label">{l.name}</div>
                  <div className="language-bar-track">
                    <div
                      className="language-bar-fill"
                      style={{ width: `${Math.max(4, l.pct)}%`, background: color }}
                    />
                  </div>
                  <div className="language-bar-pct">
                    {l.pct}% ({l.count})
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Coupling Table */}
      <div className="overview-section">
        <h3 className="overview-section-title">
          <Layers size={16} style={{ color: 'var(--accent-secondary)' }} />
          Afferent / Efferent Coupling by Module
        </h3>

        {loadingMetrics ? (
          <div className="loading-overlay" style={{ height: 100 }}>
            <div className="spinner" />
          </div>
        ) : coupling.length === 0 ? (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            No module coupling computed yet. Complete AST analysis will compute this automatically.
          </p>
        ) : (
          <div style={{ overflowX: 'auto', background: 'var(--glass-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--glass-border)' }}>
            <table className="coupling-table">
              <thead>
                <tr>
                  <th>Module / File</th>
                  <th>Afferent (Ca - Inbound)</th>
                  <th>Efferent (Ce - Outbound)</th>
                  <th>Martin Instability (I)</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {coupling.map((item) => (
                  <tr key={item.file_id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{item.path}</td>
                    <td>{item.afferent_coupling}</td>
                    <td>{item.efferent_coupling}</td>
                    <td>
                      <span
                        style={{
                          fontWeight: 600,
                          color:
                            item.instability > 0.8
                              ? 'var(--color-warning)'
                              : item.instability < 0.2
                              ? 'var(--color-info)'
                              : 'var(--text-primary)',
                        }}
                      >
                        {item.instability.toFixed(2)}
                      </span>
                    </td>
                    <td>
                      {item.is_hub && <span className="hub-badge">CRITICAL HUB</span>}
                      {!item.is_hub && item.instability === 0 && (
                        <span style={{ fontSize: '0.62rem', color: 'var(--color-success)', fontWeight: 600 }}>
                          MAX STABILITY
                        </span>
                      )}
                      {!item.is_hub && item.instability === 1 && (
                        <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                          LEAF MODULE
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
