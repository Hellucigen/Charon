// Package modules — Downloads janitor: scans a folder (default ~/Downloads)
// into a flat, kind-tagged inventory and offers open / reveal / move / trash
// actions so stray files can be filed away in a couple of clicks.
package modules

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type JanitorItem struct {
	Path  string `json:"path"`
	Name  string `json:"name"`
	Ext   string `json:"ext"`
	Kind  string `json:"kind"` // image/pdf/doc/archive/audio/video/text/other
	Size  int64  `json:"size"`
	MTime int64  `json:"mtime"`
}

type JanitorService struct{}

func NewJanitorService() *JanitorService { return &JanitorService{} }

func janitorKind(ext string) string {
	switch strings.ToLower(ext) {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico":
		return "image"
	case ".pdf":
		return "pdf"
	case ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".odt", ".odp", ".ods":
		return "doc"
	case ".zip", ".rar", ".7z", ".tar", ".gz", ".nbt":
		return "archive"
	case ".mp3", ".flac", ".m4a", ".wav", ".ogg", ".opus":
		return "audio"
	case ".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv":
		return "video"
	case ".txt", ".md", ".csv", ".json", ".log", ".vbs", ".ini":
		return "text"
	default:
		return "other"
	}
}

// DownloadsDir returns the user's Downloads folder as the default scan root.
func (s *JanitorService) DownloadsDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, "Downloads")
}

// Scan lists files directly inside dir (no recursion), newest first.
func (s *JanitorService) Scan(dir string) ([]JanitorItem, error) {
	if dir == "" {
		dir = s.DownloadsDir()
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	out := []JanitorItem{}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		ext := filepath.Ext(e.Name())
		out = append(out, JanitorItem{
			Path: filepath.Join(dir, e.Name()), Name: e.Name(), Ext: ext,
			Kind: janitorKind(ext), Size: info.Size(), MTime: info.ModTime().Unix(),
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].MTime > out[j].MTime })
	return out, nil
}

// OpenPath opens a file with the OS default handler.
func (s *JanitorService) OpenPath(path string) error {
	if _, err := os.Stat(path); err != nil {
		return err
	}
	return openWithDefault(path)
}

// RevealPath opens Explorer with the file selected.
func (s *JanitorService) RevealPath(path string) error { return revealInExplorer(path) }

// MovePath moves a file into destDir (created if missing), keeping its name.
// Falls back to copy+delete across volumes.
func (s *JanitorService) MovePath(path, destDir string) (string, error) {
	if path == "" || destDir == "" {
		return "", errRequired("path/destDir")
	}
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return "", err
	}
	dest := filepath.Join(destDir, filepath.Base(path))
	if err := os.Rename(path, dest); err != nil {
		src, err := os.Open(path)
		if err != nil {
			return "", err
		}
		defer src.Close()
		dst, err := os.Create(dest)
		if err != nil {
			return "", err
		}
		if _, err := io.Copy(dst, src); err != nil {
			dst.Close()
			return "", err
		}
		dst.Close()
		if err := os.Remove(path); err != nil {
			return "", err
		}
	}
	return dest, nil
}

// TrashPath moves a file into the app trash folder instead of deleting,
// so mistakes stay reversible. Returns the trash destination.
func (s *JanitorService) TrashPath(path string) (string, error) {
	if path == "" {
		return "", errRequired("path")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	trash := filepath.Join(home, ".personal-terminal", "trash")
	if err := os.MkdirAll(trash, 0o755); err != nil {
		return "", err
	}
	name := fmt.Sprintf("%d_%s", time.Now().Unix(), filepath.Base(path))
	dest := filepath.Join(trash, name)
	if err := os.Rename(path, dest); err != nil {
		return "", fmt.Errorf("move to trash failed: %w", err)
	}
	return dest, nil
}

func openWithDefault(path string) error {
	cmd := exec.Command("cmd", "/c", "start", "", path)
	return cmd.Start()
}
