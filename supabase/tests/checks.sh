#!/bin/bash
# Runs against the scratch database prepared by scratch_db.sh (shim + migrations x2 + seed). Do not run directly.
export PGHOST PGPORT PGUSER PGDATABASE
HERE=$(cd "$(dirname "$0")" && pwd); SUPA=$(dirname "$HERE")
pass=0; failn=0
q()  { psql -X -At -v ON_ERROR_STOP=1 -c "$1" 2>&1; }                 # superuser (no JWT, like manual SQL)
qx() { psql -X -At -c "$1" 2>&1; }                                     # superuser, errors tolerated
as() { local uid=$1; shift; printf '%s\n' "set role authenticated;" "select set_config('request.jwt.claim.sub','$uid',false) \\gset" "$*;" | psql -X -At 2>&1 | grep -v -x SET; }
asv(){ local uid=$1; shift; printf '%s\n' '\set VERBOSITY verbose' "set role authenticated;" "select set_config('request.jwt.claim.sub','$uid',false) \\gset" "$*;" | psql -X -At 2>&1 | grep -v -x SET; }
anon(){ printf '%s\n' "set role anon;" "$*;" | psql -X -At 2>&1 | grep -v -x SET; }
expect()   { if [ "$3" == "$2" ]; then pass=$((pass+1)); echo "ok   $1"; else failn=$((failn+1)); echo "FAIL $1: want [$2] got [$3]"; fi; }
contains() { if grep -q -F -- "$2" <<<"$3"; then pass=$((pass+1)); echo "ok   $1"; else failn=$((failn+1)); echo "FAIL $1: want text [$2] got [$3]"; fi; }
nocontain(){ if grep -q -F -- "$2" <<<"$3"; then failn=$((failn+1)); echo "FAIL $1: unexpected text [$2] in [$3]"; else pass=$((pass+1)); echo "ok   $1"; fi; }
denied()   { contains "$1" "permission denied" "$2"; }
rlsdeny()  { contains "$1" "row-level security" "$2"; }
sp()  { as "$1" "select r->>'applied' from (select public.save_progress('$2'::jsonb) r) x"; }                  # applied keys
spq() { as "$1" "select $3 from (select public.save_progress('$2'::jsonb) r) x"; }

q "update app_settings set value='SECRET1' where key='teacher_code'" >/dev/null
T=11111111-1111-1111-1111-111111111111; T2=22222222-2222-2222-2222-222222222222
S1=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1; S2=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2; S3=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3
ADM=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1; S4=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4; S6=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6
S7=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7; D1=dddddddd-dddd-dddd-dddd-ddddddddddd1; DT=dddddddd-dddd-dddd-dddd-ddddddddddd2
S5=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5
for u in $T $T2 $S1 $S2 $S3 $ADM $S4 $S6 $S7 $D1 $DT $S5; do
  q "insert into auth.users(id,email,raw_user_meta_data) values ('$u','$u@x', '{\"full_name\":\"User $u\"}')" >/dev/null; done

echo "=== (a) prototype checks (ported) ==="
expect "profile created as student" "student" "$(q "select role from profiles where id='$T'")"
expect "wrong teacher code" "f" "$(as $T "select claim_teacher('nope')")"
expect "right teacher code" "t" "$(as $T "select claim_teacher('SECRET1')")"
as $T2 "select claim_teacher('SECRET1')" >/dev/null
rlsdeny "student cannot make class" "$(as $S1 "insert into classes(teacher_id,name,join_code) values ('$S1','x','ZZZ') returning 1")"
CL=$(as $T "insert into classes(teacher_id,name,join_code) values ('$T','Period 1','ABC123') returning id" | head -1)
expect "teacher creates class" "36" "${#CL}"
# CHANGED vs prototype: an unknown code returns no rows instead of raising P0002 (so attempts stay counted by the rate limit).
expect "bad join code" "0" "$(as $S1 "select count(*) from join_class('zzzzzz')")"
expect "join (lower case)" "Period 1" "$(as $S1 "select name from join_class(' abc123 ')" | head -1)"
as $S2 "select * from join_class('ABC123')" >/dev/null
for s in $S1 $S2 $S3; do as $s "insert into progress(user_id,key,data) values ('$s','quiz:1:q1','{\"choice\":1,\"right\":true}'),('$s','pred:1:p1','{\"right\":false}'),('$s','ex:1:e1','{\"pass\":true,\"hints\":2}'),('$s','read:1','{}')" >/dev/null; done
rlsdeny "student cannot write others" "$(as $S1 "insert into progress(user_id,key,data) values ('$S2','x:1','{}')")"
expect "student sees own rows only" "4" "$(as $S1 "select count(*) from progress")"
expect "teacher sees class rows (S1,S2)" "8" "$(as $T "select count(*) from progress")"
expect "other teacher sees none" "0" "$(as $T2 "select count(*) from progress")"
expect "teacher cannot edit student rows" "UPDATE 0" "$(as $T "update progress set data='{}' where user_id='$S1'")"
expect "teacher sees student profiles" "3" "$(as $T "select count(*) from profiles")"
expect "student sees only self profile" "1" "$(as $S1 "select count(*) from profiles")"
denied "no role self-promotion" "$(as $S1 "update profiles set role='teacher' where id='$S1'")"
expect "name editable" "UPDATE 1" "$(as $S1 "update profiles set full_name='New' where id='$S1'")"
expect "student reads own class" "Period 1" "$(as $S1 "select name from classes")"
expect "non-member sees no classes" "0" "$(as $S3 "select count(*) from classes")"
expect "teacher2 sees no classes" "0" "$(as $T2 "select count(*) from classes")"
AID=$(as $T "insert into assignments(class_id,page_id,title,due_at) values ('$CL','1-numbers','Numbers','2030-01-01') returning id" | head -1)
expect "assignment created" "36" "${#AID}"
expect "student reads assignment" "1" "$(as $S1 "select count(*) from assignments")"
expect "outsider no assignment" "0" "$(as $S3 "select count(*) from assignments")"
rlsdeny "student cannot add assignment" "$(as $S1 "insert into assignments(class_id,page_id) values ('$CL','x')")"
rlsdeny "teacher2 cannot add assignment" "$(as $T2 "insert into assignments(class_id,page_id) values ('$CL','x')")"
expect "class_progress rows" "2" "$(as $T "select count(*) from class_progress('$CL')")"
expect "class_progress totals" "1|0|1|1|1|1|2|t" "$(as $T "select preds,preds_right,quizzes,quizzes_right,ex_pass,ex_tried,hints,is_read from class_progress('$CL') where student_id='$S1' and ch=1")"
contains "class_progress denied to other teacher" "not your class" "$(as $T2 "select * from class_progress('$CL')")"
contains "class_progress denied to student" "not your class" "$(as $S1 "select * from class_progress('$CL')")"
denied "app_settings unreadable" "$(as $T "select * from app_settings")"
expect "student leaves class" "DELETE 1" "$(as $S2 "delete from enrollments where student_id='$S2'")"
expect "teacher no longer sees S2 rows" "4" "$(as $T "select count(*) from progress")"
denied "anon cannot call join_class" "$(anon "select * from join_class('ABC123')")"

echo "=== (b) profiles ==="
expect "locale defaults to en" "en" "$(q "select locale from profiles where id='$S1'")"
expect "age_band null until chosen" "t" "$(q "select age_band is null from profiles where id='$S1'")"
expect "display_prefs defaults to {}" "{}" "$(q "select display_prefs from profiles where id='$S1'")"
expect "no date-of-birth column exists" "0" "$(q "select count(*) from information_schema.columns where table_schema='public' and column_name ~* 'birth|dob'")"
expect "student sets locale fa" "UPDATE 1" "$(as $S1 "update profiles set locale='fa' where id='$S1'")"
expect "locale stored" "fa" "$(q "select locale from profiles where id='$S1'")"
contains "bad locale rejected" "profiles_locale_check" "$(as $S1 "update profiles set locale='de' where id='$S1'")"
expect "age_band 13_15 accepted" "UPDATE 1" "$(as $S1 "update profiles set age_band='13_15' where id='$S1'")"
contains "bad age_band rejected" "profiles_age_band_check" "$(as $S1 "update profiles set age_band='teen' where id='$S1'")"
expect "age_band can be cleared" "UPDATE 1" "$(as $S1 "update profiles set age_band=null where id='$S1'")"
expect "display_prefs editable" "UPDATE 1" "$(as $S1 "update profiles set display_prefs='{\"theme\":\"dark\",\"fontScale\":1.2}' where id='$S1'")"
contains "display_prefs >8KB rejected" "profiles_display_prefs_check" "$(as $S1 "update profiles set display_prefs=jsonb_build_object('x',repeat('a',9000)) where id='$S1'")"
contains "display_prefs must be an object" "profiles_display_prefs_check" "$(as $S1 "update profiles set display_prefs='[1]' where id='$S1'")"
expect "student cannot edit another profile" "UPDATE 0" "$(as $S1 "update profiles set locale='fa' where id='$S2'")"
expect "other profile untouched" "en" "$(q "select locale from profiles where id='$S2'")"
denied "student cannot edit username" "$(as $S1 "update profiles set username='hacker' where id='$S1'")"
denied "student cannot edit id" "$(as $S1 "update profiles set id=gen_random_uuid() where id='$S1'")"
denied "student cannot self-promote to platform_admin" "$(as $S1 "update profiles set role='platform_admin' where id='$S1'")"
denied "teacher cannot self-promote to platform_admin" "$(as $T "update profiles set role='platform_admin' where id='$T'")"
contains "role guard trigger blocks privileged roles even with a JWT" "granted manually" "$(qx "select set_config('request.jwt.claim.sub','$S1',false); update profiles set role='platform_admin' where id='$S1'")"
expect "platform_admin granted by hand (SQL)" "UPDATE 1" "$(q "update profiles set role='platform_admin' where id='$ADM'")"
expect "content_editor granted by hand (SQL)" "UPDATE 1" "$(q "update profiles set role='content_editor' where id='$S6'")"
contains "unknown role rejected" "profiles_role_check" "$(qx "update profiles set role='god' where id='$S7'")"
expect "platform_admin sees only own profile" "1" "$(as $ADM "select count(*) from profiles")"
expect "claim_teacher does not demote platform_admin" "f|platform_admin" "$(as $ADM "select claim_teacher('SECRET1')")|$(q "select role from profiles where id='$ADM'")"
expect "claim_teacher leaves content_editor alone" "f|content_editor" "$(as $S6 "select claim_teacher('SECRET1')")|$(q "select role from profiles where id='$S6'")"
q "update app_settings set value='CHANGE-ME-BEFORE-SHARING' where key='teacher_code'" >/dev/null
expect "claim_teacher refuses the placeholder code" "f" "$(as $S3 "select claim_teacher('CHANGE-ME-BEFORE-SHARING')")"
q "update app_settings set value='SECRET1' where key='teacher_code'" >/dev/null
denied "anon cannot read profiles" "$(anon "select * from profiles")"
q "insert into auth.users(id,email,raw_user_meta_data) values (gen_random_uuid(),'sara@x','{\"username\":\"Sara\"}')" >/dev/null
contains "username unique ignoring case (sign-up)" "username taken" "$(qx "insert into auth.users(id,email,raw_user_meta_data) values (gen_random_uuid(),'sara2@x','{\"username\":\"sARA\"}')")"
contains "unique index on lower(username) backs it up" "profiles_username_lower_key" "$(qx "update profiles set username='SARA' where id='$S3'")"
contains "username index is partial on lower(username)" "lower(username)" "$(q "select indexdef from pg_indexes where indexname='profiles_username_lower_key'")"
contains "too-short username rejected at sign-up" "invalid username" "$(qx "insert into auth.users(id,email,raw_user_meta_data) values (gen_random_uuid(),'a@x','{\"username\":\"ab\"}')")"
contains "username with spaces rejected at sign-up" "invalid username" "$(qx "insert into auth.users(id,email,raw_user_meta_data) values (gen_random_uuid(),'b@x','{\"username\":\"a b c\"}')")"
expect "several users may have no username" "t" "$(q "select count(*) > 3 from profiles where username is null")"

echo "=== (b) progress ==="
expect "client_ts default 0 and rev 1" "0|1" "$(q "select client_ts,rev from progress where user_id='$S1' and key='read:1'")"
as $S1 "update progress set data='{\"x\":1}', rev=99 where key='read:1'" >/dev/null
expect "rev is server-controlled (bumped, not client value)" "2" "$(q "select rev from progress where user_id='$S1' and key='read:1'")"
as $S1 "insert into progress(user_id,key,data,updated_at) values ('$S1','misc:ua','{}','2000-01-01')" >/dev/null
expect "updated_at is server-controlled" "t" "$(q "select updated_at > now() - interval '1 minute' from progress where user_id='$S1' and key='misc:ua'")"
contains "progress key format enforced" "progress_key_format_check" "$(as $S1 "insert into progress(user_id,key,data) values ('$S1','BAD KEY','{}')")"
expect "teacher cannot delete student rows" "DELETE 0" "$(as $T "delete from progress where user_id='$S1'")"
rlsdeny "teacher cannot insert student rows" "$(as $T "insert into progress(user_id,key,data) values ('$S1','t:1','{}')")"
expect "second student cannot read first student's rows" "0" "$(as $S2 "select count(*) from progress where user_id='$S1'")"
expect "unrelated teacher cannot read student rows" "0" "$(as $T2 "select count(*) from progress where user_id='$S1'")"
expect "platform_admin has no special read on progress" "0" "$(as $ADM "select count(*) from progress")"
denied "anon cannot read progress" "$(anon "select * from progress")"
TS=1760000000000
expect "save_progress: new key applied" '["misc:a"]' "$(sp $S1 '[{"key":"misc:a","data":{"v":1},"client_ts":1760000000100}]')"
expect "save_progress: stored row" "1|1760000000100|1" "$(q "select data->>'v',client_ts,rev from progress where user_id='$S1' and key='misc:a'")"
expect "save_progress: stale write reported as conflict" "misc:a|1|1760000000100" "$(spq $S1 '[{"key":"misc:a","data":{"v":0},"client_ts":1760000000050}]' "r->'conflicts'->0->>'key' || '|' || (r->'conflicts'->0->'stored'->'data'->>'v') || '|' || (r->'conflicts'->0->'stored'->>'client_ts')")"
expect "save_progress: stale write not in applied" "[]" "$(spq $S1 '[{"key":"misc:a","data":{"v":0},"client_ts":1760000000050}]' "r->>'applied'")"
expect "save_progress: stale write not stored" "1|1" "$(q "select data->>'v',rev from progress where user_id='$S1' and key='misc:a'")"
expect "save_progress: newer write wins" "2|1760000000200|2" "$(as $S1 "select 1 from (select save_progress('[{\"key\":\"misc:a\",\"data\":{\"v\":2},\"client_ts\":1760000000200}]'::jsonb)) x" >/dev/null; q "select data->>'v',client_ts,rev from progress where user_id='$S1' and key='misc:a'")"
expect "save_progress: equal client_ts applies" "3" "$(sp $S1 '[{"key":"misc:a","data":{"v":3},"client_ts":1760000000200}]' >/dev/null; q "select data->>'v' from progress where user_id='$S1' and key='misc:a'")"
sp $S1 '[{"key":"ex:9:e1","data":{"pass":true,"attempts":3,"hints":1,"code":"a"},"client_ts":1760000000300}]' >/dev/null
expect "ex merge: older incoming is merged, not a conflict" "[]" "$(spq $S1 '[{"key":"ex:9:e1","data":{"pass":false,"attempts":1,"hints":4,"code":"b"},"client_ts":1760000000250}]' "r->>'conflicts'")"
expect "ex merge: pass=OR, attempts=max, hints=max, newer code kept (stored newer)" "true|3|4|a|1760000000300" "$(q "select data->>'pass',data->>'attempts',data->>'hints',data->>'code',client_ts from progress where user_id='$S1' and key='ex:9:e1'")"
sp $S1 '[{"key":"ex:9:e1","data":{"pass":false,"attempts":2,"code":"c"},"client_ts":1760000000400}]' >/dev/null
expect "ex merge: newer incoming code wins, pass stays true, hints kept" "true|3|4|c|1760000000400" "$(q "select data->>'pass',data->>'attempts',data->>'hints',data->>'code',client_ts from progress where user_id='$S1' and key='ex:9:e1'")"
sp $S1 '[{"key":"ex:9:e2","data":{"pass":false,"attempts":1},"client_ts":1760000000100}]' >/dev/null
sp $S1 '[{"key":"ex:9:e2","data":{"pass":true},"client_ts":1760000000200}]' >/dev/null
expect "ex merge: pass false->true, attempts kept when newer omits it" "true|1" "$(q "select data->>'pass',data->>'attempts' from progress where user_id='$S1' and key='ex:9:e2'")"
sp $S1 '[{"key":"read:9","data":{"done":true,"at":5},"client_ts":1760000000300}]' >/dev/null
sp $S1 '[{"key":"read:9","data":{"done":false,"at":9},"client_ts":1760000000400}]' >/dev/null
expect "read:* is monotonic (never un-read), other fields from newer" "true|9" "$(q "select data->>'done',data->>'at' from progress where user_id='$S1' and key='read:9'")"
sp $S1 '[{"key":"bm:9:l1","data":{"on":false},"client_ts":1760000000400}]' >/dev/null
expect "bm:* older true still wins over newer false" "[]" "$(spq $S1 '[{"key":"bm:9:l1","data":{"on":true},"client_ts":1760000000100}]' "r->>'conflicts'")"
expect "bm:* monotonic value" "true" "$(q "select data->>'on' from progress where user_id='$S1' and key='bm:9:l1'")"
expect "save_progress: 200 items accepted" "200" "$(as $S1 "select jsonb_array_length(r->'applied') from (select save_progress((select jsonb_agg(jsonb_build_object('key','bulk:'||g,'data','{}'::jsonb,'client_ts',1760000000000)) from generate_series(1,200) g)) r) x")"
contains "save_progress: 201 items refused" "too many items" "$(as $S1 "select save_progress((select jsonb_agg(jsonb_build_object('key','bulk:'||g,'data','{}'::jsonb,'client_ts',1760000000000)) from generate_series(1,201) g))")"
expect "save_progress: uppercase key rejected" "bad key" "$(spq $S1 '[{"key":"Bad","data":{},"client_ts":1760000000000}]' "r->'rejected'->0->>'reason'")"
expect "save_progress: 121-char key rejected" "bad key" "$(as $S1 "select r->'rejected'->0->>'reason' from (select save_progress(jsonb_build_array(jsonb_build_object('key',repeat('a',121),'data','{}'::jsonb,'client_ts',1760000000000))) r) x")"
expect "save_progress: key with space rejected" "bad key" "$(spq $S1 '[{"key":"a b","data":{},"client_ts":1760000000000}]' "r->'rejected'->0->>'reason'")"
expect "save_progress: non-object data rejected" "data must be an object" "$(spq $S1 '[{"key":"misc:z","data":[1],"client_ts":1760000000000}]' "r->'rejected'->0->>'reason'")"
expect "save_progress: oversize data rejected" "data too large" "$(as $S1 "select r->'rejected'->0->>'reason' from (select save_progress(jsonb_build_array(jsonb_build_object('key','misc:big','data',jsonb_build_object('k',repeat('a',200000)),'client_ts',1760000000000))) r) x")"
expect "save_progress: missing client_ts rejected" "bad client_ts" "$(spq $S1 '[{"key":"misc:z","data":{}}]' "r->'rejected'->0->>'reason'")"
expect "save_progress: negative client_ts rejected" "bad client_ts" "$(spq $S1 '[{"key":"misc:z","data":{},"client_ts":-5}]' "r->'rejected'->0->>'reason'")"
expect "save_progress: future client_ts rejected" "client_ts is in the future" "$(as $S1 "select r->'rejected'->0->>'reason' from (select save_progress(jsonb_build_array(jsonb_build_object('key','misc:z','data','{}'::jsonb,'client_ts',(extract(epoch from now())*1000)::bigint + 172800000))) r) x")"
contains "save_progress: non-array refused" "items must be a json array" "$(as $S1 "select save_progress('{\"a\":1}'::jsonb)")"
expect "save_progress: good items still applied next to bad ones" '["misc:ok"]|1' "$(spq $S1 '[{"key":"misc:ok","data":{},"client_ts":1760000000000},{"key":"BAD","data":{},"client_ts":1}]' "(r->>'applied') || '|' || jsonb_array_length(r->'rejected')")"
expect "save_progress: rejected key never stored" "0" "$(q "select count(*) from progress where key in ('Bad','BAD','a b','misc:z','misc:big')")"
sp $T '[{"key":"ex:9:e1","data":{"pass":false},"client_ts":1760000000999}]' >/dev/null
expect "save_progress only writes the caller's own rows" "1760000000400|1" "$(q "select client_ts, (select count(*) from progress where user_id='$T' and key='ex:9:e1') from progress where user_id='$S1' and key='ex:9:e1'")"
expect "teacher reads student's saved progress" "3" "$(as $T "select data->>'v' from progress where user_id='$S1' and key='misc:a'")"
denied "anon cannot call save_progress" "$(anon "select save_progress('[]')")"

echo "=== (b) audit_log ==="
denied "anon cannot call write_audit" "$(anon "select write_audit('user.consent','x','{}')")"
expect "student writes an audit entry (returns id)" "t" "$(as $S1 "select write_audit('user.consent','privacy-v1','{\"ok\":true}') > 0")"
contains "reserved namespace account. refused" "reserved action namespace" "$(as $S1 "select write_audit('account.delete','x')")"
contains "reserved namespace flag. refused" "reserved action namespace" "$(as $S1 "select write_audit('flag.insert','x')")"
contains "reserved namespace role. refused" "reserved action namespace" "$(as $S1 "select write_audit('role.grant','x')")"
contains "bad action charset refused" "bad action" "$(as $S1 "select write_audit('Bad Action','x')")"
contains "oversize details refused" "bad details" "$(as $S1 "select write_audit('user.x','x',jsonb_build_object('k',repeat('a',5000)))")"
contains "non-object details refused" "bad details" "$(as $S1 "select write_audit('user.x','x','[1]'::jsonb)")"
expect "student sees no audit_log rows (RLS)" "0" "$(as $S1 "select count(*) from audit_log")"
expect "second student sees no audit_log rows (RLS)" "0" "$(as $S2 "select count(*) from audit_log")"
expect "teacher sees no audit_log rows (RLS)" "0" "$(as $T "select count(*) from audit_log")"
expect "unrelated teacher sees no audit_log rows (RLS)" "0" "$(as $T2 "select count(*) from audit_log")"
denied "anon cannot read audit_log" "$(anon "select * from audit_log")"
denied "student cannot insert into audit_log directly" "$(as $S1 "insert into audit_log(action) values ('user.x')")"
expect "platform_admin reads audit_log" "1" "$(as $ADM "select count(*) from audit_log where action='user.consent'")"
expect "audit actor is the caller" "$S1" "$(as $ADM "select actor from audit_log where action='user.consent'")"
denied "platform_admin cannot insert audit_log directly" "$(as $ADM "insert into audit_log(action) values ('user.x')")"
denied "platform_admin cannot update audit_log" "$(as $ADM "update audit_log set action='user.y'")"
denied "platform_admin cannot delete audit_log" "$(as $ADM "delete from audit_log")"
contains "audit_log UPDATE blocked even for the owner" "append-only" "$(qx "update audit_log set action='user.y'")"
contains "audit_log DELETE blocked even for the owner" "append-only" "$(qx "delete from audit_log")"
contains "audit_log TRUNCATE blocked even for the owner" "append-only" "$(qx "truncate audit_log")"

echo "=== (b) feature_flags ==="
expect "student reads flags (seeded)" "2" "$(as $S1 "select count(*) from feature_flags")"
expect "teacher reads flags" "2" "$(as $T2 "select count(*) from feature_flags")"
denied "anon cannot read flags" "$(anon "select * from feature_flags")"
rlsdeny "student cannot insert flag" "$(as $S1 "insert into feature_flags(key) values ('x')")"
rlsdeny "teacher cannot insert flag" "$(as $T "insert into feature_flags(key) values ('x')")"
expect "student cannot update flag" "UPDATE 0" "$(as $S1 "update feature_flags set enabled=true")"
expect "student cannot delete flag" "DELETE 0" "$(as $S1 "delete from feature_flags")"
expect "flags unchanged after attempts" "2|1" "$(q "select count(*), count(*) filter (where enabled) from feature_flags")"
expect "platform_admin inserts flag" "INSERT 0 1" "$(as $ADM "insert into feature_flags(key,enabled,updated_at) values ('new_ui',true,'2000-01-01')")"
expect "platform_admin updates flag" "UPDATE 1" "$(as $ADM "update feature_flags set enabled=false, rollout='{\"pct\":10}' where key='new_ui'")"
expect "updated_at is server-controlled" "t" "$(q "select updated_at > now() - interval '1 minute' from feature_flags where key='new_ui'")"
contains "flag key charset enforced" "feature_flags_key_check" "$(as $ADM "insert into feature_flags(key) values ('Bad Key')")"
contains "flag rollout must be an object" "feature_flags_rollout_check" "$(as $ADM "update feature_flags set rollout='[]' where key='new_ui'")"
expect "platform_admin deletes flag" "DELETE 1" "$(as $ADM "delete from feature_flags where key='new_ui'")"
expect "flag insert/update/delete audited" "flag.delete,flag.insert,flag.update" "$(as $ADM "select string_agg(action, ',' order by action) from audit_log where target='new_ui'")"
expect "flag audit keeps old and new values" "true|false" "$(as $ADM "select (details->'old'->>'enabled') || '|' || (details->'new'->>'enabled') from audit_log where action='flag.update' and target='new_ui'")"
expect "flag audit actor is the admin" "$ADM" "$(as $ADM "select distinct actor from audit_log where target='new_ui'")"
expect "seed flags audited with no actor" "2" "$(q "select count(*) from audit_log where action='flag.insert' and actor is null")"

echo "=== (b) analytics_events ==="
expect "student logs own event" "INSERT 0 1" "$(as $S1 "insert into analytics_events(user_id,session,name,props) values ('$S1','s-1','lesson.open','{\"ch\":3}')")"
expect "student logs anonymous event (user_id null)" "INSERT 0 1" "$(as $S1 "insert into analytics_events(session,name) values ('s-1','lesson.close')")"
rlsdeny "cannot log an event as another user" "$(as $S1 "insert into analytics_events(user_id,name) values ('$S2','x')")"
denied "anon cannot log events" "$(anon "insert into analytics_events(name) values ('x')")"
expect "student sees no analytics rows (RLS)" "0" "$(as $S1 "select count(*) from analytics_events")"
expect "second student sees no analytics rows (RLS)" "0" "$(as $S2 "select count(*) from analytics_events")"
expect "teacher sees no analytics rows (RLS)" "0" "$(as $T "select count(*) from analytics_events")"
expect "unrelated teacher sees no analytics rows (RLS)" "0" "$(as $T2 "select count(*) from analytics_events")"
denied "anon cannot read analytics" "$(anon "select * from analytics_events")"
expect "platform_admin reads analytics" "2" "$(as $ADM "select count(*) from analytics_events")"
denied "student cannot update analytics" "$(as $S1 "update analytics_events set name='x'")"
denied "student cannot delete analytics" "$(as $S1 "delete from analytics_events")"
denied "client cannot set event timestamp" "$(as $S1 "insert into analytics_events(at,name) values ('2000-01-01','x')")"
contains "client cannot set event id" "identity column" "$(as $S1 "insert into analytics_events(id,name) values (1,'x')")"
expect "id is not an insertable column for users" "f" "$(q "select has_column_privilege('authenticated','public.analytics_events','id','INSERT')")"
contains "name charset: upper case refused" "analytics_events_name_check" "$(as $S1 "insert into analytics_events(name) values ('Lesson')")"
contains "name charset: e-mail like text refused (no PII)" "analytics_events_name_check" "$(as $S1 "insert into analytics_events(name) values ('a@b.com')")"
contains "name charset: spaces refused" "analytics_events_name_check" "$(as $S1 "insert into analytics_events(name) values ('a b')")"
contains "name longer than 64 refused" "analytics_events_name_check" "$(as $S1 "insert into analytics_events(name) values (repeat('a',65))")"
contains "session longer than 64 refused" "analytics_events_session_check" "$(as $S1 "insert into analytics_events(session,name) values (repeat('a',65),'x')")"
contains "props >= 4KB refused" "analytics_events_props_check" "$(as $S1 "insert into analytics_events(name,props) values ('x',jsonb_build_object('k',repeat('a',4100)))")"
contains "props must be an object" "analytics_events_props_check" "$(as $S1 "insert into analytics_events(name,props) values ('x','[1]')")"

echo "=== (b) rate limits ==="
denied "student cannot read rate_limits" "$(as $S1 "select * from rate_limits")"
denied "anon cannot read rate_limits" "$(anon "select * from rate_limits")"
denied "student cannot write rate_limits" "$(as $S1 "delete from rate_limits")"
denied "check_rate is not callable by users" "$(as $S1 "select check_rate('x',1,1)")"
denied "cleanup_rate_limits is not callable by users" "$(as $S1 "select cleanup_rate_limits()")"
denied "anon cannot call check_rate" "$(anon "select check_rate('x',1,1)")"
R=$(as $S4 "do \$\$ declare i int; begin for i in 1..10 loop perform * from join_class('ABC123'); end loop;
  begin perform * from join_class('ABC123'); raise notice 'NOT LIMITED'; exception when sqlstate 'P0001' then raise notice 'limited: %', sqlerrm; end; end \$\$")
contains "join_class: the 11th call in a window trips the limit (P0001 'rate limited')" "limited: rate limited" "$R"
nocontain "join_class: first 10 calls pass" "NOT LIMITED" "$R"
expect "join_class: counter holds at 10" "10" "$(q "select hits from rate_limits where user_id='$S4' and bucket='join_class'")"
contains "join_class: 12th call still limited, SQLSTATE P0001" "P0001" "$(asv $S4 "select * from join_class('ABC123')")"
expect "join_class: limit is per user" "Period 1" "$(as $S1 "select name from join_class('ABC123')")"
expect "join_class: S4 did get enrolled by the first calls" "1" "$(q "select count(*) from enrollments where student_id='$S4'")"
q "update rate_limits set window_start = window_start - interval '2 days' where user_id='$S4'" >/dev/null
expect "join_class: a new window resets the counter" "Period 1" "$(as $S4 "select name from join_class('ABC123')")"
R=$(as $S7 "do \$\$ begin for i in 1..5 loop perform claim_teacher('wrong'); end loop;
  begin perform claim_teacher('wrong'); raise notice 'NOT LIMITED'; exception when sqlstate 'P0001' then raise notice 'limited: %', sqlerrm; end; end \$\$")
contains "claim_teacher: the 6th call in a window trips the limit" "limited: rate limited" "$R"
nocontain "claim_teacher: first 5 calls pass" "NOT LIMITED" "$R"
expect "claim_teacher: limited user is still a student" "student" "$(q "select role from profiles where id='$S7'")"
q "insert into rate_limits(user_id,bucket,window_start,hits) values ('$S3','claim_teacher', to_timestamp(floor(extract(epoch from now())/600)*600), 5) on conflict (user_id,bucket,window_start) do update set hits=5" >/dev/null
contains "claim_teacher: over limit raises P0001 even with the right code" "P0001" "$(asv $S3 "select claim_teacher('SECRET1')")"
expect "claim_teacher: blocked user did not become teacher" "student" "$(q "select role from profiles where id='$S3'")"
expect "cleanup_rate_limits removes old windows" "t" "$(q "select cleanup_rate_limits() >= 1")"
expect "cleanup_rate_limits keeps current windows" "t" "$(q "select count(*) >= 1 from rate_limits where window_start > now() - interval '1 day'")"

echo "=== (b) export_my_data / delete_my_account ==="
denied "anon cannot export" "$(anon "select export_my_data()")"
denied "anon cannot delete account" "$(anon "select delete_my_account()")"
expect "export covers every data table" "account,analytics_events,assignments,audit_log,classes,enrollments,exported_at,profile,progress,rate_limits" "$(as $S1 "select string_agg(k,',' order by k) from jsonb_object_keys(export_my_data()) k")"
expect "export: own profile" "$S1" "$(as $S1 "select export_my_data()->'profile'->>'id'")"
expect "export: account e-mail" "$S1@x" "$(as $S1 "select export_my_data()->'account'->>'email'")"
expect "export: all own progress rows" "$(q "select count(*) from progress where user_id='$S1'")" "$(as $S1 "select jsonb_array_length(export_my_data()->'progress')")"
expect "export: own analytics events (the anonymous one is not linkable)" "1" "$(as $S1 "select jsonb_array_length(export_my_data()->'analytics_events')")"
expect "export: own audit entries" "1" "$(as $S1 "select jsonb_array_length(export_my_data()->'audit_log')")"
expect "export: own enrollments" "1" "$(as $S1 "select jsonb_array_length(export_my_data()->'enrollments')")"
expect "export: student has no classes" "0" "$(as $S1 "select jsonb_array_length(export_my_data()->'classes')")"
expect "export: never contains another user's id (student)" "0" "$(as $S1 "select position('$S2' in export_my_data()::text) + position('$T' in export_my_data()::text)")"
expect "export: teacher gets own class and assignment" "1|1" "$(as $T "select jsonb_array_length(export_my_data()->'classes') || '|' || jsonb_array_length(export_my_data()->'assignments')")"
expect "export: teacher export has no student ids" "0" "$(as $T "select position('$S1' in export_my_data()::text) + position('$S4' in export_my_data()::text)")"
expect "export: unrelated teacher has no classes" "0" "$(as $T2 "select jsonb_array_length(export_my_data()->'classes')")"
expect "export: platform_admin gets only own data" "$ADM" "$(as $ADM "select export_my_data()->'profile'->>'id'")"
# student account deletion
as $D1 "select * from join_class('ABC123')" >/dev/null
as $D1 "insert into progress(user_id,key,data) values ('$D1','read:1','{}')" >/dev/null
as $D1 "insert into analytics_events(user_id,name) values ('$D1','dtest')" >/dev/null
expect "student deletes own account" "" "$(as $D1 "select delete_my_account()")"
expect "delete: auth user gone" "0" "$(q "select count(*) from auth.users where id='$D1'")"
expect "delete: profile gone" "0" "$(q "select count(*) from profiles where id='$D1'")"
expect "delete: progress gone" "0" "$(q "select count(*) from progress where user_id='$D1'")"
expect "delete: enrollment gone" "0" "$(q "select count(*) from enrollments where student_id='$D1'")"
expect "delete: rate counters gone" "0" "$(q "select count(*) from rate_limits where user_id='$D1'")"
expect "delete: analytics event kept but anonymised" "1" "$(q "select count(*) from analytics_events where name='dtest' and user_id is null")"
expect "delete: audit row written" "1" "$(as $ADM "select count(*) from audit_log where action='account.delete' and target='$D1' and actor='$D1'")"
expect "delete: other students and the class are untouched" "t" "$(q "select (select count(*) from profiles where id in ('$S1','$S2')) = 2 and (select count(*) from classes where id='$CL') = 1")"
contains "delete: second call reports no such account" "no such account" "$(as $D1 "select delete_my_account()")"
# teacher account deletion
expect "teacher to-be claims role" "t" "$(as $DT "select claim_teacher('SECRET1')")"
DC=$(as $DT "insert into classes(teacher_id,name,join_code) values ('$DT','Doomed','DEL001') returning id" | head -1)
as $DT "insert into assignments(class_id,page_id) values ('$DC','1-numbers')" >/dev/null
as $S5 "select * from join_class('DEL001')" >/dev/null
as $S5 "insert into progress(user_id,key,data) values ('$S5','read:1','{}')" >/dev/null
expect "teacher deletes own account" "" "$(as $DT "select delete_my_account()")"
expect "delete teacher: class, assignments and enrollments gone" "0|0|0" "$(q "select (select count(*) from classes where id='$DC') || '|' || (select count(*) from assignments where class_id='$DC') || '|' || (select count(*) from enrollments where class_id='$DC')")"
expect "delete teacher: their student keeps profile and progress" "1|1" "$(q "select (select count(*) from profiles where id='$S5') || '|' || (select count(*) from progress where user_id='$S5')")"
contains "platform_admin cannot delete via API" "removed manually" "$(as $ADM "select delete_my_account()")"
contains "content_editor cannot delete via API" "removed manually" "$(as $S6 "select delete_my_account()")"
expect "privileged accounts survive the attempt" "2" "$(q "select count(*) from profiles where id in ('$ADM','$S6')")"

echo "=== (b) anon denied on every RPC ==="
for call in "claim_teacher('x')" "join_class('x')" "class_progress('$CL')" "save_progress('[]')" "write_audit('user.x','t','{}')" \
  "export_my_data()" "delete_my_account()" "check_rate('x',1,1)" "cleanup_rate_limits()" "is_teacher()" "is_admin()" \
  "teaches_class('$CL')" "in_class('$CL')" "teaches_student('$S1')" "_audit('user.x','t','{}')" "handle_new_user()" \
  "_merge_ex('{}','{}')" "_merge_monotonic('{}','{}')"; do
  contains "anon denied: $call" "permission denied for function" "$(anon "select public.$call")"
done
contains "authenticated cannot call internal _audit" "permission denied for function" "$(as $S1 "select public._audit('user.x','t','{}')")"
contains "authenticated cannot call handle_new_user" "permission denied for function" "$(as $S1 "select public.handle_new_user()")"

echo "=== (b) default privileges ==="
q "create function public._probe() returns int language sql as 'select 1'; create table public._probe_t(a int)" >/dev/null
expect "new function: not executable by anon" "f" "$(q "select has_function_privilege('anon','public._probe()','execute')")"
expect "new function: not executable by authenticated" "f" "$(q "select has_function_privilege('authenticated','public._probe()','execute')")"
expect "new table: not readable by anon" "f" "$(q "select has_table_privilege('anon','public._probe_t','select')")"
expect "new table: not readable by authenticated" "f" "$(q "select has_table_privilege('authenticated','public._probe_t','select')")"
q "drop function public._probe(); drop table public._probe_t" >/dev/null

echo "=== (c) META ==="
expect "every public table has RLS on" "0" "$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity")"
expect "ten public tables (update tests when adding one)" "10" "$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')")"
expect "every SECURITY DEFINER function sets search_path" "0" "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')")"
expect "every public function sets search_path" "0" "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')")"
expect "no public function is executable by anon" "0" "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('anon', p.oid, 'execute')")"
expect "no public function is executable by PUBLIC" "0" "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where n.nspname='public' and a.grantee=0 and a.privilege_type='EXECUTE'")"
expect "anon holds no table privileges in public" "0" "$(q "select count(*) from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','PUBLIC')")"
expect "tables without policies are exactly the secret ones" "app_settings,rate_limits" "$(q "select string_agg(relname,',' order by relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not exists (select 1 from pg_policy where polrelid=c.oid)")"
expect "authenticated has no privileges on secret tables" "0" "$(q "select count(*) from information_schema.role_table_grants where table_schema='public' and table_name in ('app_settings','rate_limits') and grantee='authenticated'")"
expect "authenticated cannot write audit_log" "false,false,false,false" "$(q "select has_table_privilege('authenticated','public.audit_log','insert') || ',' || has_table_privilege('authenticated','public.audit_log','update') || ',' || has_table_privilege('authenticated','public.audit_log','delete') || ',' || has_table_privilege('authenticated','public.audit_log','truncate')")"
expect "profiles: exactly four user-editable columns" "age_band,display_prefs,full_name,locale" "$(q "select string_agg(column_name,',' order by column_name) from information_schema.columns where table_schema='public' and table_name='profiles' and has_column_privilege('authenticated','public.profiles',column_name,'UPDATE')")"
expect "profiles.role is not user-editable" "f" "$(q "select has_column_privilege('authenticated','public.profiles','role','UPDATE')")"
expect "handle_new_user is not executable by authenticated" "f" "$(q "select has_function_privilege('authenticated','public.handle_new_user()','execute')")"
expect "export_my_data mentions every user-data table" "" "$(q "select string_agg(relname, ',') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and relname not in ('app_settings','feature_flags') and position('public.'||relname in pg_get_functiondef('public.export_my_data()'::regprocedure)) = 0")"
n_pol=$(q "select count(*) from pg_policy"); n_fn=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")
q "insert into feature_flags(key,enabled) values ('keepme',true)" >/dev/null
for f in "$SUPA"/migrations/*.sql; do psql -X -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || echo "re-apply failed: $f"; done
expect "re-applying all migrations changes nothing (policies, functions, data)" "$n_pol|$n_fn|1" "$(q "select count(*) from pg_policy")|$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")|$(q "select count(*) from feature_flags where key='keepme'")"
if [ -f "$SUPA/../apps/web/src/db/types.ts" ]; then
  python3 "$SUPA/gen_types.py" --out "$PGHOST/types.generated.ts" >/dev/null 2>&1
  expect "apps/web/src/db/types.ts is up to date with the migrations" "same" "$(cmp -s "$PGHOST/types.generated.ts" "$SUPA/../apps/web/src/db/types.ts" && echo same || echo stale)"
fi

echo
echo "$pass checks passed, $failn failed"
[ "$failn" -eq 0 ]
