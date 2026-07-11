import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-950 text-slate-500 text-xs py-4 px-6 border-t border-slate-900 font-mono text-[14px] text-center mt-auto">
      <div className="mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        <span className="flex items-center text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
          Sovereign Database Active
        </span>
        <span>This financial data node is privately locked in your account. Zero vendor telemetry.</span>
      </div>
    </footer>
  );
};
