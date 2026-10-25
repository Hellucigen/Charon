// Package modules — toolkit: general-purpose utilities plus the Edge
// browser-history extractor.
//
// Edge keeps its history in a SQLite file under the user profile. Because
// Edge's own retention (and any cloud sync) rolls off after a few months,
// we copy the file, read only the visits newer than a stored per-profile
// cursor, and append them into our own table. Re-running the extract is
// therefore incremental: only the new records since last time are imported.
package modules

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"

	"personal-terminal/backend/core"
	"personal-terminal/backend/db"
)

type ToolkitService struct{}

func NewToolkitService() *ToolkitService { return &ToolkitService{} }
func (s *ToolkitService) store() *db.Store { return core.GlobalStore.(*db.Store) }

// chromiumEpochOffset converts Chromium microseconds (since 1601-01-01)
// to Unix seconds (since 1970-01-01).
const chromiumEpochOffset int64 = 11644473600

// ── Edge discovery ─────────────────────────────────────────────────────

func edgeUserDataRoot() (string, error) {
	if runtime.GOOS == "windows" {
		local := os.Getenv("LOCALAPPDATA")
		if local == "" {
			return "", fmt.Errorf("LOCALAPPDATA not set")
		}
		return filepath.Join(local, "Microsoft", "Edge", "User Data"), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	switch runtime.GOOS {
	case "darwin":
		return filepath.Join(home, "Library", "Application Support", "Microsoft Edge"), nil
	default:
		return filepath.Join(home, ".config", "microsoft-edge"), nil
	}
}

// EdgeProfiles lists profile folders that actually contain a History db.
func (s *ToolkitService) EdgeProfiles() ([]map[string]interface{}, error) {
	root, err := edgeUserDataRoot()
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, fmt.Errorf("Edge 用户数据未找到: %w", err)
	}
	out := []map[string]interface{}{}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		if name != "Default" && !strings.HasPrefix(name, "Profile ") {
			continue
		}
		hist := filepath.Join(root, name, "History")
		info, err := os.Stat(hist)
		if err != nil {
			continue
		}
		seen, cursor := s.cursorFor(name)
		out = append(out, map[string]interface{}{
			"profile":    name,
			"history_at": hist,
			"file_mtime": info.ModTime().Unix(),
			"saved":      seen,
			"cursor":     cursor,
		})
	}
	return out, nil
}

func (s *ToolkitService) cursorFor(profile string) (int64, int64) {
	var seen, cursor int64
	_ = s.store().DB.QueryRow(`SELECT COUNT(1) FROM edge_history WHERE profile=?`, profile).Scan(&seen)
	_ = s.store().DB.QueryRow(`SELECT value FROM edge_history_meta WHERE key=?`, "cursor:"+profile).Scan(&cursor)
	return seen, cursor
}

// copyHistoryFiles snapshots Edge's History (+ its rollback journal / WAL if
// present) into a temp dir so we can read it while Edge holds the lock.
func copyHistoryFiles(srcDir, tmpDir string) (string, error) {
	if err := os.MkdirAll(tmpDir, 0o755); err != nil {
		return "", err
	}
	dest := filepath.Join(tmpDir, "History")
	if err := copyFile(filepath.Join(srcDir, "History"), dest); err != nil {
		return "", err
	}
	for _, aux := range []string{"History-journal", "History-wal", "History-shm"} {
		if _, err := os.Stat(filepath.Join(srcDir, aux)); err == nil {
			_ = copyFile(filepath.Join(srcDir, aux), filepath.Join(tmpDir, aux))
		}
	}
	return dest, nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Close()
}

type EdgeVisit struct {
	URL      string `json:"url"`
	Title    string `json:"title"`
	Day      string `json:"day"`
	VisitAt  int64  `json:"visit_at"`
	Profile  string `json:"profile"`
	Duration int64  `json:"duration_ms,omitempty"`
}

// EdgeImport incrementally pulls visits newer than the stored cursor.
// Empty profile means "all discovered profiles".
func (s *ToolkitService) EdgeImport(profile string) (map[string]interface{}, error) {
	root, err := edgeUserDataRoot()
	if err != nil {
		return nil, err
	}
	profiles := []string{}
	if profile != "" {
		profiles = []string{profile}
	} else {
		list, err := s.EdgeProfiles()
		if err != nil {
			return nil, err
		}
		for _, p := range list {
			if n, ok := p["profile"].(string); ok {
				profiles = append(profiles, n)
			}
		}
	}
	if len(profiles) == 0 {
		return nil, fmt.Errorf("没有找到 Edge 配置文件")
	}

	total := int64(0)
	perProfile := map[string]int64{}
	for _, p := range profiles {
		n, err := s.importOne(filepath.Join(root, p), p)
		if err != nil {
			return map[string]interface{}{"imported": total, "error": err.Error(), "by_profile": perProfile}, err
		}
		perProfile[p] = n
		total += n
	}
	var stored int64
	_ = s.store().DB.QueryRow(`SELECT COUNT(1) FROM edge_history`).Scan(&stored)
	return map[string]interface{}{"imported": total, "stored": stored, "by_profile": perProfile}, nil
}

func (s *ToolkitService) importOne(srcDir, profile string) (int64, error) {
	hist := filepath.Join(srcDir, "History")
	if _, err := os.Stat(hist); err != nil {
		return 0, fmt.Errorf("%s 无历史记录文件", profile)
	}
	tmp, err := os.MkdirTemp("", "charon-edge-*")
	if err != nil {
		return 0, err
	}
	defer os.RemoveAll(tmp)

	snapshot, err := copyHistoryFiles(srcDir, tmp)
	if err != nil {
		return 0, fmt.Errorf("复制失败(若 Edge 占用文件可尝试关闭浏览器): %w", err)
	}

	src, err := sql.Open("sqlite", "file:"+filepath.ToSlash(snapshot))
	if err != nil {
		return 0, err
	}
	defer src.Close()
	if err := src.Ping(); err != nil {
		return 0, err
	}

	// Drain any backlog: a batch of fewer than the page size means we've
	// caught up. Bounded to avoid an infinite loop on a corrupt source.
	const pageSize = 20000
	var grandTotal int64
	for batch := 0; batch < 200; batch++ {
		imported, fetched, err := s.importBatch(src, profile, pageSize)
		grandTotal += imported
		if err != nil {
			return grandTotal, err
		}
		if fetched < pageSize {
			break
		}
	}
	return grandTotal, nil
}

func (s *ToolkitService) importBatch(src *sql.DB, profile string, pageSize int) (int64, int, error) {
	var cursor int64
	_ = s.store().DB.QueryRow(`SELECT value FROM edge_history_meta WHERE key=?`, "cursor:"+profile).Scan(&cursor)

	rows, err := src.Query(
		`SELECT u.url, COALESCE(u.title,''), v.visit_time, COALESCE(v.visit_duration,0)
			FROM visits v JOIN urls u ON u.id = v.url
			WHERE v.visit_time > ? ORDER BY v.visit_time ASC LIMIT ?`, cursor, pageSize)
	if err != nil {
		return 0, 0, fmt.Errorf("读取 Edge 历史失败: %w", err)
	}
	defer rows.Close()

	tx, err := s.store().DB.Begin()
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback()

	st := time.Now()
	var imported, fetched, maxSeen int64
	for rows.Next() {
		var url, title string
		var ctime, duration int64
		if err := rows.Scan(&url, &title, &ctime, &duration); err != nil {
			return 0, 0, err
		}
		fetched++
		if ctime > maxSeen {
			maxSeen = ctime
		}
		unix := ctime/1_000_000 - chromiumEpochOffset
		day := time.Unix(unix, 0).Format("2006-01-02")
		res, err := tx.Exec(
			`INSERT OR IGNORE INTO edge_history(id,url,title,visit_at,day,profile,duration_ms,created_at)
			 VALUES(?,?,?,?,?,?,?,?)`,
			newID("eh_"), url, title, unix, day, profile, duration/1000, st.Unix())
		if err != nil {
			return 0, 0, err
		}
		if n, _ := res.RowsAffected(); n > 0 {
			imported++
		}
	}
	if err := rows.Err(); err != nil {
		return 0, 0, err
	}
	// Advance the cursor even when every row deduped (imported==0) — maxSeen
	// moves past the batch so a later incremental pass starts where we left off.
	if maxSeen > cursor {
		if _, err := tx.Exec(`INSERT OR REPLACE INTO edge_history_meta(key,value) VALUES(?,?)`,
			"cursor:"+profile, maxSeen); err != nil {
			return 0, 0, err
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, 0, err
	}
	return imported, int(fetched), nil
}

// EdgeHistory queries stored visits, newest first, optional keyword filter.
func (s *ToolkitService) EdgeHistory(keyword string, limit int) ([]EdgeVisit, error) {
	if limit <= 0 || limit > 5000 {
		limit = 500
	}
	args := []interface{}{}
	q := `SELECT url,title,day,visit_at,profile,duration_ms FROM edge_history`
	if keyword != "" {
		q += ` WHERE url LIKE ? OR title LIKE ?`
		args = append(args, "%"+keyword+"%", "%"+keyword+"%")
	}
	q += ` ORDER BY visit_at DESC LIMIT ?`
	args = append(args, limit)

	rows, err := s.store().DB.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []EdgeVisit{}
	for rows.Next() {
		var v EdgeVisit
		if err := rows.Scan(&v.URL, &v.Title, &v.Day, &v.VisitAt, &v.Profile, &v.Duration); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, nil
}

// EdgeStats summarizes the local archive: totals, day span, top domains.
func (s *ToolkitService) EdgeStats() (map[string]interface{}, error) {
	var total int64
	var first, last sql.NullString
	if err := s.store().DB.QueryRow(`SELECT COUNT(1), MIN(day), MAX(day) FROM edge_history`).
		Scan(&total, &first, &last); err != nil {
		return nil, err
	}
	perProfile := []map[string]interface{}{}
	rows, err := s.store().DB.Query(`SELECT profile, COUNT(1) FROM edge_history GROUP BY profile ORDER BY 2 DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var p string
		var n int64
		if err := rows.Scan(&p, &n); err != nil {
			return nil, err
		}
		perProfile = append(perProfile, map[string]interface{}{"profile": p, "count": n})
	}
	// top domains (host derived in SQL from the url)
	domains := []map[string]interface{}{}
	drows, err := s.store().DB.Query(`SELECT COUNT(1), substr(url, instr(url,'//')+2) AS tail FROM edge_history GROUP BY tail ORDER BY 1 DESC LIMIT 15`)
	if err != nil {
		return nil, err
	}
	defer drows.Close()
	counted := map[string]int64{}
	for drows.Next() {
		var n int64
		var tail string
		if err := drows.Scan(&n, &tail); err != nil {
			return nil, err
		}
		host := tail
		if i := strings.IndexAny(host, "/?#"); i >= 0 {
			host = host[:i]
		}
		counted[host] += n
	}
	type hostCount struct {
		Host  string `json:"host"`
		Count int64  `json:"count"`
	}
	ranked := []hostCount{}
	for k, v := range counted {
		ranked = append(ranked, hostCount{k, v})
	}
	sort.Slice(ranked, func(i, j int) bool { return ranked[i].Count > ranked[j].Count })
	if len(ranked) > 12 {
		ranked = ranked[:12]
	}
	for _, r := range ranked {
		domains = append(domains, map[string]interface{}{"host": r.Host, "count": r.Count})
	}
	return map[string]interface{}{
		"total": total, "first_day": first.String, "last_day": last.String,
		"profiles": perProfile, "domains": domains,
	}, nil
}

// EdgeExport writes the archive out as CSV or JSON into destDir.
func (s *ToolkitService) EdgeExport(destDir, format string) (string, error) {
	if destDir == "" {
		return "", errRequired("destDir")
	}
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return "", err
	}
	stamp := time.Now().Format("20060102-150405")
	rows, err := s.store().DB.Query(`SELECT url,title,day,visit_at,profile,duration_ms FROM edge_history ORDER BY visit_at DESC`)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	if format == "json" {
		path := filepath.Join(destDir, fmt.Sprintf("edge-history-%s.json", stamp))
		f, err := os.Create(path)
		if err != nil {
			return "", err
		}
		defer f.Close()
		w := json.NewEncoder(f)
		out := []EdgeVisit{}
		for rows.Next() {
			var v EdgeVisit
			if err := rows.Scan(&v.URL, &v.Title, &v.Day, &v.VisitAt, &v.Profile, &v.Duration); err != nil {
				return "", err
			}
			out = append(out, v)
		}
		if err := w.Encode(out); err != nil {
			return "", err
		}
		return path, nil
	}

	path := filepath.Join(destDir, fmt.Sprintf("edge-history-%s.csv", stamp))
	f, err := os.Create(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	f.WriteString("\xEF\xBB\xBF") // BOM so Excel reads UTF-8
	w := csv.NewWriter(f)
	w.Write([]string{"时间", "日期", "标题", "URL", "配置", "停留毫秒"})
	for rows.Next() {
		var url, title, day, profile string
		var at, dur int64
		if err := rows.Scan(&url, &title, &day, &at, &profile, &dur); err != nil {
			return "", err
		}
		w.Write([]string{time.Unix(at, 0).Format("2006-01-02 15:04:05"), day, title, url, profile, fmt.Sprint(dur)})
	}
	w.Flush()
	return path, w.Error()
}

// EdgeClear empties the local archive (and the cursors, so a later extract
// starts fresh).
func (s *ToolkitService) EdgeClear() error {
	if _, err := s.store().DB.Exec(`DELETE FROM edge_history`); err != nil {
		return err
	}
	_, err := s.store().DB.Exec(`DELETE FROM edge_history_meta`)
	return err
}
