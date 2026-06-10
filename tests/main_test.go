package tests

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/playwright-community/playwright-go"
)

var (
	pw      *playwright.Playwright
	browser playwright.Browser
	server  *httptest.Server
)

func TestMain(m *testing.M) {
	// Install Playwright browsers if needed
	if err := playwright.Install(&playwright.RunOptions{Browsers: []string{"chromium"}}); err != nil {
		panic("could not install playwright: " + err.Error())
	}

	var err error
	pw, err = playwright.Run()
	if err != nil {
		panic("could not start playwright: " + err.Error())
	}

	browser, err = pw.Chromium.Launch(playwright.BrowserTypeLaunchOptions{
		Headless: playwright.Bool(true),
	})
	if err != nil {
		panic("could not launch browser: " + err.Error())
	}

	// Serve the project root (one directory up from tests/)
	server = httptest.NewServer(http.FileServer(http.Dir("..")))

	code := m.Run()

	server.Close()
	browser.Close()
	pw.Stop()
	os.Exit(code)
}

// newPage creates a fresh browser page for a test.
func newPage(t *testing.T) playwright.Page {
	t.Helper()
	page, err := browser.NewPage()
	if err != nil {
		t.Fatalf("could not create page: %v", err)
	}
	t.Cleanup(func() { page.Close() })
	return page
}

// navigateToIndex navigates to the index page and waits for diagram-viewer to be in the DOM.
func navigateToIndex(t *testing.T, page playwright.Page) {
	t.Helper()
	_, err := page.Goto(server.URL+"/index.html", playwright.PageGotoOptions{
		WaitUntil: playwright.WaitUntilStateNetworkidle,
	})
	if err != nil {
		t.Fatalf("could not navigate: %v", err)
	}
	// Wait for diagram-viewer custom element to be defined and rendered
	_, err = page.WaitForFunction(`() => {
		const el = document.querySelector('diagram-viewer');
		return !!(el && el.shadowRoot && el.shadowRoot.querySelector('diagram-canvas'));
	}`, nil, playwright.PageWaitForFunctionOptions{Timeout: playwright.Float(10000)})
	if err != nil {
		t.Fatalf("diagram-viewer did not attach: %v", err)
	}
}

// clearLocalStorage removes all localStorage entries.
func clearLocalStorage(t *testing.T, page playwright.Page) {
	t.Helper()
	_, err := page.Evaluate(`() => localStorage.clear()`)
	if err != nil {
		t.Fatalf("could not clear localStorage: %v", err)
	}
}

// loadFixture loads a JSON fixture file and calls loadData on the viewer.
func loadFixture(t *testing.T, page playwright.Page, path string) {
	t.Helper()
	_, err := page.Evaluate(`async (path) => {
		const resp = await fetch(path);
		const data = await resp.json();
		document.querySelector('diagram-viewer').loadData(data);
	}`, path)
	if err != nil {
		t.Fatalf("could not load fixture %s: %v", path, err)
	}
}

// hoverViewer moves the mouse over the viewer to enable keyboard handling.
func hoverViewer(t *testing.T, page playwright.Page) {
	t.Helper()
	box, err := page.Evaluate(`() => {
		const el = document.querySelector('diagram-viewer');
		const r = el.getBoundingClientRect();
		return {x: r.x + r.width/2, y: r.y + r.height/2};
	}`)
	if err != nil {
		t.Fatalf("could not get viewer bounds: %v", err)
	}
	m := box.(map[string]interface{})
	x := toFloat(m["x"])
	y := toFloat(m["y"])
	page.Mouse().Move(x, y)
}

func toFloat(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	case int64:
		return float64(n)
	default:
		return 0
	}
}

// fixtureManifest returns a minimal v0 manifest JSON string for tests.
func fixtureManifest() string {
	return `{
		"name": "Test",
		"layers": [
			{"id": "overview", "title": "Overview", "path": "index.svg", "type": "layer"},
			{"id": "detail", "title": "Detail", "path": "detail.svg", "type": "layer"}
		]
	}`
}
