-- Clean up data for the two non-owner users explicitly (some tables don't FK to auth.users)
DELETE FROM public.user_data WHERE user_id IN ('66b10cad-7de9-4e1d-87fe-08be83492056','3b1afaec-c002-49f5-9e92-9fcbead37a74');
DELETE FROM public.household_members WHERE user_id IN ('66b10cad-7de9-4e1d-87fe-08be83492056','3b1afaec-c002-49f5-9e92-9fcbead37a74');
DELETE FROM public.profiles WHERE user_id IN ('66b10cad-7de9-4e1d-87fe-08be83492056','3b1afaec-c002-49f5-9e92-9fcbead37a74');
DELETE FROM public.research_notes WHERE created_by IN ('66b10cad-7de9-4e1d-87fe-08be83492056','3b1afaec-c002-49f5-9e92-9fcbead37a74');
DELETE FROM public.task_lists WHERE created_by IN ('66b10cad-7de9-4e1d-87fe-08be83492056','3b1afaec-c002-49f5-9e92-9fcbead37a74');
DELETE FROM public.household_invites WHERE invited_by IN ('66b10cad-7de9-4e1d-87fe-08be83492056','3b1afaec-c002-49f5-9e92-9fcbead37a74');

-- Finally remove the auth users themselves
DELETE FROM auth.users WHERE id IN ('66b10cad-7de9-4e1d-87fe-08be83492056','3b1afaec-c002-49f5-9e92-9fcbead37a74');