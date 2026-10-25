// Package modules — papers: a reading queue for academic PDFs. CRUD plus
// folder scanning so stray PDFs (Downloads, Study) can be imported with one
// click; title defaults to the filename.
package modules

import (
	"database/sql"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"personal-terminal/backend/core"
	"personal-terminal/backend/db"
)

type Paper struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	Authors    string `json:"authors,omitempty"`
	Venue      string `json:"venue,omitempty"` // conference / journal / course
	Year       int    `json:"year"`
	PDFPath    string `json:"pdf_path,omitempty"`
	Status     string `json:"status"` // todo / reading / done / cited
	Rating     int    `json:"rating"` // 0-5
	Tags       string `json:"tags,omitempty"`
	Notes      string `json:"notes,omitempty"`
	CreatedAt  int64  `json:"created_at"`
	FinishedAt int64  `json:"finished_at"`
}

type PapersService struct{}

func NewPapersService() *PapersService { return &PapersService{} }
func (s *PapersService) store() *db.Store { return core.GlobalStore.(*db.Store) }

func (s *PapersService) Papers(status string) ([]Paper, error) {
	q := `SELECT id,title,authors,venue,year,pdf_path,status,rating,tags,notes,created_at,finished_at FROM papers`
	var rows *sql.Rows
	var err error
	if status != "" {
		rows, err = s.store().DB.Query(q+` WHERE status=? ORDER BY created_at DESC`, status)
	} else {
		rows, err = s.store().DB.Query(q+` ORDER BY created_at DESC`)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Paper{}
	for rows.Next() {
		var p Paper
		if err := rows.Scan(&p.ID, &p.Title, &p.Authors, &p.Venue, &p.Year, &p.PDFPath, &p.Status, &p.Rating, &p.Tags, &p.Notes, &p.CreatedAt, &p.FinishedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, nil
}

func (s *PapersService) SavePaper(p Paper) (*Paper, error) {
	if p.Title == "" {
		return nil, errRequired("title")
	}
	created := p.ID == ""
	if p.ID == "" {
		p.ID = newID("pap_")
	}
	if p.Status == "" {
		p.Status = "todo"
	}
	if created {
		p.CreatedAt = time.Now().Unix()
	}
	// entering done state stamps finished_at; leaving it clears nothing
	var finished int64
	if p.Status == "done" {
		_ = s.store().DB.QueryRow(`SELECT finished_at FROM papers WHERE id=?`, p.ID).Scan(&finished)
		if finished == 0 {
			finished = time.Now().Unix()
			awardXP(15, "paper", "intellect")
		}
	}
	if _, err := s.store().DB.Exec(
		`INSERT OR REPLACE INTO papers(id,title,authors,venue,year,pdf_path,status,rating,tags,notes,created_at,finished_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
		p.ID, p.Title, p.Authors, p.Venue, p.Year, p.PDFPath, p.Status, p.Rating, p.Tags, p.Notes, p.CreatedAt, finished); err != nil {
		return nil, err
	}
	p.FinishedAt = finished
	return &p, nil
}

func (s *PapersService) DeletePaper(id string) error {
	_, err := s.store().DB.Exec(`DELETE FROM papers WHERE id=?`, id)
	return err
}

// OpenPaper opens (or reveals) the linked PDF with the OS handler.
func (s *PapersService) OpenPaper(id, action string) error {
	var path string
	if err := s.store().DB.QueryRow(`SELECT pdf_path FROM papers WHERE id=?`, id).Scan(&path); err != nil {
		return err
	}
	if path == "" {
		return errRequired("pdf_path")
	}
	if action == "reveal" {
		return revealInExplorer(path)
	}
	return openWithDefault(path)
}

type PaperFile struct {
	Path string `json:"path"`
	Name string `json:"name"`
	Size int64  `json:"size"`
	Imported bool `json:"imported"`
}

// ScanPDFs lists PDF files directly inside dir (newest first) and flags
// ones already linked to a paper record.
func (s *PapersService) ScanPDFs(dir string) ([]PaperFile, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	out := []PaperFile{}
	for _, e := range entries {
		if e.IsDir() || !strings.EqualFold(filepath.Ext(e.Name()), ".pdf") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, PaperFile{Path: filepath.Join(dir, e.Name()), Name: e.Name(), Size: info.Size()})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	// flag imported ones
	for i := range out {
		var n int
		_ = s.store().DB.QueryRow(`SELECT COUNT(1) FROM papers WHERE pdf_path=?`, out[i].Path).Scan(&n)
		out[i].Imported = n > 0
	}
	return out, nil
}

// ImportPDF creates a paper record from a PDF file, title from filename.
func (s *PapersService) ImportPDF(path string) (*Paper, error) {
	if path == "" {
		return nil, errRequired("path")
	}
	name := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	return s.SavePaper(Paper{Title: name, PDFPath: path, Status: "todo"})
}
