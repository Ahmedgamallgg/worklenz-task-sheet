SELECT 'CREATE ROLE worklenz_client'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'worklenz_client') \gexec

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'app_user', :'app_password') \gexec
GRANT worklenz_client TO :"app_user";
