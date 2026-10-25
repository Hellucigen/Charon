package db

import (
	"os"
	"path/filepath"
	"sync"
	"testing"
)

// Reproduces the real startup sequence on a copy of the live DB:
// Open() -> Migrate() -> concurrent writes (Migrate conn + handler conn).
// Before the fix this failed with "attempt to write a readonly database".
func TestOpenMigrateConcurrentWrite(t *testing.T) {
	home, _ := os.UserHomeDir()
	src := filepath.Join(home, ".personal-terminal", "terminal.db")
	b, err := os.ReadFile(src)
	if err != nil {
		t.Skip("no live db")
	}
	dst := filepath.Join(t.TempDir(), "terminal.db")
	os.WriteFile(dst, b, 0o644)

	s, err := Open(dst)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()
	if err := s.Migrate(); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	var jm string
	s.DB.QueryRow(`PRAGMA journal_mode`).Scan(&jm)
	t.Logf("journal_mode=%s", jm)

	var wg sync.WaitGroup
	errs := make([]error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, errs[i] = s.DB.Exec(`INSERT INTO fleeting(id,body,tags,created_at) VALUES(?,?,?,?)`,
				"t"+string(rune('a'+i)), "x", "[]", i)
		}(i)
	}
	wg.Wait()
	for i, e := range errs {
		if e != nil {
			t.Fatalf("concurrent write %d failed: %v", i, e)
		}
	}
	t.Log("8 concurrent writes OK")
}

// The regression that broke Charon startup: forcing WAL at Open()/Ping()
// time fails with "readonly database" on a live delete-mode DB under any
// reader. Open() must not fail on the live file.
func TestOpenLiveDBDoesNotFail(t *testing.T) {
	home, _ := os.UserHomeDir()
	live := filepath.Join(home, ".personal-terminal", "terminal.db")
	s, err := Open(live)
	if err != nil {
		t.Fatalf("Open live: %v", err)
	}
	defer s.Close()
	if err := s.Migrate(); err != nil {
		t.Fatalf("Migrate live: %v", err)
	}
	var jm string
	s.DB.QueryRow(`PRAGMA journal_mode`).Scan(&jm)
	t.Logf("live journal_mode=%s (must open cleanly)", jm)

	// A real data write+cleanup on the LIVE db, while Charon may hold it.
	if _, err := s.DB.Exec(`INSERT INTO fleeting(id,body,tags,created_at) VALUES('go_live_write','x','[]',1)`); err != nil {
		t.Fatalf("live data write failed: %v", err)
	}
	if _, err := s.DB.Exec(`DELETE FROM fleeting WHERE id='go_live_write'`); err != nil {
		t.Fatalf("live data delete failed: %v", err)
	}
	t.Log("live data write+delete OK")
}
