import { createContext, useContext, useEffect, useState } from 'react';
import { COMPANY, setCompany } from '../utils/company.js';
import { settingsApi } from '../utils/api.js';

const CompanyContext = createContext(null);

export function CompanyProvider({ children }) {
  const [company, setCompanyState] = useState(COMPANY);

  useEffect(() => {
    settingsApi.getCompany().then((c) => { setCompanyState(c); setCompany(c); }).catch(() => {});
  }, []);

  const saveCompany = async (data) => {
    const saved = await settingsApi.saveCompany(data);
    setCompanyState(saved);
    setCompany(saved);
    return saved;
  };

  return (
    <CompanyContext.Provider value={{ company, saveCompany }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}