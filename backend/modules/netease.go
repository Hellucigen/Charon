// Package modules — NetEase Cloud Music integration on top of MusicService.
// Uses the legacy public web APIs (no login required); VIP-only tracks
// resolve to a placeholder URL and simply won't play.
package modules

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type NeteaseSong struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Artist   string `json:"artist"`
	Album    string `json:"album"`
	Duration int64  `json:"duration"` // ms
}

type NeteasePlaylist struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	TrackCount int    `json:"track_count"`
	Cover      string `json:"cover,omitempty"`
}

var neteaseClient = http.Client{Timeout: 15 * time.Second}

func neteaseGet(path string, out interface{}) error {
	req, _ := http.NewRequest("GET", "https://music.163.com"+path, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
	req.Header.Set("Referer", "https://music.163.com")
	resp, err := neteaseClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err := json.Unmarshal(body, out); err != nil {
		return fmt.Errorf("netease bad response: %w", err)
	}
	return nil
}

// NeteaseSearch searches songs by keyword.
func (s *MusicService) NeteaseSearch(keyword string) ([]NeteaseSong, error) {
	if strings.TrimSpace(keyword) == "" {
		return nil, errRequired("keyword")
	}
	var res struct {
		Code   int `json:"code"`
		Result struct {
			Songs []struct {
				ID      int64  `json:"id"`
				Name    string `json:"name"`
				Artists []struct {
					Name string `json:"name"`
				} `json:"artists"`
				Album struct {
					Name string `json:"name"`
				} `json:"album"`
				Duration int64 `json:"duration"`
			} `json:"songs"`
		} `json:"result"`
	}
	if err := neteaseGet("/api/search/get/web?s="+url.QueryEscape(keyword)+"&type=1&limit=30&offset=0", &res); err != nil {
		return nil, err
	}
	out := []NeteaseSong{}
	for _, sg := range res.Result.Songs {
		artist := ""
		for i, a := range sg.Artists {
			if i > 0 {
				artist += "/"
			}
			artist += a.Name
		}
		out = append(out, NeteaseSong{ID: sg.ID, Name: sg.Name, Artist: artist, Album: sg.Album.Name, Duration: sg.Duration})
	}
	return out, nil
}

// NeteaseSongURL resolves a song to a streamable audio URL (follows the
// outer-url redirect one hop). Empty URL means the track is unavailable.
func (s *MusicService) NeteaseSongURL(songID int64) (string, error) {
	if songID <= 0 {
		return "", errRequired("songID")
	}
	req, _ := http.NewRequest("GET", fmt.Sprintf("https://music.163.com/song/media/outer/url?id=%d.mp3", songID), nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
	resp, err := neteaseClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	final := resp.Request.URL.String()
	if strings.Contains(final, "/404") || resp.StatusCode == 404 {
		return "", nil
	}
	return final, nil
}

// NeteaseUserPlaylists lists a user's public playlists by numeric UID.
func (s *MusicService) NeteaseUserPlaylists(uid string) ([]NeteasePlaylist, error) {
	if strings.TrimSpace(uid) == "" {
		return nil, errRequired("uid")
	}
	var res struct {
		Code      int `json:"code"`
		Playlists []struct {
			ID         int64  `json:"id"`
			Name       string `json:"name"`
			TrackCount int    `json:"trackCount"`
			CoverImg   string `json:"coverImgUrl"`
		} `json:"playlist"`
	}
	if err := neteaseGet("/api/user/playlist/?uid="+url.QueryEscape(uid)+"&limit=40&offset=0", &res); err != nil {
		return nil, err
	}
	out := []NeteasePlaylist{}
	for _, p := range res.Playlists {
		out = append(out, NeteasePlaylist{ID: p.ID, Name: p.Name, TrackCount: p.TrackCount, Cover: p.CoverImg})
	}
	return out, nil
}

// NeteasePlaylist fetches the full track list of one playlist.
func (s *MusicService) NeteasePlaylist(id int64) ([]NeteaseSong, error) {
	if id <= 0 {
		return nil, errRequired("id")
	}
	var res struct {
		Code int `json:"code"`
		Result struct {
			Tracks []struct {
				ID      int64  `json:"id"`
				Name    string `json:"name"`
				Artists []struct {
					Name string `json:"name"`
				} `json:"artists"`
				Album struct {
					Name string `json:"name"`
				} `json:"album"`
				Duration int64 `json:"duration"`
			} `json:"tracks"`
		} `json:"result"`
	}
	if err := neteaseGet(fmt.Sprintf("/api/playlist/detail?id=%d", id), &res); err != nil {
		return nil, err
	}
	out := []NeteaseSong{}
	for _, t := range res.Result.Tracks {
		artist := ""
		for i, a := range t.Artists {
			if i > 0 {
				artist += "/"
			}
			artist += a.Name
		}
		out = append(out, NeteaseSong{ID: t.ID, Name: t.Name, Artist: artist, Album: t.Album.Name, Duration: t.Duration})
	}
	return out, nil
}
