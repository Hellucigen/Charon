package modules

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

// Guards the Edge extractor's core assumption: a copied History file (with
// its journal) can be opened read-side and yields visits joined to urls.
func TestEdgeHistorySnapshotReadable(t *testing.T) {
	local := os.Getenv("LOCALAPPDATA")
	if local == "" {
		t.Skip("LOCALAPPDATA unset")
	}
	srcDir := filepath.Join(local, "Microsoft", "Edge", "User Data", "Default")
	if _, err := os.Stat(filepath.Join(srcDir, "History")); err != nil {
		t.Skip("no Edge history on this machine")
	}
	tmp := t.TempDir()
	snapshot, err := copyHistoryFiles(srcDir, tmp)
	if err != nil {
		t.Fatalf("copy: %v", err)
	}
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(snapshot))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		t.Fatalf("ping: %v", err)
	}
	var urls, visits int
	if err := db.QueryRow(`SELECT COUNT(1) FROM urls`).Scan(&urls); err != nil {
		t.Fatalf("urls: %v", err)
	}
	var maxT int64
	if err := db.QueryRow(`SELECT COALESCE(MAX(v.visit_time),0) FROM visits v`).Scan(&maxT); err != nil {
		t.Fatalf("visits: %v", err)
	}
	if err := db.QueryRow(`SELECT COUNT(1) FROM visits`).Scan(&visits); err != nil {
		t.Fatalf("visits count: %v", err)
	}
	var url, title string
	var ts, dur int64
	err = db.QueryRow(
		`SELECT u.url, COALESCE(u.title,''), v.visit_time, COALESCE(v.visit_duration,0)
		 FROM visits v JOIN urls u ON u.id=v.url ORDER BY v.visit_time DESC LIMIT 1`).
		Scan(&url, &title, &ts, &dur)
	if err != nil {
		var ddl string
		_ = db.QueryRow(`SELECT sql FROM sqlite_master WHERE name='visits'`).Scan(&ddl)
		t.Fatalf("latest visit: %v\nvisits DDL: %s", err, ddl)
	}
	t.Logf("urls=%d visits=%d cursor=%d latest=%q unix=%d",
		urls, visits, maxT, url, ts/1_000_000-chromiumEpochOffset)
	if urls == 0 || visits == 0 {
		t.Fatal("empty history snapshot")
	}
}
