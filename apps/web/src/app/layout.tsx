import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
export const metadata:Metadata={title:{default:'Pathye Kan Certificates',template:'%s | Pathye Kan'},description:'Secure quiz certificate distribution and result management'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body suppressHydrationWarning><Providers>{children}</Providers></body></html>}
