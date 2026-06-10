package tests

import (
	"testing"
)

func TestNavTree_ClickUpdatesIframeSrcAndHash(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)
	loadFixture(t, page, "examples/kubernetes/manifest.json")

	result, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const sr = viewer.shadowRoot;
		const tree = sr.querySelector('diagram-nav-tree');
		const items = tree.shadowRoot.querySelectorAll('.nav-item');
		if (items.length < 2) return {error: 'not enough items'};
		const targetId = items[1].dataset.id;
		items[1].click();
		return {
			hash: location.hash,
			targetId,
			hasActive: items[1].classList.contains('active'),
		};
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	m := result.(map[string]interface{})
	targetId := m["targetId"].(string)
	if m["hash"].(string) != "#"+targetId {
		t.Fatalf("expected hash #%s, got %s", targetId, m["hash"])
	}
	if m["hasActive"] != true {
		t.Fatal("clicked item should have active class")
	}
}

func TestNavTree_ExpandCollapseToggles(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)
	loadFixture(t, page, "examples/kubernetes/manifest.json")

	result, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const tree = viewer.shadowRoot.querySelector('diagram-nav-tree');
		const toggle = tree.shadowRoot.querySelector('.nav-toggle:not(.no-children)');
		if (!toggle) return {error: 'no expandable items'};
		const childContainer = toggle.closest('.nav-group').querySelector('.nav-children');
		if (!childContainer) return {error: 'no children container'};
		const wasBefore = childContainer.classList.contains('collapsed');
		toggle.click();
		const isAfter = childContainer.classList.contains('collapsed');
		return {toggled: wasBefore !== isAfter};
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	m := result.(map[string]interface{})
	if m["toggled"] != true {
		t.Fatal("expand/collapse toggle did not change state")
	}
}

func TestNavTree_SidebarCollapseAndToggle(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)
	loadFixture(t, page, "examples/kubernetes/manifest.json")

	result, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const sr = viewer.shadowRoot;
		const container = sr.querySelector('.container');
		const tree = sr.querySelector('diagram-nav-tree');

		// Click collapse button in nav-tree
		tree.shadowRoot.querySelector('.sidebar-collapse-btn').click();
		const collapsed = container.classList.contains('sidebar-collapsed');

		// Click toggle button to re-open
		sr.querySelector('.sidebar-toggle').click();
		const reopened = !container.classList.contains('sidebar-collapsed');

		return {collapsed, reopened};
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	m := result.(map[string]interface{})
	if m["collapsed"] != true {
		t.Fatal("sidebar did not collapse")
	}
	if m["reopened"] != true {
		t.Fatal("sidebar did not reopen after toggle")
	}
}

func TestNavTree_ResizeHandleChangesWidth(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)
	loadFixture(t, page, "examples/kubernetes/manifest.json")

	result, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const sr = viewer.shadowRoot;
		const container = sr.querySelector('.container');
		const handle = sr.querySelector('.resize-handle');

		// Simulate mousedown + mousemove + mouseup
		const rect = handle.getBoundingClientRect();
		const startX = rect.left + rect.width / 2;
		const startY = rect.top + rect.height / 2;

		handle.dispatchEvent(new MouseEvent('mousedown', {clientX: startX, clientY: startY, bubbles: true}));
		document.dispatchEvent(new MouseEvent('mousemove', {clientX: startX + 50, clientY: startY, bubbles: true}));
		document.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));

		const cols = container.style.gridTemplateColumns;
		return {hasCustomWidth: cols !== '' && cols.includes('px')};
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	m := result.(map[string]interface{})
	if m["hasCustomWidth"] != true {
		t.Fatal("resize handle did not update sidebar width")
	}
}

func TestNavTree_KeyboardNavigation(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)
	loadFixture(t, page, "examples/kubernetes/manifest.json")

	// Enable keyboard handling
	hoverViewer(t, page)

	// Get initial hash
	initial, _ := page.Evaluate(`() => location.hash`)

	// Press ArrowDown to go to next slide
	page.Keyboard().Press("ArrowDown")

	after, _ := page.Evaluate(`() => location.hash`)

	if initial == after {
		t.Fatal("ArrowDown did not advance to next slide")
	}

	// Press Home to go to first
	page.Keyboard().Press("Home")
	home, _ := page.Evaluate(`() => location.hash`)
	if home.(string) != "#overview" {
		t.Fatalf("Home did not go to first slide, got %s", home)
	}

	// Press End to go to last
	page.Keyboard().Press("End")
	end, _ := page.Evaluate(`() => location.hash`)
	if end == home {
		t.Fatal("End did not navigate to last slide")
	}
}
