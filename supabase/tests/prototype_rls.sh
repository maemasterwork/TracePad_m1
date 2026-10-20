#!/bin/bash
# Runs on a scratch database that has shim.sql + schema.sql applied.
export PGHOST=${PGHOST:-/tmp/pgtest} PGPORT=${PGPORT:-54399} PGUSER=postgres
DB=t; fail=0
q() { psql -d $DB -At -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
as() { local uid=$1; shift; psql -d $DB -At -c "set role authenticated; select set_config('request.jwt.claim.sub','$uid',false); $*" 2>&1 | grep -v -x "SET" | grep -v -x "$uid"; }
expect() { local name=$1 want=$2 got=$3; if [ "$got" == "$want" ]; then echo "ok   $name"; else echo "FAIL $name: want [$want] got [$got]"; fail=1; fi; }
q "truncate auth.users cascade; delete from app_settings; insert into app_settings values ('teacher_code','SECRET1')" >/dev/null
T=11111111-1111-1111-1111-111111111111; T2=22222222-2222-2222-2222-222222222222
S1=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1; S2=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2; S3=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3
for u in $T $T2 $S1 $S2 $S3; do q "insert into auth.users(id,email,raw_user_meta_data) values ('$u','$u@x', '{\"full_name\":\"User $u\"}')" >/dev/null; done
expect "profile created as student" "student" "$(q "select role from profiles where id='$T'")"
expect "wrong teacher code" "f" "$(as $T "select claim_teacher('nope')")"
expect "right teacher code" "t" "$(as $T "select claim_teacher('SECRET1')")"
as $T2 "select claim_teacher('SECRET1')" >/dev/null
expect "student cannot make class" "1" "$(as $S1 "insert into classes(teacher_id,name,join_code) values ('$S1','x','ZZZ') returning 1" | grep -c 'row-level security')"
CL=$(as $T "insert into classes(teacher_id,name,join_code) values ('$T','Period 1','ABC123') returning id" | head -1)
expect "teacher creates class" "36" "${#CL}"
expect "bad join code" "1" "$(as $S1 "select * from join_class('zzzzzz')" | grep -c 'No class has that code')"
expect "join (lower case)" "Period 1" "$(as $S1 "select name from join_class(' abc123 ')" | head -1)"
as $S2 "select * from join_class('ABC123')" >/dev/null
for s in $S1 $S2 $S3; do as $s "insert into progress(user_id,key,data) values ('$s','quiz:1:q1','{\"choice\":1,\"right\":true}'),('$s','pred:1:p1','{\"right\":false}'),('$s','ex:1:e1','{\"pass\":true,\"hints\":2}'),('$s','read:1','{}')" >/dev/null; done
expect "student cannot write others" "1" "$(as $S1 "insert into progress(user_id,key,data) values ('$S2','x:1','{}')" | grep -c 'row-level security')"
expect "student sees own rows only" "4" "$(as $S1 "select count(*) from progress")"
expect "teacher sees class rows (S1,S2)" "8" "$(as $T "select count(*) from progress")"
expect "other teacher sees none" "0" "$(as $T2 "select count(*) from progress")"
expect "teacher cannot edit student rows" "UPDATE 0" "$(as $T "update progress set data='{}' where user_id='$S1'")"
expect "teacher sees student profiles" "3" "$(as $T "select count(*) from profiles")"
expect "student sees only self profile" "1" "$(as $S1 "select count(*) from profiles")"
expect "no role self-promotion" "1" "$(as $S1 "update profiles set role='teacher' where id='$S1'" | grep -c 'permission denied')"
expect "name editable" "UPDATE 1" "$(as $S1 "update profiles set full_name='New' where id='$S1'")"
expect "student reads own class" "Period 1" "$(as $S1 "select name from classes")"
expect "non-member sees no classes" "0" "$(as $S3 "select count(*) from classes")"
expect "teacher2 sees no classes" "0" "$(as $T2 "select count(*) from classes")"
AID=$(as $T "insert into assignments(class_id,page_id,title,due_at) values ('$CL','1-numbers','Numbers','2030-01-01') returning id" | head -1)
expect "assignment created" "36" "${#AID}"
expect "student reads assignment" "1" "$(as $S1 "select count(*) from assignments")"
expect "outsider no assignment" "0" "$(as $S3 "select count(*) from assignments")"
expect "student cannot add assignment" "1" "$(as $S1 "insert into assignments(class_id,page_id) values ('$CL','x')" | grep -c 'row-level security')"
expect "teacher2 cannot add assignment" "1" "$(as $T2 "insert into assignments(class_id,page_id) values ('$CL','x')" | grep -c 'row-level security')"
expect "class_progress rows" "2" "$(as $T "select count(*) from class_progress('$CL')")"
expect "class_progress totals" "1|0|1|1|1|1|2|t" "$(as $T "select preds,preds_right,quizzes,quizzes_right,ex_pass,ex_tried,hints,is_read from class_progress('$CL') where student_id='$S1' and ch=1")"
expect "class_progress denied to other teacher" "1" "$(as $T2 "select * from class_progress('$CL')" | grep -c 'not your class')"
expect "class_progress denied to student" "1" "$(as $S1 "select * from class_progress('$CL')" | grep -c 'not your class')"
expect "app_settings unreadable" "1" "$(as $T "select * from app_settings" | grep -c 'permission denied')"
expect "student leaves class" "DELETE 1" "$(as $S2 "delete from enrollments where student_id='$S2'")"
expect "teacher no longer sees S2 rows" "4" "$(as $T "select count(*) from progress")"
expect "anon cannot call join_class" "1" "$(psql -d t -At -c "set role anon; select * from join_class('ABC123')" 2>&1 | grep -c 'permission denied')"
exit $fail
