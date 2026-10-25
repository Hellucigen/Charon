package modules

import (
	"os"
	"path/filepath"
	"testing"

	"personal-terminal/backend/core"
	"personal-terminal/backend/db"
)

// End-to-end check of the Edge archiver against the real profile on this
// machine: first import pulls a batch, second import must be a no-op
// (incremental cursor), stats + export then work off the local table.
func TestEdgeImportIsIncremental(t *testing.T) {
	local := os.Getenv("LOCALAPPDATA")
	if local == "" {
		t.Skip("LOCALAPPDATA unset")
	}
	if _, err := os.Stat(filepath.Join(local, "Microsoft", "Edge", "User Data", "Default", "History")); err != nil {
		t.Skip("no Edge history on this machine")
	}

	s, err := db.Open(filepath.Join(t.TempDir(), "terminal.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer s.Close()
	if err := s.Migrate(); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	core.GlobalStore = s

	svc := NewToolkitService()

	first, err := svc.EdgeImport("")
	if err != nil {
		t.Fatalf("first import: %v", err)
	}
	t.Logf("first: imported=%v stored=%v", first["imported"], first["stored"])
	n1 := first["imported"].(int64)
	if n1 == 0 {
		t.Fatal("first import pulled nothing")
	}

	second, err := svc.EdgeImport("")
	if err != nil {
		t.Fatalf("second import: %v", err)
	}
	if got := second["imported"].(int64); got != 0 {
		t.Fatalf("second import should pull 0 new rows, got %d", got)
	}
	if got := second["stored"].(int64); got != n1 {
		t.Fatalf("stored count changed between imports: %d -> %d", n1, got)
	}

	st, err := svc.EdgeStats()
	if err != nil {
		t.Fatalf("stats: %v", err)
	}
	if st["total"].(int64) != n1 {
		t.Fatalf("stats total mismatch: %v vs %d", st["total"], n1)
	}
	t.Logf("stats: total=%v span=%v→%v", st["total"], st["first_day"], st["last_day"])

	rows, err := svc.EdgeHistory("file", 50)
	if err != nil {
		t.Fatalf("history query: %v", err)
	}
	t.Logf("keyword 'file' matched %d rows", len(rows))

	out, err := svc.EdgeExport(filepath.Join(t.TempDir(), "dump"), "csv")
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	b, err := os.ReadFile(out)
	if err != nil {
		t.Fatalf("read export: %v", err)
	}
	if len(b) < 200 {
		t.Fatalf("export suspiciously small: %d bytes", len(b))
	}
	t.Logf("export wrote %d bytes to %s", len(b), out)
}
