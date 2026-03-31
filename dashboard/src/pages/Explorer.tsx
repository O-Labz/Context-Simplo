import { useEffect, useRef } from 'react';

export default function Explorer() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    console.log('Graph explorer will be implemented with Sigma.js');
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Graph Explorer</h1>

      <div className="bg-card border border-border rounded-lg p-6">
        <div
          ref={containerRef}
          className="w-full h-[600px] bg-background rounded-md flex items-center justify-center"
        >
          <div className="text-center text-muted-foreground">
            <p className="text-lg mb-2">Graph Visualization</p>
            <p className="text-sm">
              Interactive graph explorer with Sigma.js will be rendered here
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
