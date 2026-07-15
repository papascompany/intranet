# Production Smoke Test

After a Vercel deployment, run these checks against the deployed origin. Do not put secret values in the repository or in chat.

```bash
curl -i https://<deployment-domain>/api/health
```

The response must be `200` and report `database`, `schema`, `session`, `encryption`, and `blob` as `ok`. A `503` response identifies the missing or unreachable dependency without returning secret values.

Then verify the authenticated path in a browser:

1. Log in with an administrator account and confirm the session survives a refresh.
2. Open the employee directory, select an employee, and save a harmless card change.
3. In the admin attendance screen, confirm the full visible employee record set loads, then filter by date and employee.
4. Submit a leave request or attendance correction as an employee, approve it as an administrator, then open the `처리 완료` tab and confirm the request and audit entry remain visible.
5. Import a two-row employee CSV with the workplace name, confirm the preview, issue the accounts, and securely deliver the one-time passwords.
6. Upload one PDF payroll statement and confirm the employee can open only their own statement.

The database deployment must apply every file in `database/migrations` before the smoke test. The Blob check confirms the token is configured; the payroll upload step confirms the token can actually write and read a file.
