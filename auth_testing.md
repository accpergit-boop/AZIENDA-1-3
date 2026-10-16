# Auth Testing Playbook (Emergent Google Auth + JWT)

This app supports BOTH email/password JWT login and Emergent Google sign-in.
- Users collection uses field `id` (UUID) — sessions reference it via `user_id`.
- `get_current_user` accepts: cookie `session_token` (user_sessions), `Authorization: Bearer <JWT>`, or `Authorization: Bearer <session_token>`.
- Google sign-in allowlist: ADMIN_EMAIL + settings.google_allowed_emails. Others -> 403.

## Create test Google-style session
mongosh --eval "
use('test_database');
var uid = 'test-user-' + Date.now(); var tok = 'test_session_' + Date.now();
db.users.insertOne({id: uid, email: 'test.user.' + Date.now() + '@example.com', name: 'Test User', role: 'admin', created_at: new Date()});
db.user_sessions.insertOne({user_id: uid, session_token: tok, expires_at: new Date(Date.now()+7*24*3600*1000), created_at: new Date()});
print(tok);"

## Test
curl -H "Authorization: Bearer <tok>" $API/api/auth/me
Browser: set cookie session_token (httpOnly, secure, sameSite None, path /) then open /.

## Clean
mongosh --eval "use('test_database'); db.users.deleteMany({email:/test\.user\./}); db.user_sessions.deleteMany({session_token:/test_session/});"
