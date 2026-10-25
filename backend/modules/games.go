// Package modules — game sessions: reads the app_usage feed recorded by
// TimeService foreground tracking and aggregates it into game-only stats.
// Known launchers/games are matched by substring; users can add their own
// patterns which are persisted in game_marks.
package modules

import (
	"strconv"

	"personal-terminal/backend/core"
	"personal-terminal/backend/db"
)

type GameService struct{}

func NewGameService() *GameService { return &GameService{} }
func (s *GameService) store() *db.Store { return core.GlobalStore.(*db.Store) }

// Built-in patterns matched (case-insensitive LIKE) against app_name.
var builtinGamePatterns = []string{
	"valorant", "riotclient", "wegame", "steam", "dyinglight",
	"dontstarve", "dst_", "klei", "minecraft", "gta5", "rockstar",
	"socialclub", "mumunxvbox", "mumu", "cloudmusic_game",
}

// GameStats aggregates the last N days of app_usage into per-app and
// per-day totals for processes matching any game pattern.
func (s *GameService) GameStats(days int) (map[string]interface{}, error) {
	if days <= 0 {
		days = 14
	}
	patterns, err := s.allPatterns()
	if err != nil {
		return nil, err
	}
	if len(patterns) == 0 {
		return map[string]interface{}{"total": 0, "by_app": []map[string]interface{}{}, "by_day": []map[string]interface{}{}}, nil
	}
	where := `WHERE (`
	for i := range patterns {
		if i > 0 {
			where += ` OR `
		}
		where += `LOWER(app_name) LIKE ?`
	}
	where += `) AND day >= date('now', ?)`

	args := []interface{}{}
	for _, p := range patterns {
		args = append(args, "%"+p+"%")
	}
	args = append(args, "-"+strconv.Itoa(days)+" days")

	byApp := []map[string]interface{}{}
	rows, err := s.store().DB.Query(`SELECT app_name, SUM(seconds) FROM app_usage `+where+` GROUP BY app_name ORDER BY 2 DESC`, args...)
	if err != nil {
		return nil, err
	}
	var total int64
	for rows.Next() {
		var app string
		var sec int64
		if err := rows.Scan(&app, &sec); err != nil {
			rows.Close()
			return nil, err
		}
		total += sec
		byApp = append(byApp, map[string]interface{}{"app": app, "seconds": sec})
	}
	rows.Close()

	byDay := []map[string]interface{}{}
	rows, err = s.store().DB.Query(`SELECT day, SUM(seconds) FROM app_usage `+where+` GROUP BY day ORDER BY day ASC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var day string
		var sec int64
		if err := rows.Scan(&day, &sec); err != nil {
			return nil, err
		}
		byDay = append(byDay, map[string]interface{}{"day": day, "seconds": sec})
	}
	return map[string]interface{}{"total": total, "by_app": byApp, "by_day": byDay}, nil
}

func (s *GameService) allPatterns() ([]string, error) {
	out := append([]string{}, builtinGamePatterns...)
	rows, err := s.store().DB.Query(`SELECT pattern FROM game_marks`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		if p != "" {
			out = append(out, p)
		}
	}
	return out, nil
}

// Marks / AddMark / DeleteMark manage user-added game patterns.
func (s *GameService) Marks() ([]map[string]interface{}, error) {
	rows, err := s.store().DB.Query(`SELECT id, pattern FROM game_marks ORDER BY rowid DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]interface{}{}
	for rows.Next() {
		var id, p string
		if err := rows.Scan(&id, &p); err != nil {
			return nil, err
		}
		out = append(out, map[string]interface{}{"id": id, "pattern": p})
	}
	return out, nil
}

func (s *GameService) AddMark(pattern string) (map[string]interface{}, error) {
	if pattern == "" {
		return nil, errRequired("pattern")
	}
	id := newID("gm_")
	if _, err := s.store().DB.Exec(`INSERT INTO game_marks(id,pattern) VALUES(?,?)`, id, pattern); err != nil {
		return nil, err
	}
	return map[string]interface{}{"id": id, "pattern": pattern}, nil
}

func (s *GameService) DeleteMark(id string) error {
	_, err := s.store().DB.Exec(`DELETE FROM game_marks WHERE id=?`, id)
	return err
}
