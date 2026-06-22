update public.organizations
set email = 'leonardogarciajj@gmail.com', updated_at = now()
where slug = 'escritorio-principal'
  and email = 'leonardogarciajeronimo@gmail.com';

update public.organization_invitations
set email = 'leonardogarciajj@gmail.com'
where lower(email) = 'leonardogarciajeronimo@gmail.com'
  and accepted_at is null;
