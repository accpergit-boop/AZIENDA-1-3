# Auth Testing Playbook (Emergent Google Auth + JWT)

This app supports email/password JWT login and Emergent Google sign-in.
- Users collection uses field `id` (UUID) — sessions reference it via `user_id`.
- `get_current_user` accepts: cookie `session_token` (user_sessions), `Authorization: Bearer <JWT>`, or `Authorization: Bearer <session_token>`.
- Google and Apple sign-in create standard accounts automatically; only `ADMIN_EMAIL` becomes owner/admin by default.
- Account registration is open. New email/password accounts are standard users unless the email matches `ADMIN_EMAIL`.
- `/access/users` is admin-only. An admin can promote up to six accounts total or remove another account. The owner and currently signed-in admin cannot be removed; removal revokes sessions and deletes that account's device records and assistant conversations.

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
