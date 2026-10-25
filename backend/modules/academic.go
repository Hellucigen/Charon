// Package modules — academic: courses timetable, assignment deadlines and
// GPA. Assignments due within 48h surface on the Dashboard via Bridge stats.
package modules

import (
	"time"

	"personal-terminal/backend/core"
	"personal-terminal/backend/db"
)

type Course struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Teacher  string  `json:"teacher,omitempty"`
	Location string  `json:"location,omitempty"`
	Day      int     `json:"day"` // 0=Sun .. 6=Sat
	Start    string  `json:"start,omitempty"` // HH:MM
	End      string  `json:"end,omitempty"`   // HH:MM
	Credits  float64 `json:"credits"`
	Score    float64 `json:"score"` // -1 = not graded yet
}

type Assignment struct {
	ID       string `json:"id"`
	CourseID string `json:"course_id,omitempty"`
	Course   string `json:"course,omitempty"` // joined display name
	Title    string `json:"title"`
	DueAt    int64  `json:"due_at"`
	Done     bool   `json:"done"`
	Priority string `json:"priority,omitempty"` // high/normal
	Notes    string `json:"notes,omitempty"`
	CreatedAt int64 `json:"created_at"`
}

type AcademicService struct{}

func NewAcademicService() *AcademicService { return &AcademicService{} }
func (s *AcademicService) store() *db.Store { return core.GlobalStore.(*db.Store) }

// ── courses ────────────────────────────────────────────────────────────

func (s *AcademicService) Courses() ([]Course, error) {
	rows, err := s.store().DB.Query(`SELECT id,name,teacher,location,day,start,end,credits,score FROM academic_courses ORDER BY day,start`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Course{}
	for rows.Next() {
		var c Course
		if err := rows.Scan(&c.ID, &c.Name, &c.Teacher, &c.Location, &c.Day, &c.Start, &c.End, &c.Credits, &c.Score); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, nil
}

func (s *AcademicService) SaveCourse(c Course) (*Course, error) {
	if c.Name == "" {
		return nil, errRequired("name")
	}
	if c.ID == "" {
		c.ID = newID("crs_")
	}
	if _, err := s.store().DB.Exec(
		`INSERT OR REPLACE INTO academic_courses(id,name,teacher,location,day,start,end,credits,score) VALUES(?,?,?,?,?,?,?,?,?)`,
		c.ID, c.Name, c.Teacher, c.Location, c.Day, c.Start, c.End, c.Credits, c.Score); err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *AcademicService) DeleteCourse(id string) error {
	if _, err := s.store().DB.Exec(`DELETE FROM academic_courses WHERE id=?`, id); err != nil {
		return err
	}
	_, err := s.store().DB.Exec(`UPDATE academic_assignments SET course_id='' WHERE course_id=?`, id)
	return err
}

// ── assignments ────────────────────────────────────────────────────────

func (s *AcademicService) Assignments(includeDone bool) ([]Assignment, error) {
	q := `SELECT a.id,COALESCE(a.course_id,''),COALESCE(c.name,''),a.title,a.due_at,a.done,COALESCE(a.priority,''),COALESCE(a.notes,''),a.created_at
		FROM academic_assignments a LEFT JOIN academic_courses c ON c.id=a.course_id`
	if !includeDone {
		q += ` WHERE a.done=0`
	}
	q += ` ORDER BY a.due_at ASC`
	rows, err := s.store().DB.Query(q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Assignment{}
	for rows.Next() {
		var a Assignment
		if err := rows.Scan(&a.ID, &a.CourseID, &a.Course, &a.Title, &a.DueAt, &a.Done, &a.Priority, &a.Notes, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, nil
}

func (s *AcademicService) SaveAssignment(a Assignment) (*Assignment, error) {
	if a.Title == "" {
		return nil, errRequired("title")
	}
	if a.ID == "" {
		a.ID = newID("asg_")
	}
	if a.CreatedAt == 0 {
		a.CreatedAt = time.Now().Unix()
	}
	if _, err := s.store().DB.Exec(
		`INSERT OR REPLACE INTO academic_assignments(id,course_id,title,due_at,done,priority,notes,created_at) VALUES(?,?,?,?,?,?,?,?)`,
		a.ID, a.CourseID, a.Title, a.DueAt, a.Done, a.Priority, a.Notes, a.CreatedAt); err != nil {
		return nil, err
	}
	return &a, nil
}

// ToggleAssignment flips done state and awards a little XP on completion.
func (s *AcademicService) ToggleAssignment(id string) (bool, error) {
	var done bool
	if err := s.store().DB.QueryRow(`SELECT done FROM academic_assignments WHERE id=?`, id).Scan(&done); err != nil {
		return false, err
	}
	done = !done
	if _, err := s.store().DB.Exec(`UPDATE academic_assignments SET done=? WHERE id=?`, done, id); err != nil {
		return false, err
	}
	if done {
		awardXP(10, "assignment", "intellect")
	}
	return done, nil
}

func (s *AcademicService) DeleteAssignment(id string) error {
	_, err := s.store().DB.Exec(`DELETE FROM academic_assignments WHERE id=?`, id)
	return err
}

// GPA returns the credit-weighted average score and a 4.0-scale GPA over
// graded courses (score >= 0).
func (s *AcademicService) GPA() (map[string]interface{}, error) {
	rows, err := s.store().DB.Query(`SELECT credits, score FROM academic_courses WHERE score >= 0 AND credits > 0`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var sumCred, sumWeighted, sumGPA float64
	var graded int
	for rows.Next() {
		var cred, score float64
		if err := rows.Scan(&cred, &score); err != nil {
			return nil, err
		}
		sumCred += cred
		sumWeighted += score * cred
		sumGPA += cred * scoreToGPA40(score)
		graded++
	}
	if sumCred == 0 {
		return map[string]interface{}{"avg": 0, "gpa4": 0, "graded": 0}, nil
	}
	return map[string]interface{}{
		"avg":    sumWeighted / sumCred,
		"gpa4":   sumGPA / sumCred,
		"graded": graded,
	}, nil
}

// scoreToGPA40 converts a percentage score to the common 4.0 scale.
func scoreToGPA40(s float64) float64 {
	switch {
	case s >= 90: return 4.0
	case s >= 85: return 3.7
	case s >= 82: return 3.3
	case s >= 78: return 3.0
	case s >= 75: return 2.7
	case s >= 72: return 2.3
	case s >= 68: return 2.0
	case s >= 64: return 1.5
	case s >= 60: return 1.0
	default: return 0
	}
}
