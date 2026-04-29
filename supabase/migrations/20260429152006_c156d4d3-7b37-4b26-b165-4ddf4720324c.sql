
insert into storage.buckets (id, name, public)
values ('onboarding-attachments', 'onboarding-attachments', false)
on conflict (id) do nothing;

create policy "Onboarding: owners read own attachments"
on storage.objects for select
to authenticated
using (
  bucket_id = 'onboarding-attachments'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Onboarding: owners upload own attachments"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'onboarding-attachments'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Onboarding: owners delete own attachments"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'onboarding-attachments'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Onboarding: admins read all attachments"
on storage.objects for select
to authenticated
using (
  bucket_id = 'onboarding-attachments'
  and public.get_user_role(auth.uid()) = 'admin'::app_role
);
