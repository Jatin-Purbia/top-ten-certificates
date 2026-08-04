import { CycleWorkspace } from '@/components/cycle-workspace';
export default async function Page({params}:{params:Promise<{id:string}>}){return <CycleWorkspace id={(await params).id}/>}
