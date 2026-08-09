const base=(process.env.NEXT_PUBLIC_API_URL??'http://localhost:4000/api/v1').replace(/\/$/,'');
export const apiUrl=(path:string)=>`${base}${path.startsWith('/')?path:`/${path}`}`;
export async function adminFetch<T>(path:string,init:RequestInit={}){const token=typeof window!=='undefined'?localStorage.getItem('admin_token'):null;const demo=typeof window!=='undefined'?(localStorage.getItem('demo_admin')??'demo-super-admin'):'demo-super-admin';const response=await fetch(apiUrl(path),{...init,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{'x-demo-admin':demo}),...init.headers},credentials:'include'});const json=await response.json().catch(()=>({error:{message:'The server returned an unreadable response.'}}));if(!response.ok)throw new Error(json.error?.message??'Request failed');return json as T;}
async function fetchAdminBlob(path:string){const token=localStorage.getItem('admin_token'),demo=localStorage.getItem('demo_admin')??'demo-super-admin';const response=await fetch(apiUrl(path),{headers:token?{authorization:`Bearer ${token}`}:{'x-demo-admin':demo}});if(!response.ok)throw new Error((await response.json()).error?.message??'Export failed');return response.blob();}
export async function downloadAdmin(path:string,filename:string){const blob=await fetchAdminBlob(path),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);}
// Returns an object URL for an <iframe>/embed rather than triggering a save —
// admin auth is a Bearer token, which a plain iframe src can't attach, so the
// PDF has to be fetched with the right headers first and handed back as a blob.
export async function previewAdmin(path:string){const blob=await fetchAdminBlob(path);return URL.createObjectURL(blob);}
export const formatIndia=(value:string)=>new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(value));
