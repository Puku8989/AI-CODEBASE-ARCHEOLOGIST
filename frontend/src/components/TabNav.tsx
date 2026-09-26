import { BarChart3, GitFork, FileCode2, Binary } from 'lucide-react';

export type ActiveTab = 'overview' | 'graph' | 'explorer' | 'symbols';

interface TabNavProps {
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
}

export function TabNav({ activeTab, onChangeTab }: TabNavProps) {
  const tabs = [
    { id: 'overview' as const, label: 'Overview & Health', icon: BarChart3 },
    { id: 'graph' as const, label: 'Interactive Architecture Graph', icon: GitFork },
    { id: 'explorer' as const, label: 'Code Explorer (Monaco)', icon: FileCode2 },
    { id: 'symbols' as const, label: 'Symbol Catalog', icon: Binary },
  ];

  return (
    <div className="tab-nav">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            className={`tab-btn ${isActive ? 'active' : ''}`}
            onClick={() => onChangeTab(tab.id)}
          >
            <Icon size={14} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
