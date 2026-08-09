'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmProvider } from '@pathey/ui';
import { useState } from 'react';
export function Providers({children}:{children:React.ReactNode}){const[client]=useState(()=>new QueryClient({defaultOptions:{queries:{staleTime:30_000,gcTime:10*60_000,retry:1,refetchOnWindowFocus:false}}}));return <QueryClientProvider client={client}><ConfirmProvider>{children}</ConfirmProvider></QueryClientProvider>}
