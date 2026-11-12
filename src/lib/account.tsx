import { createContext, useContext } from 'react';

export type Account = { email: string; name: string };

const Ctx = createContext<Account>({ email: '', name: '' });
export const AccountProvider = Ctx.Provider;
export const useAccount = () => useContext(Ctx);
