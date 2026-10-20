#!/bin/bash
# Single command, no arguments:  bash supabase/tests/run.sh
exec "$(cd "$(dirname "$0")" && pwd)/scratch_db.sh" bash "$(cd "$(dirname "$0")" && pwd)/checks.sh"
