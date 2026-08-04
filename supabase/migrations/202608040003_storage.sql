insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('certificate-templates','certificate-templates',false,10485760,array['image/jpeg','image/png','application/pdf']),
  ('candidate-private','candidate-private',false,5242880,array['image/jpeg','image/png','image/webp']),
  ('qr-exports','qr-exports',false,10485760,array['image/png','image/svg+xml','application/pdf'])
on conflict (id) do nothing;
-- No client storage policies are created. Uploads/downloads are mediated by the service-role backend.
