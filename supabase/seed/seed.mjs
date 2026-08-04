import { createClient } from '@supabase/supabase-js';
import argon2 from 'argon2';
import { randomBytes, randomUUID } from 'node:crypto';

const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','INITIAL_ADMIN_EMAIL','INITIAL_ADMIN_PASSWORD'];
for(const key of required)if(!process.env[key])throw new Error(`${key} is required`);
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const users=await db.auth.admin.listUsers();
let admin=users.data.users.find(u=>u.email===process.env.INITIAL_ADMIN_EMAIL);
if(!admin){const result=await db.auth.admin.createUser({email:process.env.INITIAL_ADMIN_EMAIL,password:process.env.INITIAL_ADMIN_PASSWORD,email_confirm:true});if(result.error)throw result.error;admin=result.data.user;}
await db.from('admin_profiles').upsert({id:admin.id,display_name:'Initial Super Admin',role:'super_admin',active:true});
let{data:template}=await db.from('certificate_templates').select('*').eq('name','Approved Pathye Kan Certificate').maybeSingle();
if(!template){const result=await db.from('certificate_templates').insert({name:'Approved Pathye Kan Certificate',storage_path:'certificate-demo.jpeg',approved:true,active:true,created_by:admin.id}).select().single();if(result.error)throw result.error;template=result.data;}
const day=86_400_000,makeCycle=(status,offset,resultNumber)=>{const publication=new Date(Date.now()+offset*day),created=new Date().toISOString();return{id:randomUUID(),public_slug:randomBytes(18).toString('hex'),title:'बाल प्रश्नोत्तरी',result_number:resultNumber,issue_number:`PK-${resultNumber}`,display_start_at:publication.toISOString(),display_end_at:new Date(publication.getTime()+15*day).toISOString(),publication_at:publication.toISOString(),expires_at:new Date(publication.getTime()+30*day).toISOString(),download_window_days:30,status,certificate_template_id:template.id,created_by:admin.id,published_at:status==='published'?created:null};};
const cycles=[makeCycle('draft',15,'202'),makeCycle('published',-2,'201'),makeCycle('expired',-40,'200')];cycles[2].expires_at=new Date(Date.now()-10*day).toISOString();
for(const c of cycles){const{error}=await db.from('result_cycles').upsert(c,{onConflict:'public_slug'});if(error)throw error;}
const hindi=['अनया जोशी','विवान मेहता','सान्वी राव','आरव बंसल','काव्या अय्यर','ईशान सेठी','मीरा नायर','अद्विक शाह','तारा कपूर','कबीर वर्मा'];
const english=['Anaya Joshi','Vivaan Mehta','Saanvi Rao','Aarav Bansal','Kavya Iyer','Ishaan Sethi','Meera Nair','Advik Shah','Tara Kapoor','Kabir Verma'];
for(let i=0;i<10;i++){const id=randomUUID(),code=randomBytes(12).toString('base64url'),candidate={id,cycle_id:cycles[1].id,participant_id:`SEED-${String(i+1).padStart(3,'0')}`,certificate_number:`PK201-${String(i+1).padStart(3,'0')}`,public_certificate_id:randomUUID(),name_hindi:hindi[i],name_english:english[i],guardian_name:'Demo Guardian',class_name:String(5+i%3),age:10+i%3,city:['जयपुर','अजमेर','कोटा','जोधपुर','उदयपुर'][i%5],score:100-i,rank:i+1,result_date:cycles[1].publication_at.slice(0,10)};const{error}=await db.from('candidates').upsert(candidate,{onConflict:'cycle_id,participant_id'});if(error)throw error;await db.from('candidate_claim_credentials').upsert({candidate_id:id,hash:await argon2.hash(code,{type:argon2.argon2id})});console.log(`${candidate.participant_id}: ${code}`);}
console.log('Seed complete. The claim codes above are shown once; store them securely for local testing only.');
