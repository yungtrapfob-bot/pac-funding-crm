update public.funder_master
set submission_method = 'tbd'
where submission_method::text = 'unknown_tbd';

update public.funder_master
set submission_method = 'email'
where submission_method::text = 'tbd'
  and (
    coalesce(notes, '') ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
    or coalesce(required_docs, '') ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
    or coalesce(submission_endpoint, '') ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
  );

update public.funder_master
set submission_method = 'portal'
where submission_method::text = 'tbd'
  and (
    coalesce(notes, '') ~* '\mportal\M|\mlogin\M|\mupload\M'
    or coalesce(submission_endpoint, '') ~* '\mportal\M|\mlogin\M|\mupload\M'
  );

update public.funder_master
set submission_method = 'api'
where submission_method::text = 'tbd'
  and (
    coalesce(notes, '') ~* '\mapi\M|webhook|integration'
    or coalesce(submission_endpoint, '') ~* '\mapi\M|webhook|integration'
  );
