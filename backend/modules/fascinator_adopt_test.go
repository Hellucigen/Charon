package modules

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// A healthy external FAS on the target port must be adopted on Start:
// no duplicate spawn, no kill of the incumbent (its in-memory graph is
// unsaved state), Stop only detaches, and a dead adoption auto-detaches.
func TestStartAdoptsHealthyExternalInstance(t *testing.T) {
	var hits int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		w.WriteHeader(200)
	}))
	defer srv.Close()
	port, err := strconv.Atoi(srv.URL[strings.LastIndex(srv.URL, ":")+1:])
	if err != nil {
		t.Fatal(err)
	}

	dir := t.TempDir()
	app := filepath.Join(dir, "app.py")
	if err := os.WriteFile(app, []byte("# fake"), 0o644); err != nil {
		t.Fatal(err)
	}
	s := NewFascinatorService()
	s.procPath = "python" // must never actually spawn in this test
	s.appPath = app
	s.port = port

	if err := s.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if !s.adopted {
		t.Fatal("expected adoption of the healthy instance")
	}
	st := s.Status()
	if st["running"] != true || st["adopted"] != true {
		t.Fatalf("status after adopt: %v", st)
	}
	if pid := st["pid"].(int); pid != 0 {
		t.Fatalf("adopted instance must report pid 0, got %d", pid)
	}

	// Stop detaches only — the external server must survive it.
	if err := s.Stop(); err != nil {
		t.Fatalf("Stop (detach): %v", err)
	}
	if !s.ping() {
		t.Fatal("external instance must still be alive after Stop")
	}
	if st := s.Status(); st["running"] != false {
		t.Fatalf("after detach status: %v", st)
	}

	// Restart on an adopted instance must refuse, not kill.
	if err := s.Start(); err != nil {
		t.Fatalf("re-Start: %v", err)
	}
	if err := s.Restart(); err == nil {
		t.Fatal("Restart on adopted instance should error")
	}
	if !s.ping() {
		t.Fatal("external instance must survive a refused Restart")
	}
	if err := s.Stop(); err != nil {
		t.Fatalf("Stop: %v", err)
	}

	// Adoption re-acquires, then auto-detaches when the external dies.
	if err := s.Start(); err != nil {
		t.Fatalf("Start for auto-detach: %v", err)
	}
	srv.Close() // simulate the external instance exiting
	if st := s.Status(); st["running"] != false || st["adopted"] != false {
		t.Fatalf("dead external instance should auto-detach: %v", st)
	}
}

// TryAdopt is the boot-time path: it must adopt a healthy listener but
// never spawn when nothing is there.
func TestTryAdoptOnlyAdoptsHealthyInstance(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	}))
	defer srv.Close()
	port, err := strconv.Atoi(srv.URL[strings.LastIndex(srv.URL, ":")+1:])
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	app := filepath.Join(dir, "app.py")
	if err := os.WriteFile(app, []byte("# fake"), 0o644); err != nil {
		t.Fatal(err)
	}

	s := NewFascinatorService()
	s.procPath = "python" // must never spawn in this test
	s.appPath = app
	s.port = port
	if !s.TryAdopt() {
		t.Fatal("healthy listener should be adopted")
	}
	if st := s.Status(); st["running"] != true || st["adopted"] != true {
		t.Fatalf("status: %v", st)
	}
	_ = s.Stop()

	// Nothing listening (use a closed port) → TryAdopt must be a no-op.
	srv.Close()
	s2 := NewFascinatorService()
	s2.procPath = "python"
	s2.appPath = app
	s2.port = port
	if s2.TryAdopt() {
		t.Fatal("TryAdopt must not adopt or spawn when nothing listens")
	}
	if st := s2.Status(); st["running"] != false {
		t.Fatalf("status after no-op TryAdopt: %v", st)
	}
}
