import { useState } from 'react';
import { RepoSelector } from '../../components/eml/RepoSelector';
import { MemoryList } from '../../components/eml/MemoryList';
import { TimelinePanel } from '../../components/eml/TimelinePanel';
import { DriftPanel } from '../../components/eml/DriftPanel';
import { GapsPanel } from '../../components/eml/GapsPanel';
import { IntentsPanel } from '../../components/eml/IntentsPanel';

export default function Memory() {
  const [repositoryId, setRepositoryId] = useState<string | null>(null);

  return (
    <main className="pt-24 pb-12 px-8 max-w-[1440px] mx-auto" aria-labelledby="memory-heading">
      <header className="mb-8">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant mb-2 block">
          Engineering Memory Layer
        </span>
        <h1 id="memory-heading" className="text-4xl font-bold text-on-surface tracking-tight mb-6">
          Memory
        </h1>
        <RepoSelector value={repositoryId} onChange={setRepositoryId} />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MemoryList repositoryId={repositoryId} />
        <TimelinePanel repositoryId={repositoryId} />
        <DriftPanel repositoryId={repositoryId} />
        <GapsPanel repositoryId={repositoryId} />
        <IntentsPanel repositoryId={repositoryId} />
      </div>
    </main>
  );
}
