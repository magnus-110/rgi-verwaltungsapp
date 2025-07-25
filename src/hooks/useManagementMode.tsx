import { createContext, useContext, useState, ReactNode } from 'react';

interface ManagementModeContextType {
  managementMode: 'weg' | 'rent';
  setManagementMode: (mode: 'weg' | 'rent') => void;
}

const ManagementModeContext = createContext<ManagementModeContextType | undefined>(undefined);

export const useManagementMode = () => {
  const context = useContext(ManagementModeContext);
  if (!context) {
    throw new Error('useManagementMode must be used within ManagementModeProvider');
  }
  return context;
};

interface ManagementModeProviderProps {
  children: ReactNode;
}

export const ManagementModeProvider = ({ children }: ManagementModeProviderProps) => {
  const [managementMode, setManagementMode] = useState<'weg' | 'rent'>('weg');

  return (
    <ManagementModeContext.Provider value={{ managementMode, setManagementMode }}>
      {children}
    </ManagementModeContext.Provider>
  );
};