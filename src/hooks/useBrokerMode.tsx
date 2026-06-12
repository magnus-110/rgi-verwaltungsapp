import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type BrokerMode = 'rent' | 'sale' | null;

interface BrokerModeContextType {
  brokerMode: BrokerMode;
  setBrokerMode: (mode: BrokerMode) => void;
  brokerSectionOpen: boolean;
  setBrokerSectionOpen: (open: boolean) => void;
}

const BrokerModeContext = createContext<BrokerModeContextType | undefined>(undefined);

export const useBrokerMode = () => {
  const ctx = useContext(BrokerModeContext);
  if (!ctx) throw new Error('useBrokerMode must be used within BrokerModeProvider');
  return ctx;
};

export const BrokerModeProvider = ({ children }: { children: ReactNode }) => {
  const [brokerMode, setBrokerModeState] = useState<BrokerMode>(() => {
    try {
      const v = localStorage.getItem('brokerMode');
      return v === 'rent' || v === 'sale' ? v : null;
    } catch { return null; }
  });
  const [brokerSectionOpen, setBrokerSectionOpenState] = useState<boolean>(() => {
    try { return localStorage.getItem('brokerSectionOpen') !== '0'; } catch { return true; }
  });

  const setBrokerMode = (mode: BrokerMode) => {
    setBrokerModeState(mode);
    try {
      if (mode) localStorage.setItem('brokerMode', mode);
      else localStorage.removeItem('brokerMode');
    } catch {}
  };

  const setBrokerSectionOpen = (open: boolean) => {
    setBrokerSectionOpenState(open);
    try { localStorage.setItem('brokerSectionOpen', open ? '1' : '0'); } catch {}
  };

  return (
    <BrokerModeContext.Provider value={{ brokerMode, setBrokerMode, brokerSectionOpen, setBrokerSectionOpen }}>
      {children}
    </BrokerModeContext.Provider>
  );
};
